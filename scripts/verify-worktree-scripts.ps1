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

function Invoke-TeardownHarness {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$Branch,
    [string[]]$WorktreeListLines = @(),
    [switch]$LeaveLeftoverDirectory,
    [switch]$FailGitRemoveUntilLeftoverDeleted,
    [switch]$RecreateLeftoverAfterDelete,
    [int]$FailWorktreeDeleteAttempts = 0
  )

  $safeName = ($Branch -replace '[^a-zA-Z0-9]', '_').ToLowerInvariant()
  $worktreePath = Join-Path $RepoRoot (Join-Path '.worktrees' "pocketrealm-$safeName")

  New-Item -ItemType Directory -Force -Path $worktreePath | Out-Null
  Set-Content -LiteralPath (Join-Path $worktreePath 'marker.txt') -Value 'marker' -Encoding utf8

  if ($LeaveLeftoverDirectory) {
    $grepaiDir = Join-Path $worktreePath '.grepai'
    New-Item -ItemType Directory -Force -Path $grepaiDir | Out-Null
    Set-Content -LiteralPath (Join-Path $grepaiDir 'index.gob.lock') -Value '' -Encoding utf8
  }

  $gitCalls = [System.Collections.Generic.List[string]]::new()
  $removedPaths = [System.Collections.Generic.List[string]]::new()
  $warnings = [System.Collections.Generic.List[string]]::new()

  function global:git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

    $command = ($Args -join ' ')
    $script:gitCalls.Add($command)

    switch -Regex ($command) {
      '^rev-parse --path-format=absolute --git-common-dir$' {
        $global:LASTEXITCODE = 0
        return (Join-Path $script:RepoRoot '.git')
      }
      '^worktree list --porcelain$' {
        $global:LASTEXITCODE = 0
        return $script:WorktreeListLines
      }
      '^worktree remove .+ --force$' {
        if ($script:FailGitRemoveUntilLeftoverDeleted -and (Test-Path -LiteralPath $script:LeftoverPath)) {
          $global:LASTEXITCODE = 128
          return
        }

        $global:LASTEXITCODE = 0
        $script:WorktreeListLines = @()
        return
      }
      '^worktree prune$' {
        $global:LASTEXITCODE = 0
        return
      }
      '^show-ref --verify --quiet refs/heads/.+$' {
        $global:LASTEXITCODE = 0
        return
      }
      '^branch -d .+$' {
        $global:LASTEXITCODE = 0
        return
      }
      default {
        throw "Unexpected git invocation: $command"
      }
    }
  }

  function global:docker {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

    $global:LASTEXITCODE = 0
    return @()
  }

  function global:Write-Warning {
    param([string]$Message)
    $script:warnings.Add($Message)
  }

  function global:Remove-Item {
    param(
      [Parameter(Mandatory = $true)][string]$LiteralPath,
      [switch]$Recurse,
      [switch]$Force
    )

    $script:removedPaths.Add($LiteralPath)

    if ($script:RecreateLeftoverAfterDelete -and
      $LiteralPath -eq $script:WorktreePath -and
      -not $script:LeftoverRecreated) {
      Microsoft.PowerShell.Management\Remove-Item -LiteralPath $LiteralPath -Recurse:$Recurse -Force:$Force
      New-Item -ItemType Directory -Force -Path $script:LeftoverPath | Out-Null
      Set-Content -LiteralPath (Join-Path $script:LeftoverPath 'index.gob.lock') -Value '' -Encoding utf8
      $script:LeftoverRecreated = $true
      return
    }

    if ($LiteralPath -eq $script:WorktreePath -and $script:RemainingDeleteFailures -gt 0) {
      $script:RemainingDeleteFailures--
      throw 'simulated locked directory'
    }

    if ($script:LeaveLeftoverDirectory) {
      Get-ChildItem -Force -LiteralPath $LiteralPath |
        Where-Object { $_.Name -ne '.grepai' } |
        ForEach-Object {
          Microsoft.PowerShell.Management\Remove-Item -LiteralPath $_.FullName -Recurse -Force
        }
      return
    }

    Microsoft.PowerShell.Management\Remove-Item -LiteralPath $LiteralPath -Recurse:$Recurse -Force:$Force
  }

  $script:RepoRoot = $RepoRoot
  $script:WorktreeListLines = $WorktreeListLines
  $script:gitCalls = $gitCalls
  $script:removedPaths = $removedPaths
  $script:warnings = $warnings
  $script:LeaveLeftoverDirectory = $LeaveLeftoverDirectory.IsPresent
  $script:FailGitRemoveUntilLeftoverDeleted = $FailGitRemoveUntilLeftoverDeleted.IsPresent
  $script:RecreateLeftoverAfterDelete = $RecreateLeftoverAfterDelete.IsPresent
  $script:WorktreePath = $worktreePath
  $script:LeftoverPath = Join-Path $worktreePath '.grepai'
  $script:LeftoverRecreated = $false
  $script:RemainingDeleteFailures = $FailWorktreeDeleteAttempts

  try {
    . $ScriptPath -Branch $Branch -KeepBranch -Yes
  } finally {
    Microsoft.PowerShell.Management\Remove-Item function:\global:git -ErrorAction SilentlyContinue
    Microsoft.PowerShell.Management\Remove-Item function:\global:docker -ErrorAction SilentlyContinue
    Microsoft.PowerShell.Management\Remove-Item function:\global:Write-Warning -ErrorAction SilentlyContinue
    Microsoft.PowerShell.Management\Remove-Item function:\global:Remove-Item -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $worktreePath) {
      Microsoft.PowerShell.Management\Remove-Item -LiteralPath $worktreePath -Recurse -Force
    }
    $script:RepoRoot = $null
    $script:WorktreeListLines = $null
    $script:gitCalls = $null
    $script:removedPaths = $null
    $script:warnings = $null
    $script:LeaveLeftoverDirectory = $false
    $script:FailGitRemoveUntilLeftoverDeleted = $false
    $script:RecreateLeftoverAfterDelete = $false
    $script:WorktreePath = $null
    $script:LeftoverPath = $null
    $script:LeftoverRecreated = $false
    $script:RemainingDeleteFailures = 0
  }

  return @{
    GitCalls = $gitCalls
    RemovedPaths = $removedPaths
    Warnings = $warnings
  }
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
Assert-Contains $setup 'pocketrealm-\$safeName' 'setup-worktree.ps1 must derive the worktree directory from the sanitized full branch name'
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
Assert-Contains $teardown 'pocketrealm-\$safeName' 'teardown-worktree.ps1 must derive the worktree directory from the sanitized full branch name'
Assert-Contains $teardown 'git\s+worktree\s+remove' 'teardown-worktree.ps1 must remove git worktrees'
Assert-Contains $teardown 'Remove-Item' 'teardown-worktree.ps1 must clean locked-file leftovers'
Assert-Contains $teardown 'Convert-ToComparablePath' 'teardown-worktree.ps1 must normalize worktree paths before comparing them'
Assert-Contains $teardown 'pg_terminate_backend' 'teardown-worktree.ps1 must terminate DB connections before dropping'
Assert-Contains $teardown 'DROP DATABASE' 'teardown-worktree.ps1 must drop the per-worktree database'
Assert-Contains $teardown 'git\s+branch\s+-d' 'teardown-worktree.ps1 must delete branches by default'

