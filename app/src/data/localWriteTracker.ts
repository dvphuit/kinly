const pendingWrites = new Map<string, Set<Promise<void>>>();

function rememberPendingWrite(key: string, operation: Promise<void>): void {
  const operations = pendingWrites.get(key) ?? new Set<Promise<void>>();
  operations.add(operation);
  pendingWrites.set(key, operations);
  void operation.finally(() => {
    operations.delete(operation);
    if (operations.size === 0) pendingWrites.delete(key);
  }).catch(() => {
    // The original operation remains responsible for reporting its failure.
  });
}

export function runTrackedLocalWrite(key: string, operation: () => Promise<void>): Promise<void> {
  const pending = operation();
  rememberPendingWrite(key, pending);
  return pending;
}

export async function waitForTrackedLocalWrites(keys: readonly string[]): Promise<void> {
  const operations = keys.flatMap((key) => [...(pendingWrites.get(key) ?? [])]);
  await Promise.all(operations);
}
