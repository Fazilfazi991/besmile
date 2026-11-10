/** Fetch every visible, unarchived ledger row without PostgREST's default row cap.
 * Cursor on the unique immutable ID prevents page shifts from duplicating rows.
 */
export async function financeDashboardTransactions(db: any, pageSize = 500): Promise<any[]> {
  const rows: any[] = [];
  let cursor: string | null = null;
  for (;;) {
    let query = db.from('finance_transactions')
      .select('*,account:finance_accounts(name),expense_category:finance_expense_categories(name)')
      .is('archived_at', null).order('id', { ascending: true }).limit(pageSize);
    if (cursor !== null) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    const next = page[page.length - 1]?.id;
    if (!next || next === cursor) throw new Error('Finance transaction pagination did not advance.');
    cursor = next;
  }
  return rows.sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)) || String(b.id).localeCompare(String(a.id)));
}
