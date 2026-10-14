import { useRef, useState } from 'react';
import type { ThemeId } from '../App';
import { DATA_TABLES, db, useLocal, useSetting } from '../db';
import { downloadJSON, exportAll, mergeBackup } from '../lib/backup';
import { today } from '../lib/dates';
import { configure, fullResync, getConfig, signIn, signOut, signUp, syncNow, useSync } from '../lib/sync';
import { DEFAULT_REMINDERS, disablePush, enablePush, testNotification, type ReminderDefaults } from '../lib/reminders';
import { ReminderPicker } from '../os/ReminderPicker';
import { MAX_UPLOAD, PRESETS, type Fit, type Wallpaper } from '../lib/wallpaper';
import type { AssistantId } from '../os/Assistant';
import { Pixel } from '../pixel/Pixel';
import { CatSprite, EYES, FURS, useCat, type CatLook } from '../pixel/cat';
import { Btn, Field, Input, Select, Tabs } from '../os/ui';
import { AI_MODELS, getAiConfig, setAiConfig, testAi, type AiModel } from '../lib/ai';

type Tab = 'general' | 'look' | 'sync' | 'alerts' | 'ai' | 'backup' | 'about';

export default function Settings({ tab: initTab }: { tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initTab ?? 'look');
  return (
    <div className="app">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'look', label: 'Apariencia' },
          { id: 'general', label: 'Estudio' },
          { id: 'alerts', label: 'Avisos' },
          { id: 'ai', label: 'IA' },
          { id: 'sync', label: 'Sincronización' },
          { id: 'backup', label: 'Respaldo' },
          { id: 'about', label: 'Acerca de' },
        ]}
      />
      <div className="scroll tab-body">
        {tab === 'look' && <Look />}
        {tab === 'general' && <General />}
        {tab === 'sync' && <Sync />}
        {tab === 'alerts' && <Alerts />}
        {tab === 'ai' && <AiSettings />}
        {tab === 'backup' && <Backup />}
        {tab === 'about' && <About />}
      </div>
    </div>
  );
}

const THEMES: { id: ThemeId; name: string; colors: string[] }[] = [
  { id: 'lavanda', name: 'Lavanda', colors: ['#7f8cf0', '#a98ae6', '#f09ccb', '#e3dff2'] },
  { id: 'rosa', name: 'Chicle', colors: ['#8f9cf0', '#f07bb8', '#fbd3e7', '#fff2f9'] },
  { id: 'noche', name: 'Noche vaporwave', colors: ['#120f2e', '#3a2068', '#ff5fae', '#3b3466'] },
  { id: 'teal98', name: 'Clásico 98', colors: ['#008080', '#000080', '#1084d0', '#c0c0c0'] },
  { id: 'clasico', name: 'Papel 2000', colors: ['#bfb4a5', '#5f7884', '#a3b5b8', '#d6cdbf'] },
];

