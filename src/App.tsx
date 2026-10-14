import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { APP_LIST, type AppId } from './apps/meta';
import { APP_COMPONENTS } from './apps/registry';
import { db, useSetting } from './db';
import type { LockConfig } from './lib/lock';
import { LockScreen } from './os/LockScreen';
import { init as initSync } from './lib/sync';
import { useWallpaperCss } from './lib/wallpaper';
import { useReminderEngine } from './lib/reminders';
import { Pixel } from './pixel/Pixel';
import { Assistant, type AssistantId } from './os/Assistant';
import { DesktopStickers } from './os/DesktopStickers';
import { Taskbar } from './os/Taskbar';
import { Window } from './os/Window';
import { useWM, WMProvider } from './os/wm';

export type ThemeId = 'lavanda' | 'rosa' | 'noche' | 'teal98' | 'clasico';

function Desktop() {
  const wm = useWM();
  const [selected, setSelected] = useState<AppId | null>(null);
  const [assistant, setAssistant] = useSetting<AssistantId | 'rover' | 'none'>('assistant', 'cat');
  const [theme] = useSetting<ThemeId>('theme', 'lavanda');
  const [titleColor] = useSetting<string | null>('titleColor', null);
  const [dots] = useSetting('desktopDots', true);
  const wallpaper = useWallpaperCss();
  useReminderEngine();
  const [, force] = useState(0);

  useEffect(() => {
    wm.open('today');
    void initSync();
    const r = () => force((n) => n + 1);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    // Custom title bar colour overrides the theme's gradient (per-app tints still win when enabled).
    if (titleColor) {
      root.style.setProperty('--title-a', titleColor);
      root.style.setProperty('--title-b', `color-mix(in srgb, ${titleColor} 45%, white)`);
    } else {
      root.style.removeProperty('--title-a');
      root.style.removeProperty('--title-b');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = titleColor ?? getComputedStyle(root).getPropertyValue('--title-a').trim();
    if (meta && color) meta.setAttribute('content', color);
  }, [theme, titleColor]);

  const iconDown = (id: AppId) => (e: RPointerEvent) => {
    setSelected(id);
    if (e.pointerType === 'touch') wm.open(id);
  };

  return (
    <div className="desktop" style={wallpaper} onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
      {dots && !wallpaper.background && <div className="desk-dots" aria-hidden="true" />}
      <DesktopStickers />
      <div className="icons">
        {APP_LIST.filter((a) => a.desktop).map((a) => (
          <button
            key={a.id}
            className={`desk-icon ${selected === a.id ? 'sel' : ''}`}
            aria-label={a.title}
            onPointerDown={iconDown(a.id)}
            onDoubleClick={() => wm.open(a.id)}
            onKeyDown={(e) => e.key === 'Enter' && wm.open(a.id)}
          >
            <Pixel sprite={a.icon} scale={3} />
            <span>{a.title}</span>
          </button>
        ))}
      </div>

      {wm.wins.map((w) => {
        const C = APP_COMPONENTS[w.appId];
        return (
          <Window key={w.id} win={w}>
            <C {...(w.props ?? {})} />
          </Window>
        );
      })}

      {assistant !== 'none' && <Assistant who={assistant} onHide={() => setAssistant('none')} />}
      <Taskbar assistantHidden={assistant === 'none'} onShowAssistant={() => setAssistant('cat')} />
    </div>
  );
}

export default function App() {
  // undefined while loading → render nothing, so the desktop never flashes before the lock appears.
  const lock = useLiveQuery(async () => ((await db.local.get('lock'))?.value as LockConfig | undefined) ?? null);
  const [unlocked, setUnlocked] = useState(false);
  const last = useRef(Date.now());

  useEffect(() => {
    const touch = () => (last.current = Date.now());
    const doLock = () => setUnlocked(false);
    const onVis = () => {
      if (document.visibilityState === 'visible' && lock?.autoLockMin && Date.now() - last.current > lock.autoLockMin * 60000) doLock();
    };
    const id = setInterval(() => {
      if (lock?.autoLockMin && Date.now() - last.current > lock.autoLockMin * 60000) doLock();
    }, 15000);
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    window.addEventListener('floppyos-lock', doLock);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      window.removeEventListener('floppyos-lock', doLock);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [lock?.autoLockMin]);

  if (lock === undefined) return null;
  if (lock && !unlocked) return <LockScreen cfg={lock} onUnlock={() => { last.current = Date.now(); setUnlocked(true); }} />;
  return (
    <WMProvider>
      <Desktop />
    </WMProvider>
  );
}
