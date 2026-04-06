param(
  [string]$SshHost = "82.156.206.162",
  [string]$SshUser = "root",
  [string]$SshKeyPath = "",
  [string]$RepoDir = "/opt/openclaw-genesis",
  [string]$RepoUrl = "git@github.com:santianbuxuexi-lgtm/Open-Genesis.git",
  [string]$Branch = "main",
  [string]$StateDir = "/root/.openclaw-genesis",
  [string]$GatewayService = "openclaw-genesis-gateway",
  [bool]$RecloneIfNeeded = $true,
  [switch]$SkipInstall,
  [switch]$SkipRestart,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Quote-BashLiteral {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains("'")) {
    throw "Bash literal value contains single quote and is not supported by this script: $Value"
  }
  return "'" + $Value + "'"
}

function New-SshOptionArgs {
  $args = @(
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=20"
  )
  if ($SshKeyPath -and $SshKeyPath.Trim()) {
    $args += @("-i", $SshKeyPath)
  }
  return $args
}

function Invoke-RemoteStep {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Script
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan

  if ($DryRun) {
    Write-Host $Script -ForegroundColor DarkGray
    return
  }

  if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
    throw "scp command not found on this machine."
  }

  $localTempFile = [System.IO.Path]::GetTempFileName()
  $remoteTempFile = "/tmp/genesis-oneclick-$([Guid]::NewGuid().ToString('N')).sh"
  [System.IO.File]::WriteAllText($localTempFile, $Script, [System.Text.UTF8Encoding]::new($false))

  $sshOptions = New-SshOptionArgs
  $scpArgs = @()
  $scpArgs += $sshOptions
  $scpArgs += @($localTempFile, "$SshUser@$SshHost`:$remoteTempFile")

  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $null = & scp @scpArgs 2>&1
    $sshRunArgs = @()
    $sshRunArgs += $sshOptions
    $sshRunArgs += "$SshUser@$SshHost"
    $sshRunArgs += "bash -e $remoteTempFile"
    $output = & ssh @sshRunArgs 2>&1
  } finally {
    try {
      $sshCleanupArgs = @()
      $sshCleanupArgs += $sshOptions
      $sshCleanupArgs += "$SshUser@$SshHost"
      $sshCleanupArgs += "rm -f $remoteTempFile"
      $null = & ssh @sshCleanupArgs 2>&1
    } catch {
    }
    Remove-Item -Path $localTempFile -ErrorAction SilentlyContinue
    $ErrorActionPreference = $oldEap
  }
  $exitCode = $LASTEXITCODE
  if ($output) {
    $output | ForEach-Object { Write-Host $_ }
  }
  if ($exitCode -ne 0) {
    throw "Remote step failed: $Title (exit code: $exitCode)"
  }
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "ssh command not found on this machine."
}

$qRepoDir = Quote-BashLiteral -Value $RepoDir
$qRepoUrl = Quote-BashLiteral -Value $RepoUrl
$qBranch = Quote-BashLiteral -Value $Branch
$qStateDir = Quote-BashLiteral -Value $StateDir
$qGatewayService = Quote-BashLiteral -Value $GatewayService
$recloneFlag = if ($RecloneIfNeeded) { "1" } else { "0" }

$preflightScript = @'
set -euo pipefail
echo "host: $(hostname)"
echo "time: $(date '+%F %T %Z')"
echo "user: $(whoami)"
command -v git >/dev/null
command -v node >/dev/null
command -v pnpm >/dev/null
GITHUB_SSH_OUT="$(ssh -T -o BatchMode=yes -o ConnectTimeout=15 git@github.com 2>&1 || true)"
echo "$GITHUB_SSH_OUT" | sed -n '1,2p'
echo "$GITHUB_SSH_OUT" | grep -q "successfully authenticated"
'@

$pullTemplate = @'
set -euo pipefail
REPO_DIR=__REPO_DIR__
REPO_URL=__REPO_URL__
BRANCH=__BRANCH__
ALLOW_RECLONE=__ALLOW_RECLONE__

if [ -d "$REPO_DIR/.git" ]; then
  cd "$REPO_DIR"
  git fetch --all --prune
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  echo "repo: updated ($REPO_DIR @ $BRANCH)"
  exit 0
fi

if [ "$ALLOW_RECLONE" != "1" ]; then
  echo "repo is not a git checkout and RecloneIfNeeded=false: $REPO_DIR" >&2
  exit 2
fi

ts="$(date '+%Y%m%d-%H%M%S')"
if [ -d "$REPO_DIR" ] && [ -n "$(ls -A "$REPO_DIR" 2>/dev/null || true)" ]; then
  mv "$REPO_DIR" "${REPO_DIR}.bak-$ts"
fi
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
echo "repo: cloned ($REPO_URL -> $REPO_DIR @ $BRANCH)"
'@
$pullScript = $pullTemplate.
  Replace("__REPO_DIR__", $qRepoDir).
  Replace("__REPO_URL__", $qRepoUrl).
  Replace("__BRANCH__", $qBranch).
  Replace("__ALLOW_RECLONE__", $recloneFlag)

$installTemplate = @'
set -euo pipefail
REPO_DIR=__REPO_DIR__
STATE_DIR=__STATE_DIR__
cd "$REPO_DIR"
export OPENCLAW_STATE_DIR="$STATE_DIR"

if [ -f scripts/genesis-core-tech-install.ts ] && [ -f scripts/genesis-core-tech-health.ts ]; then
  pnpm -s tsx scripts/genesis-core-tech-install.ts --continue-on-error true
  pnpm -s tsx scripts/genesis-core-tech-health.ts
else
  echo "[oneclick] core-tech scripts not found; fallback to base install + runtime check"
  if [ -f pnpm-lock.yaml ]; then
    pnpm install --frozen-lockfile || pnpm install
  elif [ -f package.json ]; then
    pnpm install
  fi
  if [ -f openclaw-genesis.mjs ]; then
    node openclaw-genesis.mjs --help >/dev/null 2>&1 || true
  fi
  echo '{"ok":true,"mode":"fallback","coreTech":"skipped-in-this-branch"}'
fi
'@
$installScript = $installTemplate.
  Replace("__REPO_DIR__", $qRepoDir).
  Replace("__STATE_DIR__", $qStateDir)

$restartTemplate = @'
set -euo pipefail
SERVICE_NAME=__SERVICE_NAME__
systemctl --user daemon-reload
systemctl --user restart "$SERVICE_NAME"
systemctl --user is-active "$SERVICE_NAME"
systemctl --user status "$SERVICE_NAME" --no-pager -l | sed -n '1,60p'
'@
$restartScript = $restartTemplate.Replace("__SERVICE_NAME__", $qGatewayService)

Invoke-RemoteStep -Title "Preflight (SSH/GitHub/Node/pnpm)" -Script $preflightScript
Invoke-RemoteStep -Title "Git pull/clone from GitHub" -Script $pullScript

if (-not $SkipInstall) {
  Invoke-RemoteStep -Title "Install + Health check" -Script $installScript
}

if (-not $SkipRestart) {
  Invoke-RemoteStep -Title "Restart gateway service" -Script $restartScript
}

Write-Host ""
Write-Host "Done. One-click reconcile completed." -ForegroundColor Green
