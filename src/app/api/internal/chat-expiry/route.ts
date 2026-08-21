import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const service = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Machine-only hourly worker. It is never callable by an ordinary browser session.
async function run(request: Request) {
  const workerAuthorized = Boolean(process.env.CHAT_EXPIRY_WORKER_SECRET) && request.headers.get("x-chat-expiry-worker-secret") === process.env.CHAT_EXPIRY_WORKER_SECRET;
  const cronAuthorized = Boolean(process.env.CRON_SECRET) && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!workerAuthorized && !cronAuthorized)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = service();
  const expired = await admin.rpc("expire_chat_messages");
  if (expired.error) return NextResponse.json({ error: expired.error.message }, { status: 500 });
  const { data: attachments, error } = await admin.from("chat_messages").select("id,attachment_path,attachment_cleanup_attempts").in("attachment_cleanup_state", ["pending", "failed"]).not("attachment_path", "is", null).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let completed = 0;
  for (const attachment of attachments || []) {
    const claim = await admin.from("chat_messages").update({ attachment_cleanup_state: "processing", attachment_cleanup_attempts: attachment.attachment_cleanup_attempts + 1, attachment_cleanup_last_error: null }).eq("id", attachment.id).in("attachment_cleanup_state", ["pending", "failed"]).select("id");
    if (claim.error || !claim.data?.length) continue;
    const result = await admin.storage.from("chat-attachments").remove([attachment.attachment_path]);
    const missingObject = /not found|does not exist/i.test(result.error?.message || "");
    const state = result.error && !missingObject ? "failed" : "completed";
    await admin.from("chat_messages").update({ attachment_cleanup_state: state, attachment_cleanup_last_error: state === "failed" ? result.error?.message.slice(0, 500) : null }).eq("id", attachment.id).eq("attachment_cleanup_state", "processing");
    if (state === "completed") completed++;
  }
  return NextResponse.json({ expired: expired.data || 0, cleaned: completed });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
