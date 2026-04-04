@echo off
setlocal
cd /d "%~dp0.."
set "OPENCLAW_GENESIS_USER_PROFILE_PATH=C:\Users\Administrator\Documents\New project\USER.md"
corepack pnpm genesis:heartbeat -- --trigger heartbeat --state-dir "%USERPROFILE%\.openclaw"