function Look() {
  const [theme, setTheme] = useSetting<ThemeId>('theme', 'lavanda');
  const [colorTitles, setColorTitles] = useSetting('colorTitles', true);
  const [dots, setDots] = useSetting('desktopDots', true);
  const [assistant, setAssistant] = useSetting<AssistantId | 'rover' | 'none'>('assistant', 'cat');
  const cat = useCat();
  const [wp, setWp] = useLocal<Wallpaper>('wallpaper', { kind: 'theme' });
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setErr(null);
    if (!f.type.startsWith('image/')) return setErr('Elige un archivo de imagen.');
    if (f.size > MAX_UPLOAD) return setErr('La imagen pesa más de 15 MB.');
    await db.local.put({ key: 'wallpaperImage', value: f });
    await setWp({ kind: 'image', fit: 'cover', pixelated: false });
  };

  return (
    <div className="prose wide-prose">
      <h3>Tema</h3>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button key={t.id} className={`theme-card ${theme === t.id ? 'on' : ''}`} onClick={() => setTheme(t.id)}>
            <span className="theme-swatch">{t.colors.map((c) => <i key={c} style={{ background: c }} />)}</span>
            {t.name}
          </button>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={colorTitles} onChange={(e) => setColorTitles(e.target.checked)} /> Barras de título de colores (cada app con su color)</label>

      <h3>Fondo de escritorio</h3>
      <p className="hint">El fondo se guarda solo en este dispositivo: puedes tener uno en la PC y otro en la tablet.</p>
      <div className="wp-grid">
        <button className={`wp-card ${wp.kind === 'theme' ? 'on' : ''}`} onClick={() => void setWp({ kind: 'theme' })}>
          <span className="wp-thumb" style={{ background: 'var(--desk-bg)' }} />
          Del tema
        </button>
        {PRESETS.map((p) => (
          <button key={p.id} className={`wp-card ${wp.kind === 'preset' && wp.id === p.id ? 'on' : ''}`} onClick={() => void setWp({ kind: 'preset', id: p.id })}>
            <span className="wp-thumb" style={{ background: p.css }} />
            {p.name}
          </button>
        ))}
        <button className={`wp-card ${wp.kind === 'image' ? 'on' : ''}`} onClick={() => file.current?.click()}>
          <span className="wp-thumb upload">+</span>
          Mi imagen…
        </button>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      {err && <p className="error">⚠ {err}</p>}
      {wp.kind === 'image' && (
        <div className="form">
          <Field label="Ajuste">
            <Select value={wp.fit} onChange={(e) => void setWp({ ...wp, fit: e.target.value as Fit })}>
              <option value="cover">Llenar pantalla</option>
              <option value="contain">Ajustar</option>
              <option value="center">Centrar</option>
              <option value="tile">Mosaico</option>
            </Select>
          </Field>
          <label className="check"><input type="checkbox" checked={wp.pixelated} onChange={(e) => void setWp({ ...wp, pixelated: e.target.checked })} /> Píxeles nítidos (para pixel art)</label>
          <Btn small onClick={() => file.current?.click()}>Cambiar imagen</Btn>
        </div>
      )}
      {wp.kind === 'theme' && <label className="check"><input type="checkbox" checked={dots} onChange={(e) => setDots(e.target.checked)} /> Cuadrícula de puntitos sobre el fondo</label>}

      <h3>Asistente</h3>
      <div className="assistant-pick">
        {(['cat', 'clippy', 'none'] as const).map((a) => (
          <button key={a} className={`theme-card ${(assistant === 'rover' ? 'cat' : assistant) === a ? 'on' : ''}`} onClick={() => setAssistant(a)}>
            {a === 'none' ? <span className="none-face">zZz</span> : a === 'cat' ? <CatSprite scale={2} palette={cat.palette} /> : <Pixel sprite="clippy" scale={2} />}
            {a === 'cat' ? cat.name || 'Michi' : a === 'clippy' ? 'Clippy' : 'Ninguno'}
          </button>
        ))}
      </div>
      {(assistant === 'cat' || assistant === 'rover') && <CatEditor />}
    </div>
  );
}

function CatEditor() {
  const { look, setLook, name, setName, palette } = useCat();
  const set = (c: Partial<CatLook>) => setLook({ ...look, ...c });
  const custom = look.fur.startsWith('#');
  return (
    <div className="cat-editor">
      <div className="cat-preview">
        <CatSprite scale={5} palette={palette} />
      </div>
      <div className="cat-fields">
        <Field label="Nombre"><Input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="field">
          <span>Pelaje</span>
          <div className="fur-swatches">
            {FURS.map((f) => (
              <button key={f.id} className={`fur ${look.fur === f.id ? 'on' : ''}`} title={f.name} aria-label={f.name} onClick={() => set({ fur: f.id })} style={{ background: `linear-gradient(135deg, ${f.c[0]} 0 35%, ${f.c[1]} 35% 70%, ${f.c[2]} 70%)` }} />
            ))}
            <label className={`fur custom ${custom ? 'on' : ''}`} title="Elegir cualquier color">
              <input type="color" value={custom ? look.fur : '#9b83dd'} onChange={(e) => set({ fur: e.target.value })} aria-label="Color personalizado" />
              🎨
            </label>
          </div>
        </div>
        <div className="field">
          <span>Ojos</span>
          <div className="fur-swatches">
            {EYES.map((e) => (
              <button key={e.id} className={`fur eye ${look.eyes === e.id ? 'on' : ''}`} title={e.name} aria-label={`Ojos ${e.name}`} onClick={() => set({ eyes: e.id })} style={{ background: e.c }} />
            ))}
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={look.pattern === 'atigrado'} onChange={(e) => set({ pattern: e.target.checked ? 'atigrado' : 'liso' })} /> Rayitas de atigrado</label>
      </div>
    </div>
  );
}

