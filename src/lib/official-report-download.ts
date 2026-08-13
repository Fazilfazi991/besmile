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
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Unable to generate the official report.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = decodeURIComponent(response.headers.get('X-Document-Filename') || 'BSmile_Official_Report.pdf');
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return Number(response.headers.get('X-Document-Pages') || 0);
}
