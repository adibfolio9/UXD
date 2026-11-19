import { LeadNotification } from '../types';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export function playNewLeadChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const now = ctx.currentTime;

    const notes = [659.25, 880]; // Clean E5 -> A5 two-note chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.3);
    });
  } catch {
    // Ignore autoplay/WebAudio restrictions
  }
}

export function supportsBrowserNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!supportsBrowserNotifications()) return 'unsupported';
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!supportsBrowserNotifications()) return 'unsupported';
  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

export function showBrowserLeadNotification(
  notification: LeadNotification,
  onSelectCandidate?: (candidateId: string) => void
): void {
  if (!supportsBrowserNotifications() || window.Notification.permission !== 'granted') {
    return;
  }
  try {
    const desktopAlert = new window.Notification(
      `${notification.title}: ${notification.candidateName}`,
      {
        body: notification.message,
        icon: '/assets/aistudio/image_9e6b3606.png',
        tag: notification.id,
      }
    );
    desktopAlert.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore focus restriction inside iframe
      }
      if (onSelectCandidate) {
        onSelectCandidate(notification.candidateId);
      }
      desktopAlert.close();
    };
  } catch {
    // Ignore Notification construction errors inside restricted frames
  }
}
