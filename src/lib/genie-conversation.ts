const ACKNOWLEDGEMENTS = new Set([
  'ok',
  'okay',
  'thanks',
  'thank you',
  'got it',
  'understood',
  'yes',
]);

export const GENIE_ACKNOWLEDGEMENT_REPLY =
  'Got it. Ask me anything else about the approved BSmile policies.';

export function genieAcknowledgementReply(message: string) {
  const normalized = message
    .toLowerCase()
    .replace(/[.!?,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ACKNOWLEDGEMENTS.has(normalized) ? GENIE_ACKNOWLEDGEMENT_REPLY : null;
}
