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
    expect(isChatImageAttachment({ attachment_type: null, attachment_name: 'DSC02165.jpeg' })).toBe(true);
    expect(isChatImageAttachment({ attachment_type: 'application/octet-stream', attachment_name: 'photo.PNG' })).toBe(true);
    expect(isChatImageAttachment({ attachment_type: 'application/pdf' })).toBe(false);
    expect(hub).toContain('onError={() => setFailed(true)}');
    expect(hub).toContain('UNAVAILABLE');
    expect(hub).toContain('image && !compact');
    expect(hub).toContain('chat-image-caption');
    expect(hub).toContain('<MessageFile key={message.id} message={message} compact />');
  });
});
