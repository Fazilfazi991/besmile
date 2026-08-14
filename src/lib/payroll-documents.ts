export async function downloadPayrollDocument(url: string) {
  const response = await fetch(url, { credentials: 'include' });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('application/pdf')) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Payroll document could not be generated.');
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  const disposition = response.headers.get('content-disposition') || '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'BSmile_Payroll.pdf';
  const anchor = document.createElement('a'); anchor.href = blobUrl; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(blobUrl);
}
