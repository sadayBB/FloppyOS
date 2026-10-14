import { useEffect, useState, type PointerEvent as RPointerEvent } from 'react';
import { APP_LIST, type AppId } from './apps/meta';
import { APP_COMPONENTS } from './apps/registry';
import { useSetting } from './db';
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
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = getComputedStyle(document.documentElement).getPropertyValue('--title-a').trim();
    if (meta && color) meta.setAttribute('content', color);
  }, [theme]);

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
  return (
    <WMProvider>
      <Desktop />
    </WMProvider>
  );
}
