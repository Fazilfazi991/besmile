import 'server-only';
import { createSign } from 'node:crypto';

type Field = 'timestamp' | 'customerName' | 'staffMember' | 'rating' | 'message' | 'sessionCount' | 'service';
type Row = Record<string, string>;
export type CustomerFeedback = { id: string; submittedAt?: string; customerName?: string; staffMember?: string; rating?: number; message?: string; sessionCount?: string; service?: string; fields: Row };
export type CustomerFeedbackResult = { items: CustomerFeedback[]; headers: string[]; configured: boolean; warning?: string; updatedAt: string };
const aliases: Record<Field, string[]> = { timestamp: ['timestamp'], customerName: ['your name', 'customer name', 'name'], staffMember: ['psychologist name', 'staff member', 'counsellor name'], rating: ['rate your experience', 'rating'], message: ['feeling feedback', 'feedback', 'comments'], sessionCount: ['no of session', 'number of sessions'], service: ['service', 'department'] };
const normal = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const base64url = (value: string) => Buffer.from(value).toString('base64url');
const env = (key: string) => process.env[key]?.trim() || '';

function mapping(headers: string[]) {
  let override: Partial<Record<Field, string>> = {};
  try { override = JSON.parse(env('GOOGLE_FEEDBACK_COLUMN_MAP') || '{}') as Partial<Record<Field, string>>; } catch { throw new Error('GOOGLE_FEEDBACK_COLUMN_MAP must be valid JSON.'); }
  return Object.fromEntries((Object.keys(aliases) as Field[]).map((field) => [field, headers.find((header) => normal(header) === normal(override[field] || '')) || headers.find((header) => aliases[field].some((value) => normal(header).includes(value)))])) as Partial<Record<Field, string>>;
}
async function accessToken() {
  const email = env('GOOGLE_SERVICE_ACCOUNT_EMAIL'); const key = env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google Sheets feedback integration is not configured.');
  const now = Math.floor(Date.now() / 1000); const claim = { iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 300 };
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claim))}`; const signer = createSign('RSA-SHA256'); signer.update(unsigned); const jwt = `${unsigned}.${signer.sign(key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const body = await response.json(); if (!response.ok || !body.access_token) throw new Error('Google Sheets authentication failed.'); return body.access_token as string;
}
export async function getCustomerFeedback(): Promise<CustomerFeedbackResult> {
  const id = env('GOOGLE_FEEDBACK_SPREADSHEET_ID'); const sheet = env('GOOGLE_FEEDBACK_SHEET_NAME');
  if (!id || !sheet) return { items: [], headers: [], configured: false, warning: 'Google Sheets feedback is not configured yet.', updatedAt: new Date().toISOString() };
  const token = await accessToken(); const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(sheet)}`, { headers: { authorization: `Bearer ${token}` }, next: { revalidate: 60 } }); const body = await response.json();
  if (!response.ok) throw new Error('Google Sheets feedback could not be loaded.'); const values: string[][] = body.values || []; const headers = values[0] || []; const fields = mapping(headers); const items = values.slice(1).map((cells, index) => { const row = Object.fromEntries(headers.map((header, column) => [header, String(cells[column] || '')])); const ratingValue = fields.rating ? Number(row[fields.rating]) : NaN; return { id: `${index + 2}-${row[fields.timestamp || headers[0]] || ''}`, submittedAt: fields.timestamp ? row[fields.timestamp] : undefined, customerName: fields.customerName ? row[fields.customerName] : undefined, staffMember: fields.staffMember ? row[fields.staffMember] : undefined, rating: Number.isFinite(ratingValue) ? ratingValue : undefined, message: fields.message ? row[fields.message] : undefined, sessionCount: fields.sessionCount ? row[fields.sessionCount] : undefined, service: fields.service ? row[fields.service] : undefined, fields }; });
  return { items, headers, configured: true, warning: fields.timestamp ? undefined : 'Timestamp heading was not detected; responses are shown in Sheet order.', updatedAt: new Date().toISOString() };
}
