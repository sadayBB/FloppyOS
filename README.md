# FloppyOS 💾

Plataforma de gestión académica: materias, temarios, tareas, agenda, calificaciones, proyectos y estudio. **Funciona sin internet**, se instala como app en PC y Android y se sincroniza entre dispositivos con Supabase.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/
```

## Guía de puesta en marcha

### 1. Supabase (sincronización entre PC y tablet)

1. Crea una cuenta gratis en <https://supabase.com> y un proyecto nuevo.
2. **SQL Editor → New query**, pega todo [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
3. **Authentication → Sign In / Providers → Email**: desactiva *Confirm email* (más cómodo para una sola persona).
4. Copia dos datos:
   - **Dirección del proyecto**: la URL de tu navegador estando en el panel (`supabase.com/dashboard/project/<ID>`) — FloppyOS la entiende tal cual. También sirve la *Project URL* del botón **Connect**.
   - **Publishable key** (`sb_publishable_…`) en **Project Settings → API Keys**. Nunca la *Secret key*.
5. En FloppyOS: **Panel de control → Sincronización**, pega ambos y pulsa **Crear cuenta** (solo la primera vez). En la tablet, **Iniciar sesión** con el mismo correo.
6. Después desactiva *Allow new users to sign up* en **Authentication** para que nadie más pueda registrarse.
7. **SQL Editor**: ejecuta [`supabase/security.sql`](supabase/security.sql) (endurece permisos; se puede repetir). En la app, **Panel de control → Privacidad → Revisar ahora** comprueba que todo esté bloqueado para desconocidos.

### 2. Recordatorios con la app cerrada (opcional)

Con la app abierta los avisos funcionan siempre (incluso sin internet). Para recibirlos con la app **cerrada**, Supabase los envía como notificaciones push:

1. **SQL Editor**: ejecuta [`supabase/reminders.sql`](supabase/reminders.sql).
2. **Edge Functions → Deploy a new function → Via editor**: nómbrala `send-reminders`, pega [`supabase/functions/send-reminders/index.ts`](supabase/functions/send-reminders/index.ts) y despliega. En los ajustes de la función, **desactiva «Verify JWT»** (se protege con su propio secreto).
3. **Edge Functions → Secrets**: agrega
   - `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`: cópialas del archivo local `supabase/.vapid-keys.local.txt` (no está en GitHub).
   - `CRON_SECRET`: inventa una palabra larga.
   - `VAPID_SUBJECT` (opcional): `mailto:tu-correo`.
4. **SQL Editor**: abre [`supabase/reminders-cron.sql`](supabase/reminders-cron.sql), reemplaza `<<<ID-DEL-PROYECTO>>>` y `<<<CRON_SECRET>>>` y ejecútalo (corre cada minuto).
5. En cada dispositivo: **Panel de control → Avisos → Activar avisos con la app cerrada**.

### 3. IA (opcional)

Recomendado: guarda la clave de Claude **en tu Supabase**, no en tus dispositivos.

1. **Edge Functions → Deploy a new function → Via editor**: nómbrala `claude-proxy`, pega [`supabase/functions/claude-proxy/index.ts`](supabase/functions/claude-proxy/index.ts) y despliega; desactiva «Verify JWT» (la función verifica tu sesión).
2. **Edge Functions → Secrets**: `ANTHROPIC_API_KEY` (de <https://platform.claude.com/settings/keys>) y `OWNER_EMAIL` (tu correo de FloppyOS). Solo esa cuenta puede usar la IA.
3. **Panel de control → IA → En tu Supabase → Activar**.

(También existe el modo «en este dispositivo», más simple pero menos seguro.) Modelo predeterminado: Claude Opus 5.5 (puedes elegir Sonnet 5.5 o Haiku 5.5, más económicos). Si el modelo declina una solicitud, se reintenta automáticamente con otro modelo (*server-side fallback*).

### 4. Publicación (GitHub Pages)

Cada `git push` a `main` compila y publica en `https://sadaybb.github.io/FloppyOS/`.

### 5. Instalar en la tablet Android

Abre la dirección en **Chrome** → menú ⋮ → **Instalar app**. Queda con su icono, abre a pantalla completa, funciona sin internet y se actualiza sola.

## Qué incluye

| App | Qué hace |
| --- | --- |
| Mi Semestre | Resumen del día, entregas próximas, carga estimada, avisos |
| Bandeja | Captura rápida (`@materia #etiqueta ! mañana 2h`), ✨ interpretación con IA, procesamiento en lote |
| Tareas | Prioridad, estados, pasos (✨ sugeridos por IA), dependencias, repetición, recordatorios, proyecto |
| Agenda | Día/semana/mes, clases recurrentes, eventos con avisos, conflictos |
| Materias | Semestres, profesor/a, horario, temario (importar texto o **PDF**, ✨ IA), modo clase, **Calificación**, **Bibliografía** |
| Calificaciones | Esquema UNISTMO (50% unidades + 50% ordinario) con ponderaciones del profe: cuánto vale cada actividad de la final, asegurado, proyección, «¿qué necesito?» |
| Proyectos | Hitos, tablero por estado con responsables, checklist de entregables/rúbrica, enlaces, bitácora |
| Tarjetas | Repetición espaciada, ✨ creadas desde apuntes, temas débiles |
| Estudio | Pomodoro con objetivo, cierre de sesión, estadísticas |
| Apuntes | Autoguardado, ✨ resumen y tarjetas |
| Pregúntale | ✨ Chat que responde con tus propios datos |
| Stickers | Álbum pixel art que se desbloquea estudiando, o sube los tuyos |
| Panel de control | Temas, fondos, gatito (color, ojos, nombre), avisos, IA, sincronización, respaldo |

**Bibliografía:** verifica referencias en Open Library y Crossref, distingue *confirmada / probable / no encontrada / sin verificar*, nunca inventa datos y guarda de dónde salió cada uno.

## Seguridad

- El repositorio no contiene datos, contraseñas ni claves (revisado en todo el historial). Clonarlo solo da el código: una copia arranca vacía y no puede entrar a tu Supabase sin tu correo y contraseña.
- Tus datos en Supabase están protegidos por seguridad por filas: solo tu sesión puede leerlos o escribirlos; las llamadas anónimas están revocadas (`supabase/security.sql`).
- Las claves secretas (Claude, VAPID, cron) viven como *secrets* de Supabase o en archivos locales ignorados por git (`*.local.txt`).
- La app publicada tiene una política de seguridad de contenido: solo puede conectarse a Supabase, Claude, Open Library y Crossref, y no puede cargarse dentro de otras páginas.
- PIN de bloqueo opcional por dispositivo (desactivado por defecto).

## Sin internet

Todo vive en IndexedDB del dispositivo. Sin conexión funcionan todos los módulos salvo los que por naturaleza necesitan red: sincronización, verificación de bibliografía e IA, que avisan cuando no están disponibles.

## Estructura

- `src/db.ts` — esquema Dexie y helpers.
- `src/lib/` — sync, grades, biblio, pdf, reminders, ai/aiFeatures, parser, fechas, temporizador.
- `src/apps/` — cada aplicación; `meta.ts` y `registry.tsx`.
- `src/os/` — escritorio, ventanas, asistente, stickers, controles.
- `src/pixel/` — sprites; el gatito se genera con `scripts/cat.py`.
- `supabase/` — SQL de sincronización y recordatorios, Edge Function `send-reminders`.
