import { NextResponse } from 'next/server';
import { canViewPsychologistPaymentStatements } from '@/lib/psychologist-payment-statement-access';
import { serverSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ statementId: string }> }) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await canViewPsychologistPaymentStatements(db)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const { statementId } = await context.params;
  const statement = await db.from('psychologist_payment_statements').select('id,file_name,storage_path')
    .eq('id', statementId).eq('generation_status', 'available').maybeSingle();
  if (statement.error || !statement.data) return NextResponse.json({ error: 'Statement not found.' }, { status: 404 });
  const audit = await db.rpc('record_psychologist_payment_statement_download', { target_statement: statementId });
  if (audit.error) return NextResponse.json({ error: 'Unable to authorize statement download.' }, { status: 403 });
  const file = await db.storage.from('employee-documents').download(statement.data.storage_path);
  if (file.error || !file.data) return NextResponse.json({ error: 'Statement file is unavailable.' }, { status: 404 });
  return new Response(new Uint8Array(await file.data.arrayBuffer()), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${statement.data.file_name}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Document-Filename': encodeURIComponent(statement.data.file_name),
    },
  });
}
