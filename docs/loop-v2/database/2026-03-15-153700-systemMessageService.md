# Database Audit: systemMessageService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/systemMessageService.ts` (39 lines, 1 exported function)

## Prisma Models Touched
Via sub-service: `ChatMessage` (via `saveMessage`)

## Findings
None. Thin wrapper: saves message via `chatService.saveMessage` (1 query with select) + emits via Socket.IO. Clean.

## Suggested Fixes
None needed.
