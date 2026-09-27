import { describe, expect, it } from 'vitest';
import { GENIE_ACKNOWLEDGEMENT_REPLY, genieAcknowledgementReply } from './genie-conversation';

describe('Genie conversational acknowledgements', () => {
  it.each(['ok', 'okay', 'thanks', 'thank you', 'got it', 'understood', 'yes', '  Thank you!  '])(
    'handles %s without policy retrieval',
    (message) => expect(genieAcknowledgementReply(message)).toBe(GENIE_ACKNOWLEDGEMENT_REPLY),
  );

  it('does not swallow unsupported policy questions', () => {
    expect(genieAcknowledgementReply('Okay, where can I park my car?')).toBeNull();
    expect(genieAcknowledgementReply('What is the travel reimbursement policy?')).toBeNull();
  });
});
