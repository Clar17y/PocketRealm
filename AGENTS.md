# AGENTS.md

This file supplements `CLAUDE.md` for Codex-specific guidance. Keep it short. Do not duplicate broad project documentation here.

## Canonical Project Guide

- Read `CLAUDE.md` first for project overview, architecture, command catalog, and workflow details.
- Treat `CLAUDE.md` as the canonical source for general repo instructions. Add only Codex-specific deltas here.

## Environment

- Primary shell is Windows PowerShell 7. Prefer `pwsh`/PowerShell-compatible commands and examples.
- This repository runs on Windows in local Codex sessions unless the current environment explicitly says otherwise.
- Prefer `scripts/setup-worktree.ps1` and `scripts/teardown-worktree.ps1` for local Codex worktree lifecycle. The `.sh` scripts are for Git Bash/Unix environments.

## Working Rules

- Use git worktrees for feature work. Do not work directly in the main clone when feature isolation is needed.
- Prefer existing `npm` workspace scripts and repo scripts over ad hoc command variants.
- Prefer focused verification first, then broader verification only as needed.
- Do not copy large sections from `CLAUDE.md` into this file. Reference `CLAUDE.md` instead.
