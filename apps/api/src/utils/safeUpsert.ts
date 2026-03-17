/**
 * Run a Prisma upsert with P2002 race-condition handling.
 *
 * Two concurrent requests can both attempt to INSERT when the row doesn't
 * exist yet. One wins; the other gets a unique constraint violation (P2002).
 * On P2002 we know the row now exists, so we simply read it back.
 */
export async function safeUpsert<T>(
  upsertFn: () => Promise<T>,
  findFn: () => Promise<T>,
): Promise<T> {
  try {
    return await upsertFn();
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return findFn();
    }
    throw err;
  }
}
