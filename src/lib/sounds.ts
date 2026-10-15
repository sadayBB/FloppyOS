import { db } from '../db';

/*
 * Retro system sounds synthesised with WebAudio (no audio files). Browsers only allow audio after
 * the first tap/click, so a sound requested earlier is played as soon as the user interacts.
 */

type Note = { f: number; t: number; d: number; type?: OscillatorType; v?: number };
const SOUNDS: Record<'startup' | 'ding' | 'error' | 'done' | 'notify', Note[]> = {
  startup: [
    { f: 392, t: 0, d: 0.35, type: 'triangle' },
    { f: 523.25, t: 0.12, d: 0.35, type: 'triangle' },
    { f: 659.25, t: 0.24, d: 0.4, type: 'triangle' },
    { f: 783.99, t: 0.36, d: 0.7, type: 'triangle' },
    { f: 1046.5, t: 0.36, d: 0.7, type: 'sine', v: 0.03 },
  ],
  ding: [{ f: 880, t: 0, d: 0.35, type: 'sine' }, { f: 1320, t: 0, d: 0.25, type: 'sine', v: 0.02 }],
  error: [{ f: 220, t: 0, d: 0.18, type: 'square', v: 0.035 }, { f: 165, t: 0.16, d: 0.28, type: 'square', v: 0.035 }],
  done: [
    { f: 659.25, t: 0, d: 0.15, type: 'square', v: 0.03 },
    { f: 783.99, t: 0.15, d: 0.15, type: 'square', v: 0.03 },
    { f: 1046.5, t: 0.3, d: 0.4, type: 'square', v: 0.03 },
  ],
  notify: [{ f: 1046.5, t: 0, d: 0.12, type: 'sine' }, { f: 1318.5, t: 0.1, d: 0.2, type: 'sine' }],
};
export type SoundName = keyof typeof SOUNDS;

let ctx: AudioContext | null = null;
let pending: SoundName | null = null;
let enabled = true;
void db.settings.get('sounds').then((r) => (enabled = r?.value !== false));
db.settings.hook('updating', (mods, key) => {
  if (key === 'sounds' && 'value' in (mods as object)) enabled = (mods as { value: unknown }).value !== false;
});
db.settings.hook('creating', (key, obj) => {
  if (key === 'sounds') enabled = (obj as { value: unknown }).value !== false;
});

function render(name: SoundName) {
  if (!ctx) ctx = new AudioContext();
  const c = ctx;
  for (const n of SOUNDS[name]) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = n.type ?? 'sine';
    o.frequency.value = n.f;
    const start = c.currentTime + n.t;
    const vol = n.v ?? 0.05;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
    o.connect(g).connect(c.destination);
    o.start(start);
    o.stop(start + n.d + 0.05);
  }
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      pending = name; // played on the next user gesture
      void ctx.resume().then(() => {
        if (ctx?.state === 'running' && pending) {
          render(pending);
          pending = null;
        }
      });
      return;
    }
    render(name);
  } catch {
    /* audio unavailable */
  }
}

const unlock = () => {
  if (ctx?.state === 'suspended') void ctx.resume().then(() => {
    if (pending) render(pending);
    pending = null;
  });
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
