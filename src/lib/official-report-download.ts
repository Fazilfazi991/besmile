export type DownloadReportPayload = {
  reportType: string;
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' | 'center'; weight?: number }>;
  rows: Array<Record<string, unknown>>;
  period?: string;
  filters?: string[];
  totals?: Array<{ label: string; value: string }>;
  context?: Record<string, string>;
  filenameSuffix?: string;
};

export async function downloadOfficialReport(payload: DownloadReportPayload) {
  const response = await fetch('/api/documents/official/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const { downloadBrowserFile } = await import('./browser-download');
  await downloadBrowserFile(response, 'BSmile_Official_Report.pdf', /application\/pdf/i);
  return Number(response.headers.get('X-Document-Pages') || 0);
}
