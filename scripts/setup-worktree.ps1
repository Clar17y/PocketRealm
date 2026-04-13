[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Branch,

  [switch]$NoSeed
)

$ErrorActionPreference = 'Stop'

$Container = 'pocketrealm-postgres'
$PgUser = 'postgres'
$PgPort = '5433'
$RedisContainer = 'pocketrealm-redis'

function Write-Info {
  param([string]$Message)
  Write-Host "[INFO] $Message"
}

function Write-Warn {
  param([string]$Message)
  Write-Warning $Message
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Command,
    [Parameter(Mandatory = $true)][string]$Description
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE"
  }
}

function Set-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $lines = if (Test-Path -LiteralPath $Path) {
    Get-Content -LiteralPath $Path
  } else {
    @()
  }

  $pattern = "^$([regex]::Escape($Name))="
  $replaced = $false
  $updated = foreach ($line in $lines) {
    if ($line -match $pattern) {
      $replaced = $true
      "$Name=$Value"
    } else {
      $line
    }
  }

  if (-not $replaced) {
    $updated = @($updated) + "$Name=$Value"
  }

  Set-Content -LiteralPath $Path -Value $updated -Encoding utf8
}

function Convert-ToSafeName {
  param([Parameter(Mandatory = $true)][string]$Name)
  return ($Name -replace '[^a-zA-Z0-9]', '_').ToLowerInvariant()
}

function Get-BranchLeaf {
  param([Parameter(Mandatory = $true)][string]$Name)
  return ($Name -split '[/\\]')[-1]
}

$CommonGitDir = (& git rev-parse --path-format=absolute --git-common-dir).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($CommonGitDir)) {
  throw 'Could not resolve git common directory.'
}

$RepoRoot = Split-Path -Parent $CommonGitDir
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  throw 'Could not resolve git repository root.'
}

$ignoreProbe = Join-Path $RepoRoot '.worktrees\check-ignore-probe'
& git check-ignore -q -- $ignoreProbe
if ($LASTEXITCODE -ne 0) {
  throw '.worktrees must be ignored before creating project-local worktrees.'
}

$safeName = Convert-ToSafeName $Branch
$dbName = "pocketrealm_$safeName"
$branchLeaf = Get-BranchLeaf $Branch
$worktreeDir = Join-Path '.worktrees' "pocketrealm-$branchLeaf"
$worktreePath = Join-Path $RepoRoot $worktreeDir
$worktreeDbUrl = "postgresql://${PgUser}:${PgUser}@localhost:${PgPort}/${dbName}"

Write-Info "Branch:    $Branch"
Write-Info "Worktree:  $worktreePath"
Write-Info "Database:  $dbName"

if (Test-Path -LiteralPath $worktreePath) {
  Write-Warn "Worktree already exists: $worktreePath"
} else {
  & git show-ref --verify --quiet "refs/heads/$Branch"
  if ($LASTEXITCODE -eq 0) {
    Write-Info "Branch '$Branch' exists, creating worktree..."
    & git worktree add $worktreePath $Branch
  } else {
    Write-Info "Creating new branch '$Branch' and worktree..."
    & git worktree add -b $Branch $worktreePath
  }
  if ($LASTEXITCODE -ne 0) {
    throw "git worktree add failed with exit code $LASTEXITCODE"
  }
}

Write-Info "Creating database '$dbName' (if it does not exist)..."
$dbExists = & docker exec $Container psql -U $PgUser -tc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect PostgreSQL databases in Docker container '$Container'."
}

if (($dbExists -join "`n") -match '1') {
  Write-Info "Database '$dbName' already exists"
} else {
  & docker exec $Container psql -U $PgUser -c "CREATE DATABASE $dbName;"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create database '$dbName'."
  }
}

$homeRoot = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$canonicalRoot = Join-Path $homeRoot '.config\PocketRealm'
$canonicalApiEnv = Join-Path $canonicalRoot 'apps\api\.env'
$mainRepoApiEnv = Join-Path $RepoRoot 'apps\api\.env'
$worktreeApiEnv = Join-Path $worktreePath 'apps\api\.env'
$worktreeDbEnv = Join-Path $worktreePath 'packages\database\.env'

