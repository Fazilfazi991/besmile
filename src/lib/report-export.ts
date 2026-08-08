import * as XLSX from 'xlsx';

export type ReportRow = Record<string, unknown>;
export const safeReportCell = (value: unknown) => {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
};
export function reportCsv(headers: string[], rows: ReportRow[]) {
  const quote = (value: unknown) => `"${safeReportCell(value).replaceAll('"', '""')}"`;
  return '\uFEFF' + [headers, ...rows.map(row => headers.map(header => row[header]))].map(row => row.map(quote).join(',')).join('\r\n');
}
export function downloadReportCsv(filename: string, headers: string[], rows: ReportRow[]) {
  download(filename, new Blob([reportCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }));
}
export function downloadReportXlsx(filename: string, headers: string[], rows: ReportRow[]) {
  const sheet = XLSX.utils.json_to_sheet(rows.map(row => Object.fromEntries(headers.map(header => [header, safeReportCell(row[header])]))), { header: headers });
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  XLSX.writeFile(workbook, filename, { bookType: 'xlsx', compression: true });
}
function download(filename: string, blob: Blob) { const link = document.createElement('a'); const url = URL.createObjectURL(blob); link.href = url; link.download = filename; link.style.display = 'none'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0); }
