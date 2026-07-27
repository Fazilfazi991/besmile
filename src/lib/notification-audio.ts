'use client';

export const NOTIFICATION_SOUND_URL = '/mixkit-software-interface-start-2574.wav';

const audio = new Audio(NOTIFICATION_SOUND_URL);
audio.preload = 'auto';
audio.volume = 0.7;

let unlocked = false;

export async function unlockNotificationAudio() {
  if (unlocked) return;
  try {
    audio.muted = true;
    audio.pause();
    audio.currentTime = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    unlocked = true;
    console.log('[NotificationAudio] unlocked');
  } catch (error) {
    audio.muted = false;
    console.error('[NotificationAudio] playback blocked or failed', error);
  }
}

export async function playNotificationSound() {
  try {
    audio.pause();
    audio.currentTime = 0;
    await audio.play();
    console.log('[NotificationAudio] playing sound');
  } catch (error) {
    console.error('[NotificationAudio] playback blocked or failed', error);
  }
}

export const notificationAudioIsUnlocked = () => unlocked;
