import { useEffect, useState } from 'react';
import { playSound } from '../lib/sounds';
import { Pixel } from '../pixel/Pixel';

/** Short Windows-style boot splash with a block progress bar. */
export function BootScreen({ onDone }: { onDone: () => void }) {
  const [blocks, setBlocks] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBlocks((b) => b + 1), 70);
    const end = setTimeout(() => {
      playSound('startup');
      onDone();
    }, 1500);
    return () => {
      clearInterval(id);
      clearTimeout(end);
    };
  }, []);
  return (
    <div className="boot-screen" onClick={onDone} role="status" aria-label="Iniciando FloppyOS">
      <div className="boot-logo">
        <Pixel sprite="floppy" scale={6} />
        <div className="boot-name">
          Floppy<b>OS</b>
        </div>
        <div className="boot-sub">Gestión académica</div>
      </div>
      <div className="boot-bar" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <i key={i} style={{ left: `${((blocks * 6 + i * 14) % 130) - 30}%` }} />
        ))}
      </div>
      <div className="boot-hint">Iniciando…</div>
    </div>
  );
}