function NumberSetting({ k, def, label, unit }: { k: string; def: number; label: string; unit: string }) {
  const [v, set] = useSetting(k, def);
  return (
    <Field label={`${label} (${unit})`}>
      <Input type="number" min={0} value={v} onChange={(e) => set(Math.max(0, +e.target.value || 0))} />
    </Field>
  );
}

function General() {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  return (
    <div className="form">
      <NumberSetting k="dailyCapacityMin" def={240} label="Capacidad diaria de estudio/trabajo" unit="min" />
      <NumberSetting k="weeklyGoalMin" def={600} label="Meta semanal de estudio" unit="min" />
      <NumberSetting k="focusMin" def={25} label="Bloque de concentración" unit="min" />
      <NumberSetting k="breakMin" def={5} label="Descanso corto" unit="min" />
      <NumberSetting k="longBreakMin" def={15} label="Descanso largo (cada 4 bloques)" unit="min" />
      <div className="wide">
        Notificaciones del sistema: <b>{perm === 'granted' ? 'activadas' : perm === 'denied' ? 'bloqueadas' : 'sin decidir'}</b>{' '}
        {perm === 'default' && <Btn small onClick={async () => setPerm(await Notification.requestPermission())}>Activar</Btn>}
        <p className="hint">Avisan al terminar un pomodoro mientras FloppyOS está abierto. Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      </div>
    </div>
  );
}

function Sync() {
  const sync = useSync();
  const cfg = getConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.anonKey ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (typeof r === 'string') setMsg(r);
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const status: Record<string, string> = {
    unconfigured: 'Sin configurar: tus datos solo están en este dispositivo.',
    signed_out: 'Configurado, falta iniciar sesión.',
    idle: 'Sincronizado ☁',
    syncing: 'Sincronizando…',
    offline: 'Sin internet. Puedes seguir usando todo; los cambios se subirán al reconectar.',
    error: `Error: ${sync.error ?? 'desconocido'}`,
  };

  return (
    <div className="prose">
      <p className={`sync-status ${sync.phase}`}>
        <b>{status[sync.phase]}</b>
        {sync.email && <><br />Cuenta: {sync.email}</>}
        {sync.lastSync && <><br />Última sincronización: {new Date(sync.lastSync).toLocaleString()}</>}
      </p>

      {sync.phase === 'unconfigured' || !cfg ? (
        <>
          <h3>1. Conectar con Supabase</h3>
          <ol className="steps">
            <li><b>Dirección del proyecto:</b> copia la dirección de tu navegador mientras estás en el panel de tu proyecto (algo como <code>supabase.com/dashboard/project/abcdxyz…</code>) y pégala tal cual. También sirve la «Project URL» (botón <b>Connect</b> arriba en el panel) o solo el ID del proyecto.</li>
            <li><b>Clave:</b> en <b>Project Settings → API Keys</b>, copia la <b>Publishable key</b> (empieza con <code>sb_publishable_</code>). ¡Nunca la «Secret key»!</li>
          </ol>
          <div className="form">
            <Field label="Dirección o ID del proyecto" wide><Input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="supabase.com/dashboard/project/abcd…  ó  https://abcd.supabase.co" /></Field>
            <Field label="Publishable key" wide><Input value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="sb_publishable_…" /></Field>
          </div>
          <Btn primary disabled={!url || !key || busy} onClick={() => run(() => configure({ url, anonKey: key }))}>Guardar conexión</Btn>
        </>
      ) : sync.phase === 'signed_out' ? (
        <>
          <h3>2. Iniciar sesión</h3>
          <p className="hint">La primera vez usa «Crear cuenta». En tus otros dispositivos, inicia sesión con el mismo correo y contraseña.</p>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void run(() => signIn(email, password)); }}>
            <Field label="Correo"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Contraseña"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <div className="wide row-btns">
              <Btn primary type="submit" disabled={busy || !email || !password}>Iniciar sesión</Btn>
              <Btn type="button" disabled={busy || !email || password.length < 6} onClick={() => run(() => signUp(email, password))}>Crear cuenta</Btn>
            </div>
          </form>
          <p><button className="link muted" onClick={() => void configure(null)}>Cambiar proyecto de Supabase</button></p>
        </>
      ) : (
        <>
          <div className="row-btns">
            <Btn primary disabled={busy || sync.phase === 'syncing'} onClick={() => run(syncNow)}>Sincronizar ahora</Btn>
            <Btn disabled={busy} onClick={() => run(fullResync)}>Sincronización completa</Btn>
            <Btn disabled={busy} onClick={() => run(signOut)}>Cerrar sesión</Btn>
          </div>
          <p className="hint">Se sincroniza sola: al hacer cambios, al volver a la app, al recuperar internet y cada 2 minutos. Sin internet todo sigue funcionando y se guarda en este dispositivo.</p>
        </>
      )}
      {msg && <p className="notice">{msg}</p>}
    </div>
  );
}

