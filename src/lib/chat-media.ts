type ChatAttachmentMetadata = {
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_path?: string | null;
};

const supportedImageExtension = /\.(?:jpe?g|png|webp|gif)$/i;
const genericAttachmentType = /^(?:application\/octet-stream|binary\/octet-stream)?$/i;

export const isChatImageAttachment = (message: ChatAttachmentMetadata) => {
  if (/^image\/(?:jpeg|png|webp|gif)$/i.test(message.attachment_type || "")) return true;
  if (!genericAttachmentType.test(message.attachment_type || "")) return false;
  return supportedImageExtension.test(message.attachment_name || "") && supportedImageExtension.test(message.attachment_path || "");
};
