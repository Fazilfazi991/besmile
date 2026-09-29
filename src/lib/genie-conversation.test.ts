import { describe, expect, it } from 'vitest';
import {
  GENIE_ACKNOWLEDGEMENT_REPLY,
  genieAcknowledgementReply,
  withoutLeadingGenieGreeting,
} from './genie-conversation';

describe('Genie conversational acknowledgements', () => {
  it.each(['ok', 'okay', 'thanks', 'thank you', 'got it', 'understood', 'yes', '  Thank you!  '])(
    'handles %s without policy retrieval',
    (message) => expect(genieAcknowledgementReply(message)).toBe(GENIE_ACKNOWLEDGEMENT_REPLY),
  );

  it('does not swallow unsupported policy questions', () => {
    expect(genieAcknowledgementReply('Okay, where can I park my car?')).toBeNull();
    expect(genieAcknowledgementReply('What is the travel reimbursement policy?')).toBeNull();
  });

  it.each([
    ['Hi', 'Hi! How can I help?'],
    ['Hello', 'Hello! How can I help?'],
    ['Good morning', 'Good morning! How can I help?'],
    ['Good afternoon', 'Good afternoon! How can I help?'],
    ['Good evening', 'Good evening! How can I help?'],
  ])('handles pure greeting %s deterministically', (message, reply) => {
    expect(genieAcknowledgementReply(message)).toBe(reply);
  });

  it('does not consume mixed policy, action, or workflow intent', () => {
    expect(genieAcknowledgementReply('Hi, what is the leave policy?')).toBeNull();
    expect(genieAcknowledgementReply('Hi, add a lead')).toBeNull();
    expect(genieAcknowledgementReply('Confirm the current workflow')).toBeNull();
    expect(genieAcknowledgementReply('Cancel the current workflow')).toBeNull();
    expect(withoutLeadingGenieGreeting('Hi, what is the leave policy?')).toBe('what is the leave policy?');
    expect(withoutLeadingGenieGreeting('Hi, add a lead')).toBe('add a lead');
  });
});
