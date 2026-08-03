import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationAudioIsUnlocked, playNotificationSound, resetNotificationAudioForTests, unlockNotificationAudio } from './notification-audio';

class MockAudio {
  static instances: MockAudio[] = [];
  static play = vi.fn(() => Promise.resolve());
  muted = false;
  preload = '';
  volume = 1;
  currentTime = 0;
  readyState = 4;
  constructor(public src: string) { MockAudio.instances.push(this); }
  play() { return MockAudio.play(); }
  pause = vi.fn();
}

describe('notification audio', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Audio', MockAudio);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    MockAudio.instances = [];
    MockAudio.play.mockReset();
    MockAudio.play.mockResolvedValue(undefined);
    resetNotificationAudioForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetNotificationAudioForTests();
  });

  it('does not attempt playback before audio is unlocked', async () => {
    const result = await playNotificationSound();

    expect(result).toEqual({ ok: false, skipped: 'locked' });
    expect(MockAudio.play).not.toHaveBeenCalled();
    expect(notificationAudioIsUnlocked()).toBe(false);
  });

  it('unlocks after a supported user interaction and then plays one sound', async () => {
    await unlockNotificationAudio();
    const result = await playNotificationSound();

    expect(notificationAudioIsUnlocked()).toBe(true);
    expect(result).toEqual({ ok: true });
    expect(MockAudio.play).toHaveBeenCalledTimes(2);
  });

  it('quietly handles expected autoplay failures without retry storms or unhandled rejections', async () => {
    MockAudio.play.mockRejectedValueOnce(new DOMException('user gesture required', 'NotAllowedError'));

    await expect(unlockNotificationAudio()).resolves.toBeUndefined();
    await expect(unlockNotificationAudio()).resolves.toBeUndefined();
    const result = await playNotificationSound();

    expect(result).toEqual({ ok: false, skipped: 'locked' });
    expect(MockAudio.play).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
