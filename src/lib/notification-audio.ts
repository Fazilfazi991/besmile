'use client';

export const NOTIFICATION_SOUND_URL = '/mixkit-software-interface-start-2574.wav';

let audio: HTMLAudioElement | null = null;

function notificationAudio() {
  if (typeof window === 'undefined') return null;
  if (!audio) {
    audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.preload = 'auto';
    audio.volume = 0.7;
  }
  return audio;
}

let unlocked = false;

export async function unlockNotificationAudio() {
  if (unlocked) return;
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
    console.log('[NotificationAudio] unlocked');
  } catch (error) {
    player.muted = false;
    console.error('[NotificationAudio] playback blocked or failed', error);
  }
}

export async function playNotificationSound() {
  const player = notificationAudio();
  if (!player) return { ok: false as const, error: new Error('Audio is only available in the browser') };
  try {
    console.log('[NotificationAudio] enabled', true);
    console.log('[NotificationAudio] unlocked', unlocked);
    console.log('[NotificationAudio] readyState', player.readyState);
    console.log('[NotificationAudio] muted', player.muted);
    console.log('[NotificationAudio] volume', player.volume);
    player.pause();
    player.currentTime = 0;
    await player.play();
    console.log('[NotificationAudio] playing sound');
    return { ok: true as const };
  } catch (error) {
    console.error('[NotificationAudio] playback blocked or failed', error);
    return { ok: false as const, error };
  }
}

export const notificationAudioIsUnlocked = () => unlocked;
