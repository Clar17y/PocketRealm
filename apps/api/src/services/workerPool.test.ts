import { describe, expect, it } from 'vitest';
import { WorkerPool } from './workerPool';

class FakeWorker {
  private listeners = new Map<string, Array<(value: unknown) => void>>();

  postMessage(message: { id: string; payload: unknown }): void {
    queueMicrotask(() => {
      this.emit('message', { id: message.id, ok: true, response: message.payload });
    });
  }

  on(event: string, listener: (value: unknown) => void): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  terminate(): Promise<number> {
    return Promise.resolve(0);
  }

  private emit(event: string, value: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

class HangingWorker {
  on(): this {
    return this;
  }

  postMessage(): void {}

  terminate(): Promise<number> {
    return Promise.resolve(0);
  }
}

describe('WorkerPool', () => {
  it('runs submitted jobs and resolves their responses', async () => {
    const pool = new WorkerPool<{ value: number }, { value: number }>({
      name: 'test',
      size: 1,
      queueLimit: 2,
      queueTimeoutMs: 500,
      createWorker: () => new FakeWorker() as never,
    });

    await expect(pool.run({ value: 1 })).resolves.toEqual({ value: 1 });
    await pool.close();
  });

  it('rejects immediately when the queue is full', async () => {
    const pool = new WorkerPool<{ value: number }, { value: number }>({
      name: 'test',
      size: 0,
      queueLimit: 1,
      queueTimeoutMs: 10,
      createWorker: () => new FakeWorker() as never,
    });

    const first = pool.run({ value: 1 });
    await expect(pool.run({ value: 2 })).rejects.toMatchObject({ code: 'WORKER_QUEUE_FULL' });
    await expect(first).rejects.toMatchObject({ code: 'WORKER_QUEUE_TIMEOUT' });
    await pool.close();
  });

  it('rejects in-flight jobs when the pool closes', async () => {
    const pool = new WorkerPool<{ value: number }, { value: number }>({
      name: 'test',
      size: 1,
      queueLimit: 1,
      queueTimeoutMs: 500,
      createWorker: () => new HangingWorker() as never,
    });

    const job = pool.run({ value: 1 }).catch((err: unknown) => err);
    await pool.close();

    const result = await Promise.race([
      job,
      new Promise((resolve) => setTimeout(() => resolve('pending'), 0)),
    ]);
    expect(result).toMatchObject({ code: 'WORKER_JOB_FAILED' });
  });
});
