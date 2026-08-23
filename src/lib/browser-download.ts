export function filenameFromDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1].trim());
  return value && !/[=;]/.test(value) ? decodeURIComponent(value.trim()) : fallback;
}
async function errorFrom(response: Response) { const text = await response.text(); try { return JSON.parse(text).error || JSON.parse(text).message || 'Download failed.'; } catch { return text.slice(0, 160) || 'Download failed.'; } }
export async function validateDownloadBlob(blob: Blob, type: string, expectedType?: RegExp) {
  if (expectedType && !expectedType.test(type || blob.type)) throw new Error('The server returned an unexpected file response. Please sign in and try again.');
  if (!blob.size) throw new Error('The generated file was empty. Please try again.');
  if (/text\/html/i.test(blob.type || type)) throw new Error('The server returned a web page instead of a download. Please sign in and try again.');
  if (/application\/pdf/i.test(type || blob.type) && await blob.slice(0, 4).text() !== '%PDF') throw new Error('The generated PDF was invalid. Please try again.');
}
export async function downloadBlob(blob: Blob, filename: string, expectedType?: RegExp) {
  await validateDownloadBlob(blob, blob.type, expectedType);
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.style.display = 'none'; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); return blob;
}
export async function downloadBrowserFile(response: Response, fallbackFilename: string, expectedType?: RegExp) {
  if (!response.ok) throw new Error(await errorFrom(response));
  const type = response.headers.get('content-type') || '';
  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get('content-disposition') || response.headers.get('x-document-filename'), fallbackFilename);
  await validateDownloadBlob(blob, type, expectedType);
  return downloadBlob(blob, filename);
}
