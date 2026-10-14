import type { Subject } from '../db';
import { Dot } from '../os/ui';
import { Pixel } from '../pixel/Pixel';
import { stickerById } from '../pixel/stickers';

export function SubjectIcon({ s, big }: { s: Subject; big?: boolean }) {
  const def = s.icon ? stickerById(s.icon) : undefined;
  if (!def) return <Dot color={s.color} size={big ? 14 : 10} />;
  return <span className="subject-icon" style={{ background: s.color }}><Pixel sprite={def.rows} scale={big ? 2 : 1} /></span>;
}
