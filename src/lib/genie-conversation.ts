const ACKNOWLEDGEMENTS = new Set([
  'ok',
  'okay',
  'thanks',
  'thank you',
  'got it',
  'understood',
  'yes',
]);

const GREETINGS = new Map([
  ['hi', 'Hi! How can I help?'],
  ['hello', 'Hello! How can I help?'],
  ['good morning', 'Good morning! How can I help?'],
  ['good afternoon', 'Good afternoon! How can I help?'],
  ['good evening', 'Good evening! How can I help?'],
]);

const LEADING_GREETING = /^(?:hi|hello|good morning|good afternoon|good evening)\b[\s,!?.;:-]+/i;

export const GENIE_ACKNOWLEDGEMENT_REPLY =
  'Got it. Ask me anything else about the approved BSmile policies.';

export function genieAcknowledgementReply(message: string) {
  const normalized = message
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[.!?,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (ACKNOWLEDGEMENTS.has(normalized)) return GENIE_ACKNOWLEDGEMENT_REPLY;
  return GREETINGS.get(normalized) || null;
}

export function withoutLeadingGenieGreeting(message: string) {
  return message.replace(LEADING_GREETING, '').trim();
}
