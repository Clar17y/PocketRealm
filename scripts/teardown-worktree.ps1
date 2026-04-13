[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Branch,

  [switch]$KeepBranch,

  [Alias('y')]
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'

$Container = 'pocketrealm-postgres'
$PgUser = 'postgres'

function Write-Info {
  param([string]$Message)
  Write-Host "[INFO] $Message"
}

function Write-Warn {
  param([string]$Message)
  Write-Warning $Message
}

function Convert-ToSafeName {
  param([Parameter(Mandatory = $true)][string]$Name)
  return ($Name -replace '[^a-zA-Z0-9]', '_').ToLowerInvariant()
}

function Get-BranchLeaf {
  param([Parameter(Mandatory = $true)][string]$Name)
  return ($Name -split '[/\\]')[-1]
}

$RepoRoot = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($RepoRoot)) {
  throw 'Could not resolve git repository root.'
}

$safeName = Convert-ToSafeName $Branch
$dbName = "pocketrealm_$safeName"
$branchLeaf = Get-BranchLeaf $Branch
$worktreeDir = Join-Path '.worktrees' "pocketrealm-$branchLeaf"
$worktreePath = Join-Path $RepoRoot $worktreeDir

Write-Info "Branch:    $Branch"
Write-Info "Worktree:  $worktreePath"
Write-Info "Database:  $dbName"

if (-not $Yes) {
  $confirm = Read-Host 'Remove worktree and drop database? [y/N]'
  if ($confirm -notmatch '^[yY]$') {
    Write-Info 'Aborted.'
    exit 0
  }
}

$worktreeList = (& git worktree list --porcelain) -join "`n"
if ($worktreeList -match [regex]::Escape($worktreePath)) {
  Write-Info 'Removing worktree from git...'
  & git worktree remove $worktreePath --force
  if ($LASTEXITCODE -ne 0) {
    Write-Warn 'git worktree remove failed, pruning stale entry...'
    & git worktree prune
  }
}

if (Test-Path -LiteralPath $worktreePath) {
  Write-Info 'Removing worktree directory...'
  try {
    Remove-Item -LiteralPath $worktreePath -Recurse -Force
  } catch {
    Write-Warn "Could not fully remove $worktreePath (files may be locked by another process)"
    Write-Warn "Kill any processes using the directory, then run: Remove-Item -LiteralPath '$worktreePath' -Recurse -Force"
  }
}

& git worktree prune | Out-Null
Write-Info 'Worktree removed'

Write-Info "Dropping database '$dbName'..."
$dbExists = & docker exec $Container psql -U $PgUser -tc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
if ($LASTEXITCODE -ne 0) {
  Write-Warn "Could not inspect PostgreSQL databases in Docker container '$Container'"
} elseif (($dbExists -join "`n") -match '1') {
  & docker exec $Container psql -U $PgUser -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$dbName' AND pid <> pg_backend_pid();" | Out-Null
  & docker exec $Container psql -U $PgUser -c "DROP DATABASE $dbName;"
  if ($LASTEXITCODE -eq 0) {
    Write-Info 'Database dropped'
  } else {
    Write-Warn "Failed to drop database '$dbName'"
  }
} else {
  Write-Warn "Database '$dbName' does not exist (already dropped?)"
}

if (-not $KeepBranch) {
  & git show-ref --verify --quiet "refs/heads/$Branch"
  if ($LASTEXITCODE -eq 0) {
    Write-Info "Deleting branch '$Branch'..."
    & git branch -d $Branch
    if ($LASTEXITCODE -ne 0) {
      Write-Warn "Branch '$Branch' has unmerged changes. Use 'git branch -D $Branch' to force-delete."
    }
  } else {
    Write-Warn "Branch '$Branch' not found (already deleted?)"
  }
} else {
  Write-Info "Keeping branch '$Branch' (-KeepBranch)"
}

Write-Host ''
Write-Info 'Teardown complete.'
