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

function Convert-ToComparablePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return ([System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/') -replace '\\', '/').ToLowerInvariant()
}

function Get-RegisteredWorktreePaths {
  return @(
    (& git worktree list --porcelain) |
      Where-Object { $_ -like 'worktree *' } |
      ForEach-Object { Convert-ToComparablePath $_.Substring('worktree '.Length) }
  )
}

function Remove-ToolingLeftovers {
  param([Parameter(Mandatory = $true)][string]$WorktreePath)

  foreach ($relativePath in @('.grepai')) {
    $leftoverPath = Join-Path $WorktreePath $relativePath
    if (-not (Test-Path -LiteralPath $leftoverPath)) {
      continue
    }

    Write-Info "Removing leftover tooling directory '$relativePath'..."
    try {
      Remove-Item -LiteralPath $leftoverPath -Recurse -Force
    } catch {
      Write-Warn "Could not fully remove leftover tooling directory '$leftoverPath'"
    }
  }
}

function Remove-WorktreeDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$WorktreePath,
    [Parameter(Mandatory = $true)][string]$Message,
    [int]$MaxAttempts = 4,
    [int]$RetryDelayMs = 1000
  )

  if (-not (Test-Path -LiteralPath $WorktreePath)) {
    return
  }

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    if ($attempt -eq 1) {
      Write-Info $Message
    } else {
      Write-Info "$Message (attempt $attempt/$MaxAttempts)..."
    }
    try {
      Remove-Item -LiteralPath $WorktreePath -Recurse -Force
    } catch {
      if ($attempt -eq $MaxAttempts) {
        Write-Warn "Could not fully remove $WorktreePath (files may be locked by another process)"
        Write-Warn "Kill any processes using the directory, then run: Remove-Item -LiteralPath '$WorktreePath' -Recurse -Force"
        return
      }

      Start-Sleep -Milliseconds $RetryDelayMs
      continue
    }

    if (-not (Test-Path -LiteralPath $WorktreePath)) {
      return
    }

    if ($attempt -lt $MaxAttempts) {
      Start-Sleep -Milliseconds $RetryDelayMs
    }
  }
}

$CommonGitDir = (& git rev-parse --path-format=absolute --git-common-dir).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($CommonGitDir)) {
  throw 'Could not resolve git common directory.'
}

$RepoRoot = Split-Path -Parent $CommonGitDir
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  throw 'Could not resolve git repository root.'
}

$safeName = Convert-ToSafeName $Branch
$dbName = "pocketrealm_$safeName"
$worktreeDir = Join-Path '.worktrees' "pocketrealm-$safeName"
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

$normalizedWorktreePath = Convert-ToComparablePath $worktreePath

if ((Get-RegisteredWorktreePaths) -contains $normalizedWorktreePath) {
  Write-Info 'Removing worktree from git...'
  & git worktree remove $worktreePath --force
  if ($LASTEXITCODE -ne 0) {
    Write-Warn 'git worktree remove failed, removing tooling leftovers and retrying...'
    Remove-ToolingLeftovers -WorktreePath $worktreePath
    & git worktree remove $worktreePath --force
    if ($LASTEXITCODE -ne 0) {
      Write-Warn 'git worktree remove still failed, pruning stale entry...'
      & git worktree prune
    }
  }
}

Remove-ToolingLeftovers -WorktreePath $worktreePath

Remove-WorktreeDirectory -WorktreePath $worktreePath -Message 'Removing worktree directory...'

# Tooling can recreate local indexes immediately after the first delete pass.
Start-Sleep -Milliseconds 1000
if (Test-Path -LiteralPath $worktreePath) {
  Remove-ToolingLeftovers -WorktreePath $worktreePath
  Remove-WorktreeDirectory -WorktreePath $worktreePath -Message 'Retrying worktree directory cleanup...'
}

& git worktree prune | Out-Null
$worktreeStillRegistered = (Get-RegisteredWorktreePaths) -contains $normalizedWorktreePath
if (Test-Path -LiteralPath $worktreePath) {
  Write-Warn "Could not fully remove $worktreePath (directory still exists after cleanup)"
} elseif ($worktreeStillRegistered) {
  Write-Warn "Worktree '$worktreePath' is still registered after cleanup"
} else {
  Write-Info 'Worktree removed'
}

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
