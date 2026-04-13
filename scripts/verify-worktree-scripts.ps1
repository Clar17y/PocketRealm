[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Read-RepoFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  return Get-Content -LiteralPath $Path -Raw
}

function Assert-ScriptParses {
  param([Parameter(Mandatory = $true)][string]$Path)

  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors) | Out-Null
  Assert-True ($errors.Count -eq 0) "$Path has parser errors: $($errors -join '; ')"
}

function Assert-Contains {
  param(
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Message
  )

  Assert-True ($Content -match $Pattern) $Message
}

$repoRoot = (git rev-parse --show-toplevel).Trim()
$setupPath = Join-Path $repoRoot 'scripts/setup-worktree.ps1'
$teardownPath = Join-Path $repoRoot 'scripts/teardown-worktree.ps1'
$gitattributesPath = Join-Path $repoRoot '.gitattributes'
$claudePath = Join-Path $repoRoot 'CLAUDE.md'
$agentsPath = Join-Path $repoRoot 'AGENTS.md'

Assert-True (Test-Path -LiteralPath $setupPath) 'scripts/setup-worktree.ps1 must exist'
Assert-True (Test-Path -LiteralPath $teardownPath) 'scripts/teardown-worktree.ps1 must exist'
Assert-True (Test-Path -LiteralPath $gitattributesPath) '.gitattributes must exist'

Assert-ScriptParses $setupPath
Assert-ScriptParses $teardownPath

$setup = Read-RepoFile $setupPath
$teardown = Read-RepoFile $teardownPath
$gitattributes = Read-RepoFile $gitattributesPath
$claude = Read-RepoFile $claudePath
$agents = Read-RepoFile $agentsPath

Assert-Contains $setup 'param\s*\(' 'setup-worktree.ps1 must declare a param block'
Assert-Contains $setup '\$Branch' 'setup-worktree.ps1 must accept a Branch parameter'
Assert-Contains $setup '\$NoSeed' 'setup-worktree.ps1 must support -NoSeed'
Assert-Contains $setup 'git\s+worktree\s+add' 'setup-worktree.ps1 must create git worktrees'
Assert-Contains $setup 'git\s+rev-parse\s+--path-format=absolute\s+--git-common-dir' 'setup-worktree.ps1 must resolve the shared git common dir'
Assert-Contains $setup 'git\s+check-ignore\s+-q' 'setup-worktree.ps1 must verify ignored paths with git check-ignore'
Assert-Contains $setup '\.worktrees' 'setup-worktree.ps1 must verify .worktrees is ignored'
Assert-Contains $setup 'docker\s+exec\s+\$Container\s+psql' 'setup-worktree.ps1 must create/check the per-worktree database'
Assert-Contains $setup 'New-Item\s+-ItemType\s+Junction' 'setup-worktree.ps1 must link assets with a Windows junction'
Assert-Contains $setup 'npm\s+install' 'setup-worktree.ps1 must install dependencies'
Assert-Contains $setup 'npm\s+run\s+db:generate' 'setup-worktree.ps1 must generate Prisma client'
Assert-Contains $setup 'npm\s+run\s+db:migrate' 'setup-worktree.ps1 must run migrations'
Assert-Contains $setup 'npm\s+run\s+db:seed' 'setup-worktree.ps1 must seed unless -NoSeed is set'

Assert-Contains $teardown 'param\s*\(' 'teardown-worktree.ps1 must declare a param block'
Assert-Contains $teardown '\$Branch' 'teardown-worktree.ps1 must accept a Branch parameter'
Assert-Contains $teardown '\$KeepBranch' 'teardown-worktree.ps1 must support -KeepBranch'
Assert-Contains $teardown '\$Yes' 'teardown-worktree.ps1 must support -Yes'
Assert-Contains $teardown 'git\s+rev-parse\s+--path-format=absolute\s+--git-common-dir' 'teardown-worktree.ps1 must resolve the shared git common dir'
Assert-Contains $teardown 'git\s+worktree\s+remove' 'teardown-worktree.ps1 must remove git worktrees'
Assert-Contains $teardown 'Remove-Item' 'teardown-worktree.ps1 must clean locked-file leftovers'
Assert-Contains $teardown 'pg_terminate_backend' 'teardown-worktree.ps1 must terminate DB connections before dropping'
Assert-Contains $teardown 'DROP DATABASE' 'teardown-worktree.ps1 must drop the per-worktree database'
Assert-Contains $teardown 'git\s+branch\s+-d' 'teardown-worktree.ps1 must delete branches by default'

Assert-Contains $gitattributes '\*\.sh\s+text\s+eol=lf' '.gitattributes must force LF for shell scripts'
Assert-Contains $gitattributes '\*\.ps1\s+text\s+eol=crlf' '.gitattributes must force CRLF for PowerShell scripts'

Assert-Contains $claude 'setup-worktree\.ps1' 'CLAUDE.md must document the PowerShell setup script'
Assert-Contains $claude 'teardown-worktree\.ps1' 'CLAUDE.md must document the PowerShell teardown script'
Assert-Contains $agents 'setup-worktree\.ps1' 'AGENTS.md must prefer PowerShell worktree scripts for Codex sessions'

Write-Host 'Worktree script verification passed.'
