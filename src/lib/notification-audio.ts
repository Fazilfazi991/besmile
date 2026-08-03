'use client';

export const NOTIFICATION_SOUND_URL = '/mixkit-software-interface-start-2574.wav';

let audio: HTMLAudioElement | null = null;
let unlocked = false;
let unlockAttempted = false;

function notificationAudio() {
  if (typeof window === 'undefined') return null;
  if (!audio) {
    audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.preload = 'auto';
    audio.volume = 0.7;
  }
  return audio;
}

const isExpectedAutoplayFailure = (error: unknown) => error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name);

export async function unlockNotificationAudio() {
  if (unlocked || unlockAttempted) return;
  unlockAttempted = true;
  const player = notificationAudio();
  if (!player) return;
  try {
    player.muted = true;
    player.pause();
    player.currentTime = 0;
    await player.play();
    player.pause();
    player.currentTime = 0;
    player.muted = false;
    unlocked = true;
  } catch (error) {
    player.muted = false;
    if (!isExpectedAutoplayFailure(error)) console.warn('[NotificationAudio] unlock failed', error);
  }
}

export async function playNotificationSound() {
  const player = notificationAudio();
  if (!player) return { ok: false as const, error: new Error('Audio is only available in the browser') };
  if (!unlocked) return { ok: false as const, skipped: 'locked' as const };
  try {
    player.pause();
    player.currentTime = 0;
    await player.play();
    return { ok: true as const };
  } catch (error) {
    if (!isExpectedAutoplayFailure(error)) console.warn('[NotificationAudio] playback failed', error);
    return { ok: false as const, error };
  }
}

export const notificationAudioIsUnlocked = () => unlocked;

export function resetNotificationAudioForTests() {
  audio = null;
  unlocked = false;
  unlockAttempted = false;
}
