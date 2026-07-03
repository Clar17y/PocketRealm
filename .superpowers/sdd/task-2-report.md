# Task 2 Report: Tax-Aware Max Reserved Turn Preflight

Implemented the Task 2 preflight layer in the API services without adding craft integration.

## Changes

- Added `assertPlayerCanSpendTurnsTx` in `apps/api/src/services/turnBankService.ts`.
- Added `TurnAffordabilityResult` with current turn state, required turns, cap timing, and `lastRegenAt`.
- Added `assertCanSpendWithTaxTx` in `apps/api/src/services/guildTaxService.ts`.
- Added `TaxAffordabilityResult` with base cost, inflated cost, guild tax metadata, and current turns.
- Added focused tests for both new preflight functions.

## Behavior

- Turn affordability checks are non-mutating.
- Tax-aware preflight inflates the requested cost before checking turn availability.
- Base cost validation rejects negative or non-integer inputs with `INVALID_TURNS`.
- Tax lookup is skipped for zero-cost checks.

## Verification

- `rtk npm run test -w apps/api -- --run src/services/turnBankService.test.ts src/services/guildTaxService.test.ts`

Result: 73 tests passed.

## Task 2 Review Fix

- Tightened `apps/api/src/services/guildTaxService.test.ts` so `assertCanSpendWithTaxTx` exercises the real `assertPlayerCanSpendTurnsTx` export from `turnBankService`.
- Switched the `./turnBankService` mock to keep the real affordability helper and only stub `spendPlayerTurnsTx`.
- Reworked the preflight tests to prove the 625-turn handoff succeeds and the 624-turn state fails with `INSUFFICIENT_TURNS`.

## Verification

- `rtk npm run test -w apps/api -- --run src/services/turnBankService.test.ts src/services/guildTaxService.test.ts`

Result: 73 tests passed.
