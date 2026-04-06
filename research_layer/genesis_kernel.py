from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .io import append_jsonl, ensure_dir, load_json, load_yaml, write_json
from .message_queue import AtomicFileWriter
from .registry import LineageRegistry, new_id, utc_now


class GenesisKernel:
    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root
        self.registry = LineageRegistry(repo_root)
        self.config = load_yaml(repo_root / "configs" / "genesis-kernel.yaml")["genesis_kernel"]
        self.founders = load_yaml(repo_root / "registry" / "founder-lineages.yaml")["founder_lineages"]
        self.accounts_path = repo_root / "registry" / "genesis-accounts.json"
        self.events_path = repo_root / "registry" / "genesis-events.jsonl"
        self._accounts_writer = AtomicFileWriter(self.accounts_path)
        ensure_dir(self.accounts_path.parent)

    def _founder_map(self) -> dict[str, dict[str, Any]]:
        return {founder["id"]: founder for founder in self.founders}

    def _default_balances(self) -> dict[str, float]:
        return {key: float(value) for key, value in self.config["balances"]["founder_seed"].items()}

    def _load_accounts(self) -> dict[str, Any]:
        if not self.accounts_path.exists():
            return {"accounts": {}}
        try:
            payload = load_json(self.accounts_path)
            return payload if isinstance(payload, dict) else {"accounts": {}}
        except (json.JSONDecodeError, OSError):
            # AtomicFileWriter rename 瞬间可能读到不完整内容，返回空兜底
            return {"accounts": {}}

    def _save_accounts(self, payload: dict[str, Any]) -> None:
        self._accounts_writer.write_json(payload)

    def bootstrap_accounts(self) -> dict[str, Any]:
        payload = self._load_accounts()
        accounts = payload.setdefault("accounts", {})
        for founder in self.founders:
            lineage_id = founder["id"]
            record = self.registry.load_record(lineage_id) if self.registry.record_exists(lineage_id) else None
            account = accounts.setdefault(
                lineage_id,
                {
                    "lineage_id": lineage_id,
                    "founder_origin": lineage_id.removesuffix("_founder"),
                    "balances": self._default_balances(),
                    "metrics": {
                        "events_survived": 0,
                        "collective_response_score": 0.0,
                        "proactive_forage_score": 0.0,
                        "benchmark_passes": 0,
                        "benchmark_failures": 0,
                        "spawn_budget_grants": 0,
                    },
                    "state_machine": {
                        "stage": record.get("state", "founder") if record else "founder",
                        "vitality": record.get("ecology_state", "active") if record else "active",
                        "spawn_right": "seeded",
                        "last_transition": "bootstrapped",
                    },
                    "last_event_at": None,
                    "last_benchmark_verdict_id": None,
                },
            )
            if record:
                account.setdefault("state_machine", {})
                account["state_machine"]["stage"] = record.get("state", account["state_machine"].get("stage", "founder"))
                account["state_machine"]["vitality"] = record.get("ecology_state", account["state_machine"].get("vitality", "active"))
                account["state_machine"].setdefault("spawn_right", "seeded")
                account["state_machine"].setdefault("last_transition", "bootstrapped")
            self._update_state_machine(
                account,
                vitality=account["state_machine"].get("vitality", "active"),
                transition=account["state_machine"].get("last_transition", "bootstrapped"),
            )
        self._save_accounts(payload)
        return payload

    def _account_for(self, lineage_id: str) -> dict[str, Any]:
        payload = self.bootstrap_accounts()
        accounts = payload["accounts"]
        if lineage_id not in accounts:
            founder_origin = self.registry.founder_origin_from_lineage(lineage_id)
            accounts[lineage_id] = {
                "lineage_id": lineage_id,
                "founder_origin": founder_origin,
                "balances": self._default_balances(),
                "metrics": {
                    "events_survived": 0,
                    "collective_response_score": 0.0,
                    "proactive_forage_score": 0.0,
                    "benchmark_passes": 0,
                    "benchmark_failures": 0,
                    "spawn_budget_grants": 0,
                },
                "state_machine": {
                    "stage": "worker",
                    "vitality": "active",
                    "spawn_right": "locked",
                    "last_transition": "spawned",
                },
                "last_event_at": None,
                "last_benchmark_verdict_id": None,
            }
            self._save_accounts(payload)
        return accounts[lineage_id]

    def _write_back_account(self, account: dict[str, Any]) -> None:
        payload = self._load_accounts()
        payload.setdefault("accounts", {})[account["lineage_id"]] = account
        self._save_accounts(payload)

    def _append_event(self, event: dict[str, Any]) -> None:
        append_jsonl(self.events_path, event)

    def _privilege_cost(self, run: dict[str, Any], verdict: dict[str, Any]) -> float:
        privilege_cfg = self.config["privilege_tax"]
        runtime_cost = float(privilege_cfg["runtime"].get(run.get("runtime_path", ""), 0.0))
        sandbox_cost = float(privilege_cfg["sandbox_profile"].get(run.get("sandbox_profile", ""), 0.0))
        unsandboxed_agents = []
        lab_manifest_ref = run.get("lab_manifest_ref")
        if lab_manifest_ref:
            path = self.repo_root / lab_manifest_ref
            if path.exists():
                manifest = load_json(path)
                unsandboxed_agents = manifest.get("unsandboxed_agents", [])
        unsandboxed_cost = float(privilege_cfg["unsandboxed_bonus_tax"]) if run.get("openclaw_agent_id") in unsandboxed_agents else 0.0
        return round(runtime_cost + sandbox_cost + unsandboxed_cost, 3)

    def _collective_signal_bonus(self, verdict: dict[str, Any]) -> float:
        signals = verdict.get("ecology_recommendation", {}).get("environment_inputs", [])
        collective_kinds = set(self.config["event_model"]["workflow_disaster_kinds"])
        if any(signal in collective_kinds for signal in signals):
            return float(self.config["benchmark_rewards"]["collective_signal_bonus"])
        return 0.0

    def _apply_thresholds(self, lineage_id: str, survival_credit: float) -> str:
        thresholds = self.config["thresholds"]
        if survival_credit <= float(thresholds["extinct_below"]):
            state = "extinct"
        elif survival_credit <= float(thresholds["dormant_below"]):
            state = "dormant"
        elif survival_credit <= float(thresholds["stressed_below"]):
            state = "stressed"
        else:
            state = "active"
        self.registry.update_ecology_state(
            lineage_id,
            state,
            f"Genesis kernel adjusted ecology state to {state} from survival_credit={survival_credit:.2f}.",
            authority_id="system.genesis",
        )
        return state

    def _sync_stage_from_registry(self, account: dict[str, Any], lineage_id: str) -> None:
        if self.registry.record_exists(lineage_id):
            record = self.registry.load_record(lineage_id)
            account["state_machine"]["stage"] = record.get("state", account["state_machine"]["stage"])

    def _update_state_machine(
        self,
        account: dict[str, Any],
        *,
        vitality: str | None = None,
        transition: str | None = None,
    ) -> None:
        state_cfg = self.config["state_machine"]
        balances = account["balances"]
        account["state_machine"]["vitality"] = vitality or account["state_machine"].get("vitality", "active")
        self._sync_stage_from_registry(account, account["lineage_id"])
        stage = account["state_machine"]["stage"]
        expansion_credit = float(balances["expansion_credit"])
        survival_credit = float(balances["survival_credit"])
        spawn_right = "locked"
        if account["state_machine"]["vitality"] == "extinct" or stage == "retired":
            spawn_right = "revoked"
        elif survival_credit <= float(state_cfg["exhausted_below"]):
            spawn_right = "exhausted"
        elif stage == "canon" and expansion_credit >= float(state_cfg["canon_spawn_threshold"]):
            spawn_right = "canon_ready"
        elif expansion_credit >= float(state_cfg["spawn_readiness_threshold"]):
            spawn_right = "ready"
        elif stage == "founder":
            spawn_right = "seeded"
        account["state_machine"]["spawn_right"] = spawn_right
        if transition:
            account["state_machine"]["last_transition"] = transition

    def apply_benchmark_verdict(self, run: dict[str, Any], verdict: dict[str, Any]) -> dict[str, Any]:
        account = self._account_for(run["lineage_id"])
        rewards = self.config["benchmark_rewards"]
        privilege_cost = self._privilege_cost(run, verdict)
        user_value = float(verdict.get("user_value_score", 0.0))
        evolution = float(verdict.get("evolution_score", 0.0))
        ecological_fitness = float(verdict.get("ecological_fitness", 0.0))
        artifact_quality = float(verdict.get("artifact_analysis", {}).get("quality_score", 0.0))
        public_gain = user_value * float(rewards["public_value_multiplier"]) + self._collective_signal_bonus(verdict)
        private_gain = user_value * float(rewards["private_value_multiplier"])
        if run.get("dispatch_mode") == "proactive_forage":
            private_gain += float(rewards["proactive_private_bonus"])
        novelty_gain = evolution * float(rewards["novelty_multiplier"])
        reuse_gain = artifact_quality * float(rewards["reuse_multiplier"])
        failure_penalty = 0.0
        expansion_bonus = 0.0
        promotion = verdict.get("promotion_recommendation")
        if verdict.get("verdict") == "pass":
            account["metrics"]["benchmark_passes"] += 1
            if promotion == "promote_candidate":
                expansion_bonus += float(rewards["promote_candidate_bonus"])
            elif promotion == "promote_canon":
                expansion_bonus += float(rewards["promote_canon_bonus"])
        else:
            account["metrics"]["benchmark_failures"] += 1
            failure_penalty = float(rewards["failed_run_penalty"])
        survival_delta = round(public_gain + private_gain + ecological_fitness * 0.30 - privilege_cost - failure_penalty, 3)
        expansion_delta = round(novelty_gain + reuse_gain + expansion_bonus - privilege_cost * 0.5 - failure_penalty * 0.5, 3)

        balances = account["balances"]
        balances["public_value"] = round(float(balances["public_value"]) + public_gain, 3)
        balances["private_value"] = round(float(balances["private_value"]) + private_gain, 3)
        balances["novelty_credit"] = round(float(balances["novelty_credit"]) + novelty_gain, 3)
        balances["reuse_credit"] = round(float(balances["reuse_credit"]) + reuse_gain, 3)
        balances["privilege_cost"] = round(float(balances["privilege_cost"]) + privilege_cost, 3)
        balances["failure_debt"] = round(float(balances["failure_debt"]) + failure_penalty, 3)
        balances["survival_credit"] = round(float(balances["survival_credit"]) + survival_delta, 3)
        balances["expansion_credit"] = round(float(balances["expansion_credit"]) + expansion_delta, 3)

        account["metrics"]["collective_response_score"] = round(
            float(account["metrics"]["collective_response_score"]) + public_gain,
            3,
        )
        if run.get("dispatch_mode") == "proactive_forage":
            account["metrics"]["proactive_forage_score"] = round(
                float(account["metrics"]["proactive_forage_score"]) + private_gain,
                3,
            )
        if balances["expansion_credit"] >= 1.6:
            account["metrics"]["spawn_budget_grants"] += 1
        account["last_benchmark_verdict_id"] = verdict.get("verdict_id")
        account["last_event_at"] = utc_now()
        ecology_state = self._apply_thresholds(account["lineage_id"], balances["survival_credit"])
        self._update_state_machine(
            account,
            vitality=ecology_state,
            transition=f"benchmark::{promotion or verdict.get('verdict')}",
        )
        self._write_back_account(account)

        event = {
            "event_id": new_id("gev"),
            "event_type": "benchmark_credit_applied",
            "lineage_id": run["lineage_id"],
            "run_id": run["run_id"],
            "benchmark_verdict_id": verdict.get("verdict_id"),
            "timestamp": utc_now(),
            "delta": {
                "public_value": round(public_gain, 3),
                "private_value": round(private_gain, 3),
                "novelty_credit": round(novelty_gain, 3),
                "reuse_credit": round(reuse_gain, 3),
                "privilege_cost": round(privilege_cost, 3),
                "failure_debt": round(failure_penalty, 3),
                "survival_credit": survival_delta,
                "expansion_credit": expansion_delta,
            },
            "ecology_state": ecology_state,
        }
        self._append_event(event)
        return event

    def apply_forage_dispatch(self, forage_payload: dict[str, Any], dispatch_payload: dict[str, Any]) -> dict[str, Any]:
        payload = self.bootstrap_accounts()
        rewards = self.config["forage_rewards"]
        candidates = {candidate["lineage_id"]: candidate for candidate in forage_payload.get("candidates", [])}
        execution_index: dict[str, dict[str, Any]] = {}
        for dispatch in dispatch_payload.get("dispatches", []):
            execution_index[dispatch["lineage_id"]] = dispatch

        allocations: list[dict[str, Any]] = []
        for lineage_id, candidate in candidates.items():
            account = payload["accounts"].get(lineage_id)
            if not account:
                continue
            dispatch = execution_index.get(lineage_id, {})
            executed_runs = dispatch.get("executed_runs", [])
            benchmarked_runs = sum(1 for run in executed_runs if run.get("benchmark_verdict"))
            private_delta = (
                float(rewards["candidate_private_gain"])
                + float(candidate.get("alignment_signal", 0.0)) * float(rewards["alignment_multiplier"])
                + float(candidate.get("pressure_level", 0.0)) * float(rewards["pressure_multiplier"])
                + len(executed_runs) * float(rewards["execution_bonus"])
                + benchmarked_runs * float(rewards["benchmark_bonus"])
            )
            expansion_delta = float(rewards["candidate_expansion_gain"]) + benchmarked_runs * 0.03
            account["balances"]["private_value"] = round(float(account["balances"]["private_value"]) + private_delta, 3)
            account["balances"]["survival_credit"] = round(float(account["balances"]["survival_credit"]) + private_delta * 0.55, 3)
            account["balances"]["expansion_credit"] = round(float(account["balances"]["expansion_credit"]) + expansion_delta, 3)
            account["metrics"]["proactive_forage_score"] = round(
                float(account["metrics"]["proactive_forage_score"]) + private_delta,
                3,
            )
            vitality = self._apply_thresholds(lineage_id, float(account["balances"]["survival_credit"]))
            self._update_state_machine(account, vitality=vitality, transition=f"forage::{candidate.get('trigger_reason', 'unknown')}")
            if account["state_machine"]["spawn_right"] in {"ready", "canon_ready"}:
                account["metrics"]["spawn_budget_grants"] += 1
            account["last_event_at"] = utc_now()
            allocations.append(
                {
                    "lineage_id": lineage_id,
                    "private_value_delta": round(private_delta, 3),
                    "expansion_credit_delta": round(expansion_delta, 3),
                    "executed_runs": len(executed_runs),
                    "benchmarked_runs": benchmarked_runs,
                    "spawn_right": account["state_machine"]["spawn_right"],
                }
            )
        self._save_accounts(payload)
        event = {
            "event_id": new_id("gev"),
            "event_type": "forage_credit_applied",
            "timestamp": utc_now(),
            "environment_ref": forage_payload.get("environment_ref"),
            "candidate_count": len(candidates),
            "dispatch_count": dispatch_payload.get("dispatch_count", 0),
            "allocations": allocations,
        }
        self._append_event(event)
        return event

    def apply_environment_event(
        self,
        *,
        kind: str,
        intensity: float,
        summary: str,
        source_ref: str | None = None,
        collective: bool | None = None,
    ) -> dict[str, Any]:
        collective_mode = self.config["event_model"]["default_collective"] if collective is None else collective
        weights = self.config["event_model"]["founder_response_weights"]
        payload = self.bootstrap_accounts()
        founder_records = [record for record in self.registry.bootstrap_founders() if not record.get("parent_lineage_id")]
        allocations: list[dict[str, Any]] = []
        for record in founder_records:
            if record.get("ecology_state") == "extinct":
                continue
            founder_origin = record["founder_origin"]
            weight = float(weights.get(founder_origin, {}).get(kind, 0.55 if collective_mode else 0.30))
            account = payload["accounts"][record["lineage_id"]]
            public_delta = round(intensity * weight * (0.22 if collective_mode else 0.08), 3)
            expansion_delta = round(intensity * weight * 0.10, 3)
            account["balances"]["public_value"] = round(float(account["balances"]["public_value"]) + public_delta, 3)
            account["balances"]["expansion_credit"] = round(float(account["balances"]["expansion_credit"]) + expansion_delta, 3)
            account["metrics"]["events_survived"] += 1
            account["last_event_at"] = utc_now()
            self._update_state_machine(
                account,
                vitality=record.get("ecology_state", "active"),
                transition=f"environment::{kind}",
            )
            if account["state_machine"]["spawn_right"] in {"ready", "canon_ready"}:
                account["metrics"]["spawn_budget_grants"] += 1
            allocations.append(
                {
                    "lineage_id": record["lineage_id"],
                    "response_weight": weight,
                    "public_value_delta": public_delta,
                    "expansion_credit_delta": expansion_delta,
                }
            )
        self._save_accounts(payload)
        event = {
            "event_id": new_id("gev"),
            "event_type": "environment_event",
            "kind": kind,
            "intensity": round(float(intensity), 3),
            "collective": collective_mode,
            "summary": summary,
            "source_ref": source_ref,
            "timestamp": utc_now(),
            "allocations": allocations,
        }
        self._append_event(event)
        return event

    def report(self) -> dict[str, Any]:
        payload = self.bootstrap_accounts()
        accounts = list(payload["accounts"].values())
        leaderboard = sorted(
            accounts,
            key=lambda account: (
                float(account["balances"]["survival_credit"]) + float(account["balances"]["expansion_credit"])
            ),
            reverse=True,
        )[:8]
        genesis_events: list[dict[str, Any]] = []
        if self.events_path.exists():
            for line in self.events_path.read_text(encoding="utf-8", errors="ignore").splitlines()[-10:]:
                try:
                    genesis_events.append(load_json_from_line(line))
                except ValueError:
                    continue
        return {
            "account_count": len(accounts),
            "leaderboard": [
                {
                    "lineage_id": account["lineage_id"],
                    "survival_credit": account["balances"]["survival_credit"],
                    "expansion_credit": account["balances"]["expansion_credit"],
                    "public_value": account["balances"]["public_value"],
                    "private_value": account["balances"]["private_value"],
                    "privilege_cost": account["balances"]["privilege_cost"],
                    "spawn_right": account["state_machine"]["spawn_right"],
                    "stage": account["state_machine"]["stage"],
                    "vitality": account["state_machine"]["vitality"],
                }
                for account in leaderboard
            ],
            "recent_events": genesis_events,
        }


def load_json_from_line(line: str) -> dict[str, Any]:
    import json

    payload = json.loads(line)
    if not isinstance(payload, dict):
        raise ValueError("expected object")
    return payload
