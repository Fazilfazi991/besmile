import type { MessageReceiptStatus } from "@/lib/chat-receipt";

const LABELS: Record<MessageReceiptStatus, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Send failed",
};

export function MessageReceipt({ status }: { status: MessageReceiptStatus }) {
  return (
    <span className={`message-receipt is-${status}`} role="img" aria-label={LABELS[status]} title={LABELS[status]}>
      {status === "sending" ? (
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.25" /><path d="M8 4.8v3.5l2.2 1.35" /></svg>
      ) : status === "failed" ? (
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 4.7v3.7" /><circle className="message-receipt-dot" cx="8" cy="11" r=".8" /></svg>
      ) : status === "sent" ? (
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.4l3.1 2.9L13 4.7" /></svg>
      ) : (
        <svg viewBox="0 0 20 16" aria-hidden="true"><path d="M2.5 8.5l3 2.8 5.8-6" /><path d="M7.2 8.5l3 2.8 7.1-6.8" /></svg>
      )}
    </span>
  );
}
