import type { BatchMode } from '@/hooks/useBatchMode';

interface RunInventoryBatchActionOptions {
  batch: BatchMode;
  action: (() => Promise<void>) | undefined;
  onError: (message: string | null) => void;
  errorMessage: string;
  afterSuccess?: () => Promise<void>;
}

export async function runInventoryBatchAction({
  batch,
  action,
  onError,
  errorMessage,
  afterSuccess,
}: RunInventoryBatchActionOptions) {
  if (!action) {
    return;
  }

  batch.setBusy(true);
  onError(null);
  try {
    await action();
    batch.reset();
    if (afterSuccess) {
      await afterSuccess();
    }
  } catch (error: unknown) {
    onError(error instanceof Error ? error.message : errorMessage);
  } finally {
    batch.setBusy(false);
  }
}
