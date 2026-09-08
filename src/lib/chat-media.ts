export const isChatImageAttachment = (message: { attachment_type?: string | null; attachment_name?: string | null }) =>
  /^(?:image\/(?:jpeg|png|webp|gif))$/i.test(message.attachment_type || "") ||
  /\.(?:jpe?g|png|webp|gif)$/i.test(message.attachment_name || "");
