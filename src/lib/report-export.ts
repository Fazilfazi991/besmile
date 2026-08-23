export type ReportRow = Record<string, unknown>;
export const safeReportCell = (value: unknown) => {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
};
export function reportCsv(headers: string[], rows: ReportRow[]) {
  const quote = (value: unknown) => `"${safeReportCell(value).replaceAll('"', '""')}"`;
  return '\uFEFF' + [headers, ...rows.map(row => headers.map(header => row[header]))].map(row => row.map(quote).join(',')).join('\r\n');
}
export async function downloadReportCsv(filename: string, headers: string[], rows: ReportRow[]) {
  return downloadBlob(new Blob([reportCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename, /^text\/csv/i);
}
export async function downloadReportXlsx(filename: string, headers: string[], rows: ReportRow[]) {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.json_to_sheet(rows.map(row => Object.fromEntries(headers.map(header => [header, safeReportCell(row[header])]))), { header: headers });
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
  return downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename, /spreadsheetml\.sheet/i);
}
import { downloadBlob } from './browser-download';
