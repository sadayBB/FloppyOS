import { DATA_TABLES, db } from '../db';

/*
 * Optional PIN lock. The PIN is never stored: only a PBKDF2-SHA256 hash with a random salt.
 * It hides the app from anyone who picks up the device; it does not encrypt the stored data
 * (someone with developer tools and the unlocked device could still inspect it).
 */

export interface LockConfig {
  salt: string;
  hash: string;
  iterations: number;
  autoLockMin: number; // 0 = only on open / manual
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;

export const lockSupported = () => !!globalThis.crypto?.subtle && window.isSecureContext;

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function setPin(pin: string, autoLockMin: number) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 310_000;
  const cfg: LockConfig = { salt: b64(salt), hash: await derive(pin, salt, iterations), iterations, autoLockMin };
  await db.local.put({ key: 'lock', value: cfg });
}

export async function updateAutoLock(autoLockMin: number) {
  const cur = (await db.local.get('lock'))?.value as LockConfig | undefined;
  if (cur) await db.local.put({ key: 'lock', value: { ...cur, autoLockMin } });
}

export async function removePin() {
  await db.local.delete('lock');
}

/** Constant-time comparison of two base64 strings. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifyPin(cfg: LockConfig, pin: string) {
  return same(await derive(pin, unb64(cfg.salt), cfg.iterations), cfg.hash);
}

const ATTEMPTS_KEY = 'floppyos.lock.attempts';
export function getAttempts(): { count: number; until: number } {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '') as { count: number; until: number };
  } catch {
    return { count: 0, until: 0 };
  }
}
export function recordFailure() {
  const a = getAttempts();
  const count = a.count + 1;
  // 5 free tries, then a growing wait: 30 s, 60 s, 120 s…
  const until = count >= 5 ? Date.now() + 30_000 * 2 ** Math.min(6, count - 5) : 0;
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ count, until }));
  return until;
}
export const resetAttempts = () => localStorage.removeItem(ATTEMPTS_KEY);

/** Erases everything stored by FloppyOS on this device (data, settings, keys, session). */
export async function wipeDevice() {
  await Promise.all([...DATA_TABLES.map((t) => db.table(t).clear()), db.settings.clear(), db.local.clear()]);
  for (const k of Object.keys(localStorage)) if (k.startsWith('floppyos')) localStorage.removeItem(k);
  location.reload();
}

export const lockNow = () => window.dispatchEvent(new Event('floppyos-lock'));
