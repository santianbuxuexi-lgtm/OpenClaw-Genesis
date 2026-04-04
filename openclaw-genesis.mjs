#!/usr/bin/env node

import { ensureGenesisDistributionBootstrap } from "./openclaw-genesis-bootstrap.mjs";

ensureGenesisDistributionBootstrap();

await import("./openclaw.mjs");
