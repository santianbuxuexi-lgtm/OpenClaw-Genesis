# Open-Genesis

`Open-Genesis` is an agent colony framework centered on coordination, replication, and proactive work.

It is designed around a simple idea:

- one coordinator receives pressure, goals, and user intent
- multiple founders take on distinct roles
- work is organized, executed, reviewed, and accumulated as live state
- replication is earned through real task completion rather than simulated numbers

## What Genesis Is

Genesis is not a single chatbot with extra prompts.

It is a multi-founder execution layer with its own:

- coordination model
- founder roles
- replication and lineage state
- proactive work ledger
- heartbeat-driven activity
- QQ-facing entrypoints
- external execution hooks

The current founder set is:

- `negotiator`: coordination and task intake
- `scout`: search, signal gathering, hotspot discovery
- `creator`: synthesis, drafting, outward-facing content
- `auditor`: verification, risk control, duplication control
- `builder`: tools, skills, runtime plumbing, execution support

## What Genesis Tries To Do

Genesis is built to make an agent system feel alive in three ways:

1. It should coordinate rather than answer mechanically.
2. It should work proactively under pressure rather than wait passively.
3. It should expand through real completed work rather than fake “growth”.

In practice, that means Genesis is meant to:

- organize founder collaboration for a user request
- maintain live state about current work and recent output
- react to climate pressure, survival pressure, and user intent
- drive heartbeat-based work cycles
- support outward-facing execution such as research, summaries, and publishing workflows

## Repository Scope

This public repository intentionally keeps only Genesis-focused material:

- Genesis runtime entrypoints
- Genesis bootstrap files
- Genesis heartbeat entrypoint
- Genesis kernel code
- Genesis QQ helpers and routing scripts
- Genesis installation and deployment docs
- Genesis operational scripts

It intentionally does **not** include the full upstream runtime source tree.

## Structure

- `openclaw-genesis.mjs`
- `openclaw-genesis-bootstrap.mjs`
- `openclaw-genesis-heartbeat.mjs`
- `src/genesis/`
- `scripts/`
- `docs/zh-CN/install/`

## Runtime Shape

```text
User / QQ
  -> Genesis entry
     -> negotiator
        -> founder coordination
           -> scout / creator / auditor / builder
              -> live state / output / replication
```

## Current Direction

The project is being shaped toward:

- a dedicated Genesis entry channel
- founder-led coordination instead of template replies
- unified live state for lineage, proactive work, and accounts
- replication that follows real completion
- cleaner public packaging for Genesis as its own identity

## Dependency Note

Genesis runs on top of an underlying runtime stack for channels, models, skills, and gateway infrastructure.

That dependency is kept outside this public repository so this repo can stay focused on Genesis itself.
