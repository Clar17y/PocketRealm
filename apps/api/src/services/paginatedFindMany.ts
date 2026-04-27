import { LEADERBOARD_CONSTANTS } from '@pocketrealm/shared';

interface CursorFindManyArgs {
  take: number;
  skip?: number;
  cursor?: { id: string };
  select?: unknown;
  where?: unknown;
  orderBy?: unknown;
}

export async function paginatedFindMany<T extends { id: string }>(
  findMany: (args: CursorFindManyArgs) => Promise<T[]>,
  baseArgs: { select?: unknown; where?: unknown },
  batchSize = LEADERBOARD_CONSTANTS.BATCH_SIZE,
): Promise<T[]> {
  const allRows: T[] = [];
  let cursor: string | undefined;
  let batch: T[];

  do {
    batch = await findMany({
      ...baseArgs,
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    allRows.push(...batch);

    if (batch.length === batchSize) {
      cursor = batch[batch.length - 1].id;
    }
  } while (batch.length === batchSize);

  return allRows;
}
