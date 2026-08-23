import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBrowserFile, filenameFromDisposition } from './browser-download';

const originalDocument = globalThis.document;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

function installBrowser() {
  const link = { href: '', download: '', style: {}, click: vi.fn(), remove: vi.fn() } as any;
  (globalThis as any).document = { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } };
  (globalThis as any).window = globalThis;
  URL.createObjectURL = vi.fn(() => 'blob:report'); URL.revokeObjectURL = vi.fn();
  return link;
}
afterEach(() => { (globalThis as any).document = originalDocument; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; vi.useRealTimers(); });

describe('browser download', () => {
  it('uses Content-Disposition, clicks an anchor, and delays cleanup', async () => {
    vi.useFakeTimers(); const link = installBrowser();
    await downloadBrowserFile(new Response('name\nQA', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="qa.csv"' } }), 'fallback.csv', /^text\/csv/i);
    expect(link.download).toBe('qa.csv'); expect(link.click).toHaveBeenCalledOnce(); expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(30_000); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });
  it('supports alternate and fallback filenames', () => {
    expect(filenameFromDisposition('BSmile%20Report.pdf', 'fallback.pdf')).toBe('BSmile Report.pdf');
    expect(filenameFromDisposition(null, 'fallback.pdf')).toBe('fallback.pdf');
  });
  it.each([
    [new Response(JSON.stringify({ error: 'Denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), /Denied/],
    [new Response('Gateway unavailable', { status: 502, headers: { 'Content-Type': 'text/plain' } }), /Gateway unavailable/],
    [new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }), /unexpected file response|web page/],
    [new Response('data', { headers: { 'Content-Type': 'text/plain' } }), /unexpected file response/],
    [new Response('', { headers: { 'Content-Type': 'text/csv' } }), /empty/],
  ])('rejects unsafe response %#', async (response, message) => {
    installBrowser(); await expect(downloadBrowserFile(response, 'report.csv', /^text\/csv/i)).rejects.toThrow(message);
  });
  it('rejects malformed PDFs before download', async () => {
    installBrowser(); await expect(downloadBrowserFile(new Response('not a pdf', { headers: { 'Content-Type': 'application/pdf' } }), 'report.pdf', /application\/pdf/i)).rejects.toThrow(/generated PDF was invalid/i);
  });
});
