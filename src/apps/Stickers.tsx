import { useRef, useState } from 'react';
import { newId } from '../db';
import { placeSticker, StickerView, useCustom, usePlaced, useStickerStats, useUnlocked } from '../lib/stickers';
import { Pixel } from '../pixel/Pixel';
import { STICKERS } from '../pixel/stickers';
import { Btn, Progress } from '../os/ui';

const silhouette = (rows: string[]) => rows.map((r) => r.replace(/[^.]/g, 'G'));

/** Sticker album: unlock by studying, stick them on the desktop, or upload your own. */
export default function Stickers() {
  const unlocked = useUnlocked();
  const stats = useStickerStats();
  const [placed, setPlaced] = usePlaced();
  const [custom, setCustom] = useCustom();
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const stick = (sid: string) => {
    void placeSticker(sid);
    setMsg('¡Pegado en el escritorio! Arrástralo donde quieras; tócalo para cambiar el tamaño o quitarlo.');
  };
  const upload = async (files: FileList) => {
    const next = [...custom];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > 2 * 1024 * 1024) {
        setMsg(`«${f.name}» pesa más de 2 MB; usa una imagen más pequeña.`);
        continue;
      }
      next.push({ id: newId(), name: f.name.replace(/\.[^.]+$/, ''), blob: f });
    }
    await setCustom(next);
  };

  return (
    <div className="app scroll stickers-app">
      <div className="album-head">
        <div>
          <h2>Álbum de stickers</h2>
          <p className="hint">Se desbloquean usando FloppyOS. Nunca se pierden, aunque descanses una semana.</p>
        </div>
        <div className="album-progress">
          {unlocked.size}/{STICKERS.length}
          <Progress value={unlocked.size / STICKERS.length} color="var(--accent)" />
        </div>
      </div>
      {msg && <p className="notice">{msg}</p>}

      <div className="album">
        {STICKERS.map((s) => {
          const ok = unlocked.has(s.id);
          return (
            <button key={s.id} className={`album-slot ${ok ? '' : 'locked'}`} onClick={() => ok && stick(s.id)} title={ok ? `Pegar «${s.name}» en el escritorio` : s.hint}>
              <Pixel sprite={ok ? s.rows : silhouette(s.rows)} scale={4} />
              <b>{ok ? s.name : '???'}</b>
              <span className="hint">{ok ? 'Toca para pegar' : s.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="section-title">Mis stickers</div>
      <p className="hint">Sube tus propias imágenes (PNG con fondo transparente se ven mejor). Se guardan solo en este dispositivo.</p>
      <div className="album">
        {custom.map((c) => (
          <div key={c.id} className="album-slot">
            <button className="slot-btn" onClick={() => stick(`custom:${c.id}`)} title="Pegar en el escritorio">
              <StickerView sid={`custom:${c.id}`} size={64} custom={custom} />
            </button>
            <b className="ellipsis">{c.name}</b>
            <button className="link muted tiny" onClick={() => void setCustom(custom.filter((x) => x.id !== c.id))}>Quitar</button>
          </div>
        ))}
        <button className="album-slot add" onClick={() => file.current?.click()}>
          <span className="plus">+</span>
          <b>Subir imagen</b>
        </button>
      </div>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />

      {placed.length > 0 && (
        <p>
          <Btn small onClick={() => void setPlaced([])}>Quitar todos los stickers del escritorio</Btn>
        </p>
      )}
      <p className="hint">Llevas {stats.sessions} sesiones, {stats.tasksDone} tareas completadas y {Math.round(stats.focusMin / 60)} h de estudio.</p>
    </div>
  );
}
