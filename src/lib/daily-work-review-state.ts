/** Rows from an earlier request must never be shown under a different date. */
export function dailyWorkRowsForDate<T>(result: { date: string; rows: T[] }, selectedDate: string): T[] {
  return result.date === selectedDate ? result.rows : [];
}

/** A reply refresh may finish after the reviewer has selected another day. */
export async function refreshDailyWorkForSelection<T>(date: string, generation: number, currentGeneration: () => number, load: (date: string) => Promise<T[]>, apply: (date: string, rows: T[]) => void) {
  const rows = await load(date);
  if (currentGeneration() === generation) apply(date, rows);
}
