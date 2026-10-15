import { useEffect, useState } from 'react';
import { APP_LIST, APPS } from '../apps/meta';
import { useLocal, useRows, useSetting } from '../db';
import { lockNow } from '../lib/lock';
import { pad } from '../lib/dates';
import { useSync } from '../lib/sync';
import { fmtClock, remainingMs, useTimer } from '../lib/timer';
import { Pixel } from '../pixel/Pixel';
import { useWM } from './wm';
import { Balloon, showBalloon } from './balloon';
import { useRef } from 'react';

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
}

const SYNC_LABEL: Record<string, string> = {
  signed_out: 'Sincronización: sin sesión',
  idle: 'Sincronizado',
  syncing: 'Sincronizando…',
  offline: 'Sin internet: los cambios se guardan aquí y se subirán después',
  error: 'Error de sincronización',
};

export function Taskbar({ assistantHidden, onShowAssistant }: { assistantHidden: boolean; onShowAssistant: () => void }) {
  const wm = useWM();
  const [start, setStart] = useState(false);
  const [now, setNow] = useState(new Date());
  const timer = useTimer();
  const inbox = useRows('inbox').filter((i) => !i.processed).length;
  const sync = useSync();
  const [aiEnabled] = useSetting('aiEnabled', false);
  const [lockCfg] = useLocal<unknown>('lock', null);
  const locked = lockCfg != null;

  // Tray balloons for connection changes.
  const prevPhase = useRef(sync.phase);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = sync.phase;
    if (sync.phase === 'offline' && prev !== 'offline' && prev !== 'unconfigured')
      showBalloon('Sin conexión', 'Puedes seguir usando FloppyOS: tus cambios se guardan aquí y se subirán al volver internet.', { icon: '⌁', sound: false });
    if (sync.phase === 'idle' && prev === 'offline') showBalloon('Sincronizado', 'Volvió la conexión y tus cambios ya están en la nube.', { icon: '☁' });
    if (sync.phase === 'error' && prev !== 'error') showBalloon('Problema al sincronizar', sync.error ?? 'Revisa Panel de control → Sincronización.', { icon: '⚠', onClick: () => wm.open('settings', { tab: 'sync' }) });
  }, [sync.phase]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!start) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.startmenu, .start-btn')) setStart(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [start]);

  const launch = (fn: () => void) => () => {
    fn();
    setStart(false);
  };

  return (
    <>
      {start && (
        <div className="startmenu" role="menu">
          <div className="startmenu-side">
            <span>
              Floppy<b>OS</b> 2000
            </span>
          </div>
          <div className="startmenu-items">
            {APP_LIST.filter((a) => a.id !== 'ask' || aiEnabled).map((a) => (
              <button key={a.id} role="menuitem" onClick={launch(() => wm.open(a.id))}>
                <Pixel sprite={a.icon} scale={2} />
                <span>{a.title}</span>
              </button>
            ))}
            <hr />
            {assistantHidden && (
              <button role="menuitem" onClick={launch(onShowAssistant)}>
                <Pixel sprite="clippy" scale={1} />
                <span>Mostrar asistente</span>
              </button>
            )}
            {locked && (
              <button role="menuitem" onClick={launch(lockNow)}>
                <Pixel sprite="computer" scale={2} />
                <span>Bloquear</span>
              </button>
            )}
            {document.fullscreenEnabled && (
              <button role="menuitem" onClick={launch(toggleFullscreen)}>
                <Pixel sprite="computer" scale={2} />
                <span>{document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa'}</span>
              </button>
            )}
            <button role="menuitem" onClick={launch(() => wm.open('settings', { tab: 'sync' }))}>
              <Pixel sprite="floppy" scale={2} />
              <span>Respaldo y sincronización…</span>
            </button>
          </div>
        </div>
      )}
      <Balloon />
      <footer className="taskbar">
        <button className={`start-btn ${start ? 'pressed' : ''}`} onClick={() => setStart((s) => !s)} aria-expanded={start}>
          <Pixel sprite="floppy" scale={1} />
          <b>Inicio</b>
        </button>
        <div className="task-buttons">
          {wm.wins.map((w) => (
            <button
              key={w.id}
              className={`task-btn ${wm.topId === w.id ? 'pressed' : ''}`}
              data-taskbtn={w.id}
              onClick={() => (wm.topId === w.id ? wm.minimize(w.id) : wm.focus(w.id))}
            >
              <Pixel sprite={APPS[w.appId].icon} scale={1} />
              <span>{APPS[w.appId].title}</span>
            </button>
          ))}
        </div>
        <div className="tray">
          {timer.phase !== 'idle' && (
            <button className={`tray-item ${timer.phase}`} onClick={() => wm.open('timer')} title="Sesión de estudio">
              <Pixel sprite="timer" scale={1} /> {timer.running ? fmtClock(remainingMs(timer)) : 'pausa'}
            </button>
          )}
          {inbox > 0 && (
            <button className="tray-item" onClick={() => wm.open('inbox')} title="Elementos sin organizar">
              <Pixel sprite="inbox" scale={1} /> {inbox}
            </button>
          )}
          {sync.phase !== 'unconfigured' && (
            <button
              className={`tray-item sync-${sync.phase}`}
              onClick={() => wm.open('settings', { tab: 'sync' })}
              title={SYNC_LABEL[sync.phase] + (sync.lastSync ? ` · última: ${new Date(sync.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '') + (sync.error ? ` · ${sync.error}` : '')}
              aria-label={SYNC_LABEL[sync.phase]}
            >
              {sync.phase === 'syncing' ? '⟳' : sync.phase === 'idle' ? '☁' : sync.phase === 'offline' ? '⌁' : '!'}
            </button>
          )}
          <span className="clock">
            {pad(now.getHours())}:{pad(now.getMinutes())}
          </span>
        </div>
      </footer>
    </>
  );
}
