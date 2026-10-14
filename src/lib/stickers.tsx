import { useEffect, useState } from 'react';
import { db, newId, useLocal, useRows } from '../db';
import { Pixel } from '../pixel/Pixel';
import { stickerById, STICKERS, type StickerStats } from '../pixel/stickers';
import { toISO } from './dates';

export interface CustomSticker {
  id: string;
  name: string;
  blob: Blob;
}
export interface PlacedSticker {
  uid: string;
  sid: string; // built-in id or `custom:<id>`
  x: number; // % of desktop width
  y: number; // % of desktop height
  size: number; // px
  rot: number;
}

export function useStickerStats(): StickerStats {
  const tasks = useRows('tasks');
  const sessions = useRows('sessions');
  const topics = useRows('topics');
  const inbox = useRows('inbox');
  const events = useRows('events');
  const notes = useRows('notes');
  return {
    tasksDone: tasks.filter((t) => t.status === 'completada').length,
    sessions: sessions.length,
    focusMin: sessions.reduce((a, s) => a + s.focusMin, 0),
    studyDays: new Set(sessions.map((s) => toISO(new Date(s.startedAt)))).size,
    topics: topics.length,
    mastered: topics.filter((t) => t.status === 'dominado').length,
    captures: inbox.length,
    exams: events.filter((e) => e.kind === 'examen').length,
    notes: notes.length,
  };
}

export function useUnlocked() {
  const stats = useStickerStats();
  return new Set(STICKERS.filter((s) => s.unlocked(stats)).map((s) => s.id));
}

// Stable empty defaults: a fresh [] per render would re-trigger effects that depend on these lists.
const NO_CUSTOM: CustomSticker[] = [];
const NO_PLACED: PlacedSticker[] = [];

export function useCustom(): [CustomSticker[], (v: CustomSticker[]) => Promise<void>] {
  return useLocal<CustomSticker[]>('customStickers', NO_CUSTOM);
}

export function usePlaced(): [PlacedSticker[], (v: PlacedSticker[]) => Promise<void>] {
  return useLocal<PlacedSticker[]>('desktopStickers', NO_PLACED);
}

/** Appends a sticker reading the stored list at call time, so rapid taps don't overwrite each other. */
export async function placeSticker(sid: string) {
  const cur = ((await db.local.get('desktopStickers'))?.value as PlacedSticker[] | undefined) ?? [];
  const s: PlacedSticker = { uid: newId(), sid, x: 30 + Math.random() * 45, y: 15 + Math.random() * 55, size: 72, rot: Math.round(Math.random() * 16 - 8) };
  await db.local.put({ key: 'desktopStickers', value: [...cur, s] });
}

function BlobImg({ blob, size, alt }: { blob: Blob; size: number; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} draggable={false} style={{ width: size, height: size, objectFit: 'contain', imageRendering: 'pixelated' }} /> : null;
}

/** Renders a built-in or custom sticker at roughly `size` px. */
export function StickerView({ sid, size, custom }: { sid: string; size: number; custom: CustomSticker[] }) {
  if (sid.startsWith('custom:')) {
    const c = custom.find((x) => `custom:${x.id}` === sid);
    return c ? <BlobImg blob={c.blob} size={size} alt={c.name} /> : null;
  }
  const def = stickerById(sid);
  if (!def) return null;
  const w = Math.max(...def.rows.map((r) => r.length));
  return <Pixel sprite={def.rows} scale={Math.max(1, Math.round(size / Math.max(w, def.rows.length)))} />;
}
