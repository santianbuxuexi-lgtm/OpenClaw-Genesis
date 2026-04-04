# OpenClaw-Genesis

`OpenClaw-Genesis` is the Genesis distribution layer extracted from our integration workspace.

This repository intentionally keeps only Genesis-specific code, scripts, and docs:

- Genesis bootstrap/runtime entrypoints
- Genesis heartbeat entrypoint
- Genesis QQ / routing helpers
- Genesis kernel code
- Genesis deployment and reconnect docs
- Genesis-only operational scripts

It does **not** carry the full OpenClaw monorepo source tree.

## Structure

- `openclaw-genesis.mjs`
- `openclaw-genesis-bootstrap.mjs`
- `openclaw-genesis-heartbeat.mjs`
- `src/genesis/`
- `scripts/`
- `docs/zh-CN/install/`

## Positioning

This repo is the public Genesis layer.

OpenClaw remains the underlying runtime dependency for:

- gateway
- channels
- model runtime
- skills
- plugin loading

Genesis adds:

- founder coordination
- proactive work
- lineage / replication state
- heartbeat-driven labor
- Genesis-specific QQ routing
- external execution orchestration

## Notes

- This repository is meant to stay compact and Genesis-focused.
- OpenClaw base source should stay outside this public repo.
- Integration and deep runtime debugging can continue in the private/full integration workspace.
