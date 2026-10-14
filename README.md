# FloppyOS 💾

Gestor de estudios universitarios con estética Windows 98/2000 + pixel art. Un solo perfil, **funciona sin internet**, se instala como app en PC y Android y se sincroniza entre dispositivos con Supabase.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/
```

## Guía de puesta en marcha

### 1. Supabase (sincronización entre PC y tablet)

1. Crea una cuenta gratis en <https://supabase.com> y un proyecto nuevo (región cercana, p. ej. *South America* o *US East*).
2. En el proyecto: **SQL Editor → New query**, pega todo [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
3. **Authentication → Sign In / Providers → Email**: desactiva *Confirm email* (más cómodo para una sola persona) — o déjalo y confirma desde tu correo.
4. **Project Settings → API**: copia *Project URL* y la clave *anon public*.
5. En FloppyOS: **Panel de control → Sincronización**, pega ambos datos y pulsa **Crear cuenta** (solo la primera vez). En la tablet, usa **Iniciar sesión** con el mismo correo.
6. Ya con tu cuenta creada, en **Authentication → Sign In / Providers** desactiva *Allow new users to sign up* para que nadie más pueda registrarse.

> La clave *anon* es pública por diseño; tus datos los protege la seguridad por filas (cada usuario solo ve sus filas).
> Opcional: guarda URL y clave como *variables* del repositorio (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) y la app publicada vendrá ya conectada.

### 2. Publicación (GitHub Pages)

Cada `git push` a `main` compila y publica automáticamente (workflow en `.github/workflows/deploy.yml`). La dirección queda así: `https://<usuario>.github.io/FloppyOS/`.

### 3. Instalar en la tablet Android

Abre la dirección en **Chrome** → menú ⋮ → **Instalar app** (o *Agregar a pantalla principal*). Queda con su icono, abre a pantalla completa y funciona sin internet. Se actualiza sola cuando publicas una versión nueva.

En la PC: Chrome/Edge → icono de instalar en la barra de direcciones.

## Sin internet

Todo vive en IndexedDB del dispositivo: tareas, agenda, temario, apuntes, pomodoro, stickers y fondos funcionan sin conexión. La sincronización sube y baja cambios cuando vuelve internet (al editar, al volver a la app, al reconectar y cada 2 minutos). Conflictos: gana la versión editada más recientemente; los borrados viajan como *tombstones*, así que nada se pierde en silencio.

## Qué incluye

| App | Qué hace |
| --- | --- |
| Mi Semestre | Resumen del día, entregas próximas, carga estimada a 14 días, avisos |
| Bandeja | Captura rápida que entiende `@materia #etiqueta ! mañana 2h`, clasificación y procesamiento en lote |
| Tareas | Filtros, prioridad, estados, pasos, dependencias, tiempo real vs. estimado |
| Agenda | Día/semana/mes con clases recurrentes, eventos, tareas, sesiones, conflictos |
| Materias | Semestres, horario, temario jerárquico, importar temario desde texto, modo clase, sticker por materia |
| Estudio | Pomodoro con objetivo, cierre de sesión, «la última vez…», estadísticas |
| Apuntes | Editor con autoguardado vinculado a materia y tema |
| Buscar | Búsqueda global (incluye semestres archivados) |
| Stickers | Álbum pixel art que se desbloquea estudiando; pégalos en el escritorio o sube los tuyos |
| Panel de control | Temas, fondos (presets o tu imagen), asistente (Clippy/Rover), sincronización, respaldo |

## Estructura

- `src/db.ts` — esquema Dexie y helpers (`create`, `patch`, `remove`, `useRows`, `useLocal`).
- `src/lib/sync.ts` — sincronización offline-first con Supabase.
- `src/os/` — escritorio: ventanas, barra de tareas, asistente, stickers del escritorio.
- `src/apps/` — cada aplicación; `meta.ts` (iconos, tamaños, colores) y `registry.tsx`.
- `src/lib/` — fechas, parser de captura, temporizador, avisos, respaldo, fondos, stickers.
- `src/pixel/` — sprites en cuadrícula de caracteres (iconos, Clippy, Rover, stickers).
- `supabase/schema.sql` — tabla y función de sincronización.