function AiSettings() {
  const cfg = getAiConfig();
  const [key, setKey] = useState('');
  const [model, setModel] = useState<AiModel>(cfg?.model ?? 'claude-opus-5-5');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  const save = (apiKey: string) => {
    setAiConfig({ apiKey, model });
    force((n) => n + 1);
  };
  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(`✓ ${await testAi()}`);
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    }
    setBusy(false);
  };
  return (
    <div className="prose">
      <h3>Inteligencia artificial (Claude)</h3>
      <p>Las funciones con ✨ usan Claude, de Anthropic: interpretar notas rápidas, dividir tareas en pasos, crear tarjetas desde tus apuntes, resumir clases, ordenar temarios difíciles y responder preguntas sobre tu semestre.</p>
      <ul className="steps">
        <li>Crea una clave en <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">platform.claude.com → API Keys</a> (requiere saldo; cada uso cuesta centavos).</li>
        <li>Se guarda <b>solo en este dispositivo</b>: no se sincroniza ni se sube a GitHub. En la tablet tendrás que pegarla también.</li>
        <li>Solo se envía información a Claude cuando tocas un botón ✨, y nada se guarda sin que lo revises.</li>
      </ul>
      {cfg ? (
        <p className="notice">✓ Clave configurada (…{cfg.apiKey.slice(-4)})</p>
      ) : (
        <div className="form">
          <Field label="Clave de API" wide><Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="sk-ant-…" /></Field>
        </div>
      )}
      <div className="form">
        <Field label="Modelo" wide>
          <Select value={model} onChange={(e) => { const m = e.target.value as AiModel; setModel(m); if (cfg) setAiConfig({ ...cfg, model: m }); }}>
            {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.note}</option>)}
          </Select>
        </Field>
      </div>
      <div className="row-btns">
        {!cfg && <Btn primary disabled={!key.startsWith('sk-')} onClick={() => save(key)}>Guardar clave</Btn>}
        {cfg && <Btn primary disabled={busy} onClick={() => void test()}>{busy ? 'Probando…' : 'Probar conexión'}</Btn>}
        {cfg && <Btn onClick={() => { setAiConfig(null); setKey(''); force((n) => n + 1); }}>Quitar clave</Btn>}
      </div>
      {msg && <p className="notice">{msg}</p>}
    </div>
  );
}

function Alerts() {
  const [d, setD] = useSetting<ReminderDefaults>('reminderDefaults', DEFAULT_REMINDERS);
  const [push, setPush] = useLocal('pushEnabled', false);
  const sync = useSync();
  const [msg, setMsg] = useState<string | null>(null);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const run = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      const r = await fn();
      if (typeof r === 'string') setMsg(r);
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    }
    setPerm(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  };
  return (
    <div className="prose wide-prose">
      <h3>Avisos predeterminados</h3>
      <p className="hint">Se usan cuando una tarea o evento no tiene avisos propios. Cada uno se puede cambiar en su ficha.</p>
      <div className="form">
        <Field label="Hora para lo que no tiene hora"><Input type="time" value={d.dayStart} onChange={(e) => setD({ ...d, dayStart: e.target.value || '08:00' })} /></Field>
        <Field label="Tareas con fecha" wide><ReminderPicker value={d.task} onChange={(v) => setD({ ...d, task: v ?? DEFAULT_REMINDERS.task })} /></Field>
        <Field label="Exámenes y entregas" wide><ReminderPicker value={d.exam} onChange={(v) => setD({ ...d, exam: v ?? DEFAULT_REMINDERS.exam })} /></Field>
        <Field label="Otros eventos" wide><ReminderPicker value={d.event} onChange={(v) => setD({ ...d, event: v ?? DEFAULT_REMINDERS.event })} /></Field>
      </div>

      <h3>Con la app abierta</h3>
      <p>Notificaciones: <b>{perm === 'granted' ? 'permitidas ✓' : perm === 'denied' ? 'bloqueadas (cámbialo en la configuración del sitio)' : 'sin decidir'}</b></p>
      <div className="row-btns">
        {perm !== 'granted' && <Btn primary onClick={() => run(() => Notification.requestPermission())}>Permitir notificaciones</Btn>}
        <Btn onClick={() => run(testNotification)} disabled={perm !== 'granted'}>Probar aviso</Btn>
      </div>
      <p className="hint">Mientras FloppyOS esté abierta (aunque sea en segundo plano y sin internet), te avisa a tiempo.</p>

      <h3>Con la app cerrada</h3>
      <p className="hint">Necesita la sincronización con Supabase y una configuración única en tu proyecto (ver «Recordatorios push» en el README). Actívalo en cada dispositivo donde quieras recibirlos.</p>
      {sync.phase === 'unconfigured' || sync.phase === 'signed_out' ? (
        <p className="notice">Primero conecta e inicia sesión en la pestaña Sincronización.</p>
      ) : push ? (
        <div className="row-btns">
          <span className="notice">✓ Activado en este dispositivo</span>
          <Btn onClick={() => run(async () => { await disablePush(); await setPush(false); return 'Desactivado en este dispositivo.'; })}>Desactivar</Btn>
        </div>
      ) : (
        <Btn primary onClick={() => run(async () => { const m = await enablePush(); await setPush(true); return m; })}>Activar avisos con la app cerrada</Btn>
      )}
      {msg && <p className="notice">{msg}</p>}
    </div>
  );
}

