import { useMemo } from 'react';
import { useSetting } from '../db';
import { CAT_FRAMES } from './catFrames';
import { Pixel } from './Pixel';

export { CAT_FRAMES };

/** Fur presets: [highlight, base, shade, outline]. */
export const FURS: { id: string; name: string; c: [string, string, string, string] }[] = [
  { id: 'naranja', name: 'Naranja', c: ['#ffd08a', '#f5a55a', '#d9782f', '#7a3b1e'] },
  { id: 'gris', name: 'Gris', c: ['#e9e9f2', '#babacb', '#8b8ba2', '#3f3f57'] },
  { id: 'negro', name: 'Negro', c: ['#6d6584', '#47405b', '#2f2a40', '#141120'] },
  { id: 'blanco', name: 'Blanco', c: ['#ffffff', '#f4eff7', '#d9d0e3', '#867b98'] },
  { id: 'crema', name: 'Crema', c: ['#fff3db', '#f2d9ac', '#d6b47e', '#7a5a32'] },
  { id: 'rosa', name: 'Rosa', c: ['#ffd9ea', '#ffaed0', '#e57fae', '#8a3d64'] },
  { id: 'lila', name: 'Lila', c: ['#ece3ff', '#c5b0f6', '#9b83dd', '#4b3a86'] },
  { id: 'menta', name: 'Menta', c: ['#dcfff2', '#a2e9d0', '#5fc4a6', '#2a6b5a'] },
];
export const EYES: { id: string; name: string; c: string }[] = [
  { id: 'verde', name: 'Verdes', c: '#5fc48a' },
  { id: 'azul', name: 'Azules', c: '#6fb6ff' },
  { id: 'ambar', name: 'Ámbar', c: '#f2b33d' },
  { id: 'violeta', name: 'Violetas', c: '#b58cff' },
];

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(Math.max(0, Math.min(1, l)) * 100)}%)`;

/** Derives highlight/shade/outline from any base colour, shifting hue slightly like hand-picked ramps. */
export function rampFrom(base: string): [string, string, string, string] {
  const [h, s, l] = hexToHsl(base);
  return [hsl(h - 8, s * 0.9, l + 0.14), base, hsl(h + 8, Math.min(1, s * 1.05), l - 0.14), hsl(h + 14, Math.min(1, s * 0.9), Math.min(l - 0.38, 0.28))];
}

export interface CatLook {
  fur: string; // preset id or #hex
  eyes: string;
  pattern: 'atigrado' | 'liso';
}
export const DEFAULT_CAT: CatLook = { fur: 'naranja', eyes: 'verde', pattern: 'atigrado' };

export function catPalette(look: CatLook): Record<string, string> {
  const ramp = look.fur.startsWith('#') ? rampFrom(look.fur) : (FURS.find((f) => f.id === look.fur) ?? FURS[0]).c;
  return {
    '1': ramp[0],
    '2': ramp[1],
    '3': ramp[2],
    '4': ramp[3],
    s: look.pattern === 'atigrado' ? ramp[2] : ramp[1],
    w: '#fff6ec',
    e: '#2b1d2e',
    i: (EYES.find((e) => e.id === look.eyes) ?? EYES[0]).c,
    p: '#ff9fb8',
    n: '#ff7aa0',
  };
}

export function useCat() {
  const [look, setLook] = useSetting<CatLook>('catLook', DEFAULT_CAT);
  const [name, setName] = useSetting('catName', 'Michi');
  const palette = useMemo(() => catPalette(look), [look.fur, look.eyes, look.pattern]);
  return { look, setLook, name, setName, palette };
}

export function CatSprite({ frame = 'cat', scale = 3, palette }: { frame?: keyof typeof CAT_FRAMES; scale?: number; palette: Record<string, string> }) {
  return <Pixel sprite={CAT_FRAMES[frame]} scale={scale} palette={palette} />;
}
