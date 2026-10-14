import type { Subject } from '../db';
import { Dot } from '../os/ui';
import { Pixel } from '../pixel/Pixel';
import { stickerById } from '../pixel/stickers';

export function SubjectIcon({ s, big }: { s: Subject; big?: boolean }) {
  const px = big ? 32 : 18;
  if (s.iconImage)
    return (
      <span className="subject-icon" style={{ background: s.color }}>
        <img src={s.iconImage} alt="" width={px} height={px} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} />
      </span>
    );
  const def = s.icon ? stickerById(s.icon) : undefined;
  if (!def) return <Dot color={s.color} size={big ? 14 : 10} />;
  return <span className="subject-icon" style={{ background: s.color }}><Pixel sprite={def.rows} scale={big ? 2 : 1} /></span>;
}

/** Downscales an uploaded sticker to a tiny PNG so it can travel with the synced subject. */
export async function stickerToIcon(blob: Blob, size = 64): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const fit = Math.min(size / bmp.width, size / bmp.height);
  // Small pixel art is enlarged by whole steps so every pixel stays crisp; big images are shrunk smoothly.
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(bmp, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
  bmp.close();
  return canvas.toDataURL('image/png');
}
