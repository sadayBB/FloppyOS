import { useSyncExternalStore } from 'react';
import type { ID } from '../db';

export type Phase = 'idle' | 'focus' | 'break';

export interface TimerState {
  phase: Phase;
  running: boolean;
  /** Epoch ms when the current phase ends (while running). */
  phaseEndsAt?: number;
  /** Remaining ms of the phase (while paused). */
  remainingMs: number;
  /** Completed focus/break time, not counting the running segment. */
  focusMs: number;
  breakMs: number;
  segStart?: number;
  startedAt?: number;
  cycles: number;
  goal: string;
  subjectId?: ID;
  topicId?: ID;
  taskId?: ID;
  awaitingClose: boolean;
  config: { focusMin: number; breakMin: number; longBreakMin: number; longEvery: number };
}

const KEY = 'floppyos.timer';
const initial: TimerState = {
  phase: 'idle',
  running: false,
  remainingMs: 25 * 60000,
  focusMs: 0,
  breakMs: 0,
  cycles: 0,
  goal: '',
  awaitingClose: false,
  config: { focusMin: 25, breakMin: 5, longBreakMin: 15, longEvery: 4 },
};

let state: TimerState = load();
let snapshot = { state, tick: 0 };
const listeners = new Set<() => void>();
function emit() {
  snapshot = { state, tick: snapshot.tick + 1 };
  listeners.forEach((l) => l());
}

function load(): TimerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initial, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return initial;
}

function set(next: Partial<TimerState>) {
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
  emit();
}

function closeSegment(now: number): Partial<TimerState> {
  if (!state.running || !state.segStart) return {};
  const seg = now - state.segStart;
  return state.phase === 'focus' ? { focusMs: state.focusMs + seg } : { breakMs: state.breakMs + seg };
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.18, 0.36].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = i === 2 ? 880 : 660;
      g.gain.value = 0.05;
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.12);
    });
  } catch {
    /* no audio */
  }
}

export function notify(title: string, body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: './icon-192.png' });
  } catch {
    /* notifications unavailable */
  }
}

function switchPhase(now: number) {
  const acc = closeSegment(now);
  const c = state.config;
  if (state.phase === 'focus') {
    const cycles = state.cycles + 1;
    const len = (cycles % c.longEvery === 0 ? c.longBreakMin : c.breakMin) * 60000;
    set({ ...acc, cycles, phase: 'break', phaseEndsAt: now + len, remainingMs: len, segStart: now });
    notify('FloppyOS', '¡Bloque de concentración terminado! Toca descanso.');
  } else {
    const len = c.focusMin * 60000;
    set({ ...acc, phase: 'focus', phaseEndsAt: now + len, remainingMs: len, segStart: now });
    notify('FloppyOS', 'Descanso terminado. ¡De vuelta al estudio!');
  }
  beep();
}

setInterval(() => {
  if (state.running && state.phaseEndsAt && Date.now() >= state.phaseEndsAt) switchPhase(Date.now());
  else if (state.running) emit();
}, 500);

export const timer = {
  get: () => state,
  setConfig(config: TimerState['config']) {
    set({ config, ...(state.phase === 'idle' ? { remainingMs: config.focusMin * 60000 } : {}) });
  },
  setLinks(links: Partial<Pick<TimerState, 'goal' | 'subjectId' | 'topicId' | 'taskId'>>) {
    set(links);
  },
  start() {
    const now = Date.now();
    const len = state.config.focusMin * 60000;
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    set({ phase: 'focus', running: true, startedAt: now, segStart: now, phaseEndsAt: now + len, remainingMs: len, focusMs: 0, breakMs: 0, cycles: 0, awaitingClose: false });
  },
  pause() {
    const now = Date.now();
    set({ ...closeSegment(now), running: false, remainingMs: Math.max(0, (state.phaseEndsAt ?? now) - now), segStart: undefined, phaseEndsAt: undefined });
  },
  resume() {
    const now = Date.now();
    set({ running: true, segStart: now, phaseEndsAt: now + state.remainingMs });
  },
  skip() {
    const now = Date.now();
    if (!state.running) timer.resume();
    switchPhase(now);
  },
  stop() {
    const now = Date.now();
    set({ ...closeSegment(now), running: false, segStart: undefined, phaseEndsAt: undefined, awaitingClose: true });
  },
  reset() {
    set({ ...initial, config: state.config, remainingMs: state.config.focusMin * 60000, goal: '', subjectId: undefined, topicId: undefined, taskId: undefined });
  },
};

export function remainingMs(s: TimerState) {
  return s.running && s.phaseEndsAt ? Math.max(0, s.phaseEndsAt - Date.now()) : s.remainingMs;
}
export function totals(s: TimerState) {
  const seg = s.running && s.segStart ? Date.now() - s.segStart : 0;
  return {
    focusMs: s.focusMs + (s.phase === 'focus' ? seg : 0),
    breakMs: s.breakMs + (s.phase === 'break' ? seg : 0),
  };
}
export const fmtClock = (ms: number) => {
  const sec = Math.ceil(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
};

export function useTimer() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  ).state;
}
