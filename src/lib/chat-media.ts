export const isChatImageAttachment = (message: { attachment_type?: string | null }) => /^(?:image\/(?:jpeg|png|webp|gif))$/i.test(message.attachment_type || "");
