import type { ApiResponse } from '@/lib/api';

interface RunSimpleActionOptions<T> {
  actionName: string;
  apiFn: () => Promise<ApiResponse<T>>;
  onSuccess?: (data: T) => void | Promise<void>;
  loadAll: () => Promise<void>;
  setActionError: (message: string) => void;
}

export async function runSimpleAction<T>({
  actionName,
  apiFn,
  onSuccess,
  loadAll,
  setActionError,
}: RunSimpleActionOptions<T>) {
  const res = await apiFn();
  if (!res.data) {
    setActionError(res.error?.message ?? `${actionName.replace(/_/g, ' ')} failed`);
    return;
  }

  await onSuccess?.(res.data);
  await loadAll();
}
