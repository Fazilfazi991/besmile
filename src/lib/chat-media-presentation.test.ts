import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isChatImageAttachment } from './chat-media';
const hub = readFileSync('src/components/chat-hub.tsx', 'utf8');
describe('Teams media presentation', () => {
  it('uses a dedicated coordinated voice renderer with play, seek and duration', () => {
    expect(hub).toContain('<VoiceMessage message={message} />');
    expect(hub).toContain('bsmile:voice-play');
    expect(hub).toContain('type="range"');
    expect(hub).toContain('audioRef.current.currentTime');
  });
  it('recognizes supported images without treating documents as images', () => {
    for (const type of ['image/jpeg','image/png','image/webp','image/gif']) expect(isChatImageAttachment({ attachment_type: type })).toBe(true);
    expect(isChatImageAttachment({ attachment_type: 'application/pdf' })).toBe(false);
    expect(hub).toContain('onError={() => setFailed(true)}');
    expect(hub).toContain('UNAVAILABLE');
  });
});