Assert-Contains $gitattributes '\*\.sh\s+text\s+eol=lf' '.gitattributes must force LF for shell scripts'
Assert-Contains $gitattributes '\*\.ps1\s+text\s+eol=crlf' '.gitattributes must force CRLF for PowerShell scripts'

Assert-Contains $claude 'setup-worktree\.ps1' 'CLAUDE.md must document the PowerShell setup script'
Assert-Contains $claude 'teardown-worktree\.ps1' 'CLAUDE.md must document the PowerShell teardown script'
Assert-Contains $agents 'setup-worktree\.ps1' 'AGENTS.md must prefer PowerShell worktree scripts for Codex sessions'

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pocketrealm-worktree-script-tests-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
try {
  $leftoverResult = Invoke-TeardownHarness `
    -ScriptPath $teardownPath `
    -RepoRoot $tempRoot `
    -Branch 'feature/leftover-warning' `
    -WorktreeListLines @() `
    -LeaveLeftoverDirectory

  Assert-True (
    ($leftoverResult.Warnings | Where-Object { $_ -match 'Could not fully remove' }).Count -gt 0
  ) 'teardown-worktree.ps1 must warn when the worktree directory still exists after cleanup'

  $retryBranch = 'feature/retry-after-tooling-leftover'
  $retrySafeName = ($retryBranch -replace '[^a-zA-Z0-9]', '_').ToLowerInvariant()
  $retryWorktreePath = Join-Path $tempRoot (Join-Path '.worktrees' "pocketrealm-$retrySafeName")
  $retryResult = Invoke-TeardownHarness `
    -ScriptPath $teardownPath `
    -RepoRoot $tempRoot `
    -Branch $retryBranch `
    -WorktreeListLines @(
      "worktree $($retryWorktreePath -replace '\\', '/')"
      'HEAD fedcba0987654321'
      "branch refs/heads/$retryBranch"
    ) `
    -LeaveLeftoverDirectory `
    -FailGitRemoveUntilLeftoverDeleted

  Assert-True (
    ($retryResult.GitCalls | Where-Object { $_ -eq "worktree remove $retryWorktreePath --force" }).Count -ge 2
  ) 'teardown-worktree.ps1 must retry git worktree remove after clearing tooling leftovers'

  $recreateBranch = 'feature/recreate-tooling-leftover'
  $recreateSafeName = ($recreateBranch -replace '[^a-zA-Z0-9]', '_').ToLowerInvariant()
  $recreateWorktreePath = Join-Path $tempRoot (Join-Path '.worktrees' "pocketrealm-$recreateSafeName")
  $recreateResult = Invoke-TeardownHarness `
    -ScriptPath $teardownPath `
    -RepoRoot $tempRoot `
    -Branch $recreateBranch `
    -RecreateLeftoverAfterDelete

  Assert-True (
    ($recreateResult.RemovedPaths | Where-Object { $_ -eq $recreateWorktreePath }).Count -ge 2
  ) 'teardown-worktree.ps1 must retry directory cleanup if tooling leftovers reappear after deletion'

  $retryDeleteBranch = 'feature/retry-locked-directory'
  $retryDeleteSafeName = ($retryDeleteBranch -replace '[^a-zA-Z0-9]', '_').ToLowerInvariant()
  $retryDeleteWorktreePath = Join-Path $tempRoot (Join-Path '.worktrees' "pocketrealm-$retryDeleteSafeName")
  $retryDeleteResult = Invoke-TeardownHarness `
    -ScriptPath $teardownPath `
    -RepoRoot $tempRoot `
    -Branch $retryDeleteBranch `
    -FailWorktreeDeleteAttempts 2

  Assert-True (
    ($retryDeleteResult.RemovedPaths | Where-Object { $_ -eq $retryDeleteWorktreePath }).Count -ge 3
  ) 'teardown-worktree.ps1 must retry directory cleanup when the directory remains locked'
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Microsoft.PowerShell.Management\Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

Write-Host 'Worktree script verification passed.'
