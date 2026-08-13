import { NextResponse } from 'next/server';
import { generateOfficialReport } from '@/lib/official-document-engine';
import { canGenerateOfficialReport, validateOfficialReportPayload } from '@/lib/official-report-types';
import { serverSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const input = validateOfficialReportPayload(await request.json());
    if (!await canGenerateOfficialReport(db, input.reportType)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    const { buffer, pageCount } = await generateOfficialReport(input);
    const audit = await db.rpc('record_official_report_generation', {
      report_type: input.reportType,
      report_context: input.context,
      generated_pages: pageCount,
      generated_rows: input.rows.length,
    });
    if (audit.error && !/record_official_report_generation|schema cache/i.test(audit.error.message || '')) console.warn('official_report_audit_failed');
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${input.filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Document-Filename': encodeURIComponent(input.filename),
        'X-Document-Pages': String(pageCount),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Report generation failed.' }, { status: 400 });
  }
}
