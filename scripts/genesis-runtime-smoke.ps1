param(
  [string]$Profile = "genesis-smoke",
  [int]$Port = 19101,
  [string]$RepoRoot = "C:\Users\Administrator\openclaw.clean"
)

$ErrorActionPreference = "Stop"

$openclaw = Join-Path $RepoRoot "openclaw.mjs"
$batch = Join-Path $RepoRoot "scripts\genesis-smoke.batch.json"
$logDir = Join-Path $RepoRoot ".genesis-smoke"
$stdoutLog = Join-Path $logDir "gateway.stdout.log"
$stderrLog = Join-Path $logDir "gateway.stderr.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

node $openclaw --profile $Profile config set --batch-file $batch
$validation = node $openclaw --profile $Profile config validate --json

$proc = Start-Process `
  -FilePath "node" `
  -ArgumentList @($openclaw, "--profile", $Profile, "gateway", "run", "--allow-unconfigured", "--auth", "none", "--port", "$Port") `
  -PassThru `
  -WorkingDirectory $RepoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog

try {
  Start-Sleep -Seconds 8
  $health = node $openclaw --profile $Profile gateway --auth none --port $Port health --json
  $status = "ok"
}
catch {
  $health = $_.Exception.Message
  $status = "error"
}
finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
    Start-Sleep -Seconds 1
  }
}

[pscustomobject]@{
  status = $status
  profile = $Profile
  port = $Port
  validation = ($validation | ConvertFrom-Json)
  health = if ($status -eq "ok") { $health | ConvertFrom-Json } else { $health }
  stdoutLog = $stdoutLog
  stderrLog = $stderrLog
} | ConvertTo-Json -Depth 8
