$ErrorActionPreference = 'Stop'

$worktree = Split-Path -Parent $PSScriptRoot
$supabaseWorkdir = Join-Path $env:LOCALAPPDATA 'Temp\bsmile-canonical-baseline-empty-20260925'
$passwordFile = Join-Path $env:TEMP 'bsmile-local-qa-password.txt'
$pidFile = Join-Path $env:TEMP 'bsmile-local-dev-server.pid'
$evidenceDir = Join-Path $worktree 'release-evidence\local-supabase'

$existing = Get-NetTCPConnection -LocalPort 3010 -State Listen -ErrorAction SilentlyContinue
if ($existing) { throw "Port 3010 is already in use by PID $($existing.OwningProcess)." }
if (-not (Test-Path -LiteralPath $passwordFile)) { throw 'Local QA password file is missing.' }

$status = (pnpm dlx supabase@2.118.0 status -o json --workdir $supabaseWorkdir | Out-String) | ConvertFrom-Json
if (([uri]$status.API_URL).Host -notin @('127.0.0.1', 'localhost') -or ([uri]$status.API_URL).Port -ne 54321) {
  throw 'Refusing to start against a non-local Supabase API.'
}

$env:NEXT_PUBLIC_SUPABASE_URL = $status.API_URL
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $status.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY
$env:EMPLOYEE_INITIAL_PASSWORD = Get-Content -Raw -LiteralPath $passwordFile
$env:NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3010'

$process = Start-Process -FilePath (Get-Command pnpm.cmd).Source `
  -ArgumentList @('dev', '--hostname', '127.0.0.1', '--port', '3010') `
  -WorkingDirectory $worktree `
  -RedirectStandardOutput (Join-Path $evidenceDir 'dev-server.stdout.log') `
  -RedirectStandardError (Join-Path $evidenceDir 'dev-server.stderr.log') `
  -WindowStyle Hidden `
  -PassThru

Set-Content -LiteralPath $pidFile -Value $process.Id
Write-Output "dev_server_pid=$($process.Id)"
