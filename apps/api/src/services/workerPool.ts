import { randomUUID } from 'crypto';
import type { Worker } from 'worker_threads';

export interface WorkerPoolMessage<TPayload> {
  id: string;
  payload: TPayload;
}

export interface WorkerPoolResult<TResponse> {
  id: string;
  ok: boolean;
  response?: TResponse;
  error?: {
    message: string;
    code?: string;
    statusCode?: number;
    stack?: string;
    expose?: boolean;
  };
}

export class WorkerPoolError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode = 503,
    public expose = false,
  ) {
    super(message);
    this.name = 'WorkerPoolError';
  }
}

interface WorkerLike<TPayload, TResponse> {
  postMessage(message: WorkerPoolMessage<TPayload>): void;
  on(event: 'message', listener: (message: WorkerPoolResult<TResponse>) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  terminate(): Promise<number>;
}

interface WorkerPoolOptions<TPayload, TResponse> {
  name: string;
  size: number;
  queueLimit: number;
  queueTimeoutMs: number;
  createWorker: () => Worker | WorkerLike<TPayload, TResponse>;
}

interface QueuedJob<TPayload, TResponse> {
  id: string;
  payload: TPayload;
  queueTimeout: ReturnType<typeof setTimeout> | null;
  resolve: (value: TResponse) => void;
  reject: (error: Error) => void;
}

interface WorkerSlot<TPayload, TResponse> {
  worker: WorkerLike<TPayload, TResponse>;
  currentJob: QueuedJob<TPayload, TResponse> | null;
}

export class WorkerPool<TPayload, TResponse> {
  private readonly slots: Array<WorkerSlot<TPayload, TResponse>> = [];
  private readonly queue: Array<QueuedJob<TPayload, TResponse>> = [];
  private closing = false;

  constructor(private readonly options: WorkerPoolOptions<TPayload, TResponse>) {
    for (let index = 0; index < options.size; index += 1) {
      this.slots.push(this.createSlot());
    }
  }

  run(payload: TPayload): Promise<TResponse> {
    if (this.closing) {
      return Promise.reject(
        new WorkerPoolError(`${this.options.name} worker pool is closing`, 'WORKER_JOB_FAILED'),
      );
    }

    const hasIdleSlot = this.slots.some((slot) => !slot.currentJob);
    if (!hasIdleSlot && this.queue.length >= this.options.queueLimit) {
      return Promise.reject(
        new WorkerPoolError(`${this.options.name} worker queue is full`, 'WORKER_QUEUE_FULL'),
      );
    }

    return new Promise<TResponse>((resolve, reject) => {
      const job: QueuedJob<TPayload, TResponse> = {
        id: randomUUID(),
        payload,
        resolve,
        reject,
        queueTimeout: null,
      };
      job.queueTimeout = setTimeout(() => {
        const index = this.queue.findIndex((queued) => queued.id === job.id);
        if (index === -1) return;

        this.queue.splice(index, 1);
        reject(new WorkerPoolError(`${this.options.name} worker queue timed out`, 'WORKER_QUEUE_TIMEOUT'));
      }, this.options.queueTimeoutMs);

      this.queue.push(job);
      this.drain();
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const job of this.queue.splice(0)) {
      this.clearQueueTimeout(job);
      job.reject(new WorkerPoolError(`${this.options.name} worker pool closed`, 'WORKER_JOB_FAILED'));
    }
    for (const slot of this.slots) {
      if (!slot.currentJob) continue;

      const job = slot.currentJob;
      slot.currentJob = null;
      job.reject(new WorkerPoolError(`${this.options.name} worker pool closed`, 'WORKER_JOB_FAILED'));
    }
    await Promise.all(this.slots.map((slot) => slot.worker.terminate()));
  }

  private createSlot(): WorkerSlot<TPayload, TResponse> {
    const slot: WorkerSlot<TPayload, TResponse> = {
      worker: this.options.createWorker() as WorkerLike<TPayload, TResponse>,
      currentJob: null,
    };

    slot.worker.on('message', (message) => {
      if (!slot.currentJob || message.id !== slot.currentJob.id) return;

      const job = slot.currentJob;
      slot.currentJob = null;
      if (message.ok) {
        job.resolve(message.response as TResponse);
      } else {
        job.reject(new WorkerPoolError(
          message.error?.message ?? `${this.options.name} worker job failed`,
          message.error?.code ?? 'WORKER_JOB_FAILED',
          message.error?.statusCode ?? 500,
          message.error?.expose ?? false,
        ));
      }
      this.drain();
    });

    slot.worker.on('error', (error) => {
      this.failCurrentJob(slot, error);
    });

    slot.worker.on('exit', (code) => {
      if (this.closing) return;

      this.failCurrentJob(slot, new Error(`${this.options.name} worker exited with code ${code}`));
      this.replaceSlot(slot);
      this.drain();
    });

    return slot;
  }

  private replaceSlot(slot: WorkerSlot<TPayload, TResponse>): void {
    const index = this.slots.indexOf(slot);
    if (index === -1) return;
    this.slots[index] = this.createSlot();
  }

  private failCurrentJob(slot: WorkerSlot<TPayload, TResponse>, error: Error): void {
    if (!slot.currentJob) return;

    const job = slot.currentJob;
    slot.currentJob = null;
    job.reject(new WorkerPoolError(error.message, 'WORKER_JOB_FAILED', 500));
  }

  private clearQueueTimeout(job: QueuedJob<TPayload, TResponse>): void {
    if (!job.queueTimeout) return;
    clearTimeout(job.queueTimeout);
    job.queueTimeout = null;
  }

  private drain(): void {
    for (const slot of this.slots) {
      if (slot.currentJob) continue;

      const job = this.queue.shift();
      if (!job) return;

      this.clearQueueTimeout(job);
      slot.currentJob = job;
      slot.worker.postMessage({ id: job.id, payload: job.payload });
    }
  }
}
