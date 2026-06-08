import { isCancelledRow } from "@/lib/ingest/cancellationDetection";

export type StagingRowForDedupe = {
  dedupe_key: string;
  status?: string | null;
  external_status?: string | null;
  raw_json?: unknown;
};

export type DedupeStagingRowsResult<T extends StagingRowForDedupe> = {
  rows: T[];
  /** dedupe_key values that appeared more than once in the batch */
  duplicateDedupeKeys: number;
  /** rows removed by deduplication */
  duplicateRowsCollapsed: number;
};

function isCancelledStagingRow(row: StagingRowForDedupe): boolean {
  if (row.status === "cancelled") return true;
  return isCancelledRow(row);
}

/**
 * Pick the winning row when two share a dedupe_key.
 * Cancellation wins over non-cancellation; otherwise last row in file wins.
 */
export function pickStagingRowWinner<T extends StagingRowForDedupe>(
  current: T,
  incoming: T
): T {
  const currentCancelled = isCancelledStagingRow(current);
  const incomingCancelled = isCancelledStagingRow(incoming);
  if (incomingCancelled && !currentCancelled) return incoming;
  if (currentCancelled && !incomingCancelled) return current;
  return incoming;
}

/**
 * Deduplicate staging rows before a single booking_import_staging upsert batch.
 * Postgres rejects ON CONFLICT DO UPDATE when the same key appears twice in one statement.
 */
export function dedupeStagingRowsByKey<T extends StagingRowForDedupe>(
  rows: T[]
): DedupeStagingRowsResult<T> {
  if (rows.length === 0) {
    return { rows: [], duplicateDedupeKeys: 0, duplicateRowsCollapsed: 0 };
  }

  const keyCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.dedupe_key;
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const duplicateDedupeKeys = [...keyCounts.values()].filter((c) => c > 1).length;

  const winners = new Map<string, T>();
  const lastIndex = new Map<string, number>();

  rows.forEach((row, index) => {
    const key = row.dedupe_key;
    lastIndex.set(key, index);
    const existing = winners.get(key);
    winners.set(key, existing ? pickStagingRowWinner(existing, row) : row);
  });

  const deduped: T[] = [];
  const emitted = new Set<string>();
  rows.forEach((row, index) => {
    const key = row.dedupe_key;
    if (emitted.has(key)) return;
    if (lastIndex.get(key) === index) {
      deduped.push(winners.get(key)!);
      emitted.add(key);
    }
  });

  return {
    rows: deduped,
    duplicateDedupeKeys,
    duplicateRowsCollapsed: rows.length - deduped.length,
  };
}
