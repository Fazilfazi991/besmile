export type MessageReceiptStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

type Receipt = {
  profile_id?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
};

export function resolveMessageReceipt({
  own,
  localStatus,
  recipientProfileIds,
  receipts,
}: {
  own: boolean;
  localStatus?: string | null;
  recipientProfileIds: string[];
  receipts?: Receipt[] | null;
}): MessageReceiptStatus | null {
  if (!own) return null;
  if (localStatus === "failed") return "failed";
  if (localStatus === "sending") return "sending";

  const recipients = [...new Set(recipientProfileIds)];
  if (!recipients.length) return "sent";
  const byProfile = new Map((receipts || []).map((receipt) => [receipt.profile_id, receipt]));

  if (recipients.every((profileId) => Boolean(byProfile.get(profileId)?.read_at))) return "read";
  if (recipients.every((profileId) => Boolean(byProfile.get(profileId)?.delivered_at))) return "delivered";
  return "sent";
}