if (Test-Path -LiteralPath $canonicalApiEnv) {
  $sourceEnv = $canonicalApiEnv
  Write-Info "Using canonical .env from $canonicalApiEnv"
} elseif (Test-Path -LiteralPath $mainRepoApiEnv) {
  $sourceEnv = $mainRepoApiEnv
  Write-Info "Using main repo .env from $mainRepoApiEnv"
} else {
  $sourceEnv = $null
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $worktreeApiEnv) | Out-Null
if ($sourceEnv) {
  Copy-Item -LiteralPath $sourceEnv -Destination $worktreeApiEnv -Force
  Set-EnvValue -Path $worktreeApiEnv -Name 'DATABASE_URL' -Value $worktreeDbUrl
  Set-EnvValue -Path $worktreeApiEnv -Name 'DIRECT_DATABASE_URL' -Value $worktreeDbUrl
  Write-Info "Created apps/api/.env (DATABASE_URL + DIRECT_DATABASE_URL -> $dbName)"
} else {
  Write-Warn "No .env found at canonical ($canonicalApiEnv) or main repo ($mainRepoApiEnv)"
  Write-Warn 'Creating minimal .env with local defaults...'
  @(
    "DATABASE_URL=$worktreeDbUrl"
    "DIRECT_DATABASE_URL=$worktreeDbUrl"
    'REDIS_URL=redis://localhost:6379'
    'JWT_SECRET=dev-secret-minimum-32-characters-long'
    'PORT=4000'
    'CORS_ORIGIN=http://localhost:3002'
    'NODE_ENV=development'
  ) | Set-Content -LiteralPath $worktreeApiEnv -Encoding utf8
  Write-Info 'Created apps/api/.env with defaults'
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $worktreeDbEnv) | Out-Null
@(
  "DATABASE_URL=$worktreeDbUrl"
  "DIRECT_DATABASE_URL=$worktreeDbUrl"
) | Set-Content -LiteralPath $worktreeDbEnv -Encoding utf8
Write-Info 'Created packages/database/.env'

$canonicalAssets = Join-Path $canonicalRoot 'apps\web\public\assets'
$worktreeAssets = Join-Path $worktreePath 'apps\web\public\assets'
if (Test-Path -LiteralPath $canonicalAssets -PathType Container) {
  if (Test-Path -LiteralPath $worktreeAssets) {
    Write-Info 'Assets link already exists'
  } else {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $worktreeAssets) | Out-Null
    New-Item -ItemType Junction -Path $worktreeAssets -Target $canonicalAssets | Out-Null
    Write-Info 'Linked assets (junction)'
  }
} else {
  Write-Warn "Canonical assets not found at $canonicalAssets (skipping)"
}

Push-Location $worktreePath
try {
  Write-Info 'Installing dependencies...'
  & npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }

  Write-Info 'Generating Prisma client...'
  & npm run db:generate
  if ($LASTEXITCODE -ne 0) { throw "npm run db:generate failed with exit code $LASTEXITCODE" }

  Write-Info 'Running migrations...'
  & npm run db:migrate
  if ($LASTEXITCODE -ne 0) { throw "npm run db:migrate failed with exit code $LASTEXITCODE" }

  if (-not $NoSeed) {
    Write-Info 'Seeding database...'
    & npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw "npm run db:seed failed with exit code $LASTEXITCODE" }
  }
} finally {
  Pop-Location
}

$staticKeys = & docker exec $RedisContainer redis-cli KEYS 'static:*' 2>$null
if ($LASTEXITCODE -eq 0 -and ($staticKeys | Where-Object { $_ -like 'static:*' })) {
  Write-Info 'Flushing stale static-data cache from Redis...'
  & docker exec $RedisContainer redis-cli EVAL "local keys = redis.call('KEYS','static:*'); if #keys > 0 then redis.call('DEL', unpack(keys)); end; return #keys" 0 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Info 'Static cache flushed'
  } else {
    Write-Warn 'Failed to flush static cache from Redis'
  }
} else {
  Write-Info 'No stale static cache to flush'
}

Write-Host ''
Write-Info 'Worktree ready!'
Write-Info "  cd $worktreePath"
Write-Info '  npm run dev'
Write-Host ''
Write-Info 'To tear down later:'
Write-Info "  .\scripts\teardown-worktree.ps1 $Branch"
