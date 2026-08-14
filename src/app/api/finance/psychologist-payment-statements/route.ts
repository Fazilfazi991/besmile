import { NextResponse } from 'next/server';
import { generateOfficialReport } from '@/lib/official-document-engine';
import { canGeneratePsychologistPaymentStatements, canViewPsychologistPaymentStatements } from '@/lib/psychologist-payment-statement-access';
import { psychologistPaymentStatementFilename, psychologistPaymentStatementReport, type PsychologistPaymentStatement, type PsychologistPaymentStatementItem } from '@/lib/psychologist-payment-statement';
import { serverSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET() {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await canViewPsychologistPaymentStatements(db)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const history = await db.from('psychologist_payment_statements')
    .select('id,statement_number,psychologist_id,psychologist_name,period_start,period_end,statement_date,payment_status,session_count,total_amount,currency,paid_date_from,paid_date_to,payment_references,version,supersedes_statement_id,file_name,page_count,generated_at')
    .eq('generation_status', 'available').order('generated_at', { ascending: false }).limit(50);
  if (history.error) return NextResponse.json({ error: 'Unable to load statement history.' }, { status: 500 });
  return NextResponse.json({ history: history.data || [] });
}

export async function POST(request: Request) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await canGeneratePsychologistPaymentStatements(db)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  let preparedId = '';
  let storagePath = '';
  try {
    const payload = await request.json();
    let payableIds = Array.isArray(payload?.payableIds) ? payload.payableIds.filter((id: unknown) => typeof id === 'string') : [];
    const sourceStatementId = typeof payload?.sourceStatementId === 'string' ? payload.sourceStatementId : null;
    if (sourceStatementId) {
      const source = await db.from('psychologist_payment_statement_items').select('payable_id')
        .eq('statement_id', sourceStatementId).order('line_number');
      if (source.error || !source.data?.length) return NextResponse.json({ error: 'The statement to regenerate is unavailable.' }, { status: 400 });
      payableIds = source.data.map((item: { payable_id: string }) => item.payable_id);
    }
    payableIds = [...new Set(payableIds)];
    if (!payableIds.length || payableIds.length > 500) return NextResponse.json({ error: 'Select between 1 and 500 eligible payables.' }, { status: 400 });

    const prepared = await db.rpc('prepare_psychologist_payment_statement', {
      target_payable_ids: payableIds,
      target_supersedes_statement: sourceStatementId,
    });
    if (prepared.error || !prepared.data) throw new Error(prepared.error?.message || 'Unable to prepare the payment statement.');
    const statement = (Array.isArray(prepared.data) ? prepared.data[0] : prepared.data) as PsychologistPaymentStatement;
    if (!statement?.id) throw new Error('Unable to prepare the payment statement.');
    preparedId = statement.id;

    const itemRows = await db.from('psychologist_payment_statement_items').select('*')
      .eq('statement_id', statement.id).order('line_number');
    if (itemRows.error) throw new Error('Unable to load the immutable payable snapshot.');
    const report = psychologistPaymentStatementReport(statement, itemRows.data as PsychologistPaymentStatementItem[]);
    const { buffer, pageCount } = await generateOfficialReport(report);
    const filename = psychologistPaymentStatementFilename(statement);
    storagePath = `company/${user.id}/official/psychologist-payments/${statement.id}-${filename}`;
    const upload = await db.storage.from('employee-documents').upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
    if (upload.error) throw new Error('Unable to store the generated statement PDF.');

    const finalized = await db.rpc('finalize_psychologist_payment_statement', {
      target_statement: statement.id,
      target_storage_path: storagePath,
      target_file_name: filename,
      target_file_size: buffer.length,
      target_page_count: pageCount,
    });
    if (finalized.error) throw new Error(finalized.error.message || 'Unable to save statement history.');

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Document-Filename': encodeURIComponent(filename),
        'X-Statement-Id': statement.id,
        'X-Statement-Number': statement.statement_number,
        'X-Document-Pages': String(pageCount),
      },
    });
  } catch (error) {
    if (storagePath) await db.storage.from('employee-documents').remove([storagePath]);
    if (preparedId) await db.rpc('discard_prepared_psychologist_payment_statement', { target_statement: preparedId });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Statement generation failed.' }, { status: 400 });
  }
}
