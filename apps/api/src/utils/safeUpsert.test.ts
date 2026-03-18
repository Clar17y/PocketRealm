import { describe, it, expect } from 'vitest';
import { safeUpsert } from './safeUpsert';

describe('safeUpsert', () => {
  it('returns upsert result on success', async () => {
    const result = await safeUpsert(
      () => Promise.resolve({ id: '1' }),
      () => Promise.resolve({ id: '1' }),
    );
    expect(result).toEqual({ id: '1' });
  });

  it('falls back to findFn on P2002 error', async () => {
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    const result = await safeUpsert(
      () => Promise.reject(p2002),
      () => Promise.resolve({ id: '2' }),
    );
    expect(result).toEqual({ id: '2' });
  });

  it('rethrows non-P2002 errors', async () => {
    const other = new Error('Connection lost');
    await expect(
      safeUpsert(
        () => Promise.reject(other),
        () => Promise.resolve({ id: '3' }),
      ),
    ).rejects.toThrow('Connection lost');
  });
});