function Backup() {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastExport, setLastExport] = useSetting<number | null>('lastExport', null);

  const doExport = async () => {
    downloadJSON(await exportAll(), `floppyos-respaldo-${today()}.json`);
    setLastExport(Date.now());
  };
  const doImport = async (f: File) => {
    try {
      const r = await mergeBackup(JSON.parse(await f.text()));
      setMsg(`Listo: ${r.added} registros nuevos y ${r.updated} actualizados. Si un registro existe en ambos lados, gana la versión más reciente.`);
      void fullResync();
    } catch (e) {
      setMsg(`⚠ No se pudo importar: ${(e as Error).message}`);
    }
  };

  return (
    <div className="prose">
      <h3>Guardar en disquete</h3>
      <p>Aunque uses la sincronización, un respaldo de vez en cuando nunca está de más.</p>
      <Btn primary onClick={doExport}>Exportar respaldo (.json)</Btn>
      <p className="hint">Último respaldo: {lastExport ? new Date(lastExport).toLocaleString() : 'nunca'}</p>

      <h3>Importar respaldo</h3>
      <p>La importación <b>fusiona</b>: conserva lo que ya tienes y se queda con la versión más reciente de cada registro.</p>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
      <Btn onClick={() => file.current?.click()}>Importar y fusionar…</Btn>
      {msg && <p className="notice">{msg}</p>}

      <h3>Zona de peligro</h3>
      <Btn
        onClick={async () => {
          if (!confirm('¿Borrar TODOS los datos de este dispositivo? Si usas sincronización, se volverán a descargar al iniciar sesión.')) return;
          if (!confirm('Seguro, ¿de verdad? Lo que no esté sincronizado ni respaldado se perderá.')) return;
          await Promise.all([...DATA_TABLES.map((t) => db.table(t).clear()), db.settings.clear()]);
          localStorage.removeItem('floppyos.sync.cursor');
          setMsg('Datos locales borrados.');
        }}
      >
        Borrar los datos de este dispositivo
      </Btn>
    </div>
  );
}

function About() {
  return (
    <div className="prose">
      <h3>FloppyOS 0.2</h3>
      <p>Gestor de estudios universitarios con alma de Windows 98/2000 y pixel art. Hecho para un solo perfil.</p>
      <h3>Instalar como app</h3>
      <p><b>Tablet Android (Chrome):</b> menú ⋮ → «Instalar app» o «Agregar a pantalla principal». Se abre a pantalla completa, con su propio icono, y funciona sin internet.</p>
      <p><b>PC (Chrome o Edge):</b> el icono de instalar en la barra de direcciones.</p>
      <h3>Sin internet</h3>
      <p>Todo funciona sin conexión: tareas, agenda, temario, apuntes, pomodoro y stickers. Solo la sincronización necesita internet, y se pone al día sola cuando vuelve.</p>
    </div>
  );
}
