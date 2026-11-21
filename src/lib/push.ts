import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = 'BK-_hVyrW02w389B9reVSNKRm7pgua5VuypBvrlHCCMcvyp0uXV27tt6e7VKFMsCg-t0VA8sIgqzDVLkkKXrlj4';

/* eslint-disable @typescript-eslint/no-explicit-any */
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function registerAdminSw() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined);
  });
}

function b64ToUint8(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function adminPushIsOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try { return !!(await currentSubscription()); } catch { return false; }
}

export async function enableAdminPush(lang: string): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY) as unknown as BufferSource });
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('BAD_SUBSCRIPTION');
  const { error } = await rpc('save_admin_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_lang: lang });
  if (error) throw new Error(error.message);
  return 'ok';
}

export async function disableAdminPush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await rpc('remove_admin_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export async function sendAdminTestPush(): Promise<void> {
  const { error } = await rpc('admin_push_test');
  if (error) throw new Error(error.message);
}
