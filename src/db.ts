import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';

export type ID = string;

/** Every record carries timestamps and a tombstone so devices can merge by last-write-wins. */
export interface Base {
  id: ID;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type SemesterStatus = 'planeado' | 'activo' | 'archivado';
export interface Semester extends Base {
  name: string;
  start: string;
  end: string;
  status: SemesterStatus;
}

export interface Subject extends Base {
  semesterId: ID;
  name: string;
  code?: string;
  professor?: string;
  group?: string;
  credits?: number;
  room?: string;
  description?: string;
  color: string;
  icon?: string; // sticker id
}

export type SlotKind = 'clase' | 'laboratorio' | 'trabajo' | 'traslado' | 'descanso' | 'otro';
export interface Slot extends Base {
  subjectId?: ID;
  title?: string;
  kind: SlotKind;
  weekday: number; // 0 = domingo
  start: string; // HH:MM
  end: string;
  room?: string;
}

export type TaskStatus = 'pendiente' | 'programada' | 'en_progreso' | 'bloqueada' | 'completada' | 'cancelada';
export type Priority = 1 | 2 | 3 | 4;
export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}
export interface Task extends Base {
  title: string;
  description?: string;
  subjectId?: ID;
  status: TaskStatus;
  priority: Priority;
  due?: string;
  dueTime?: string;
  estimateMin?: number;
  spentMin?: number;
  tags: string[];
  subtasks: Subtask[];
  completedAt?: number;
  dependsOn?: ID;
  sourceInboxId?: ID;
}

export type InboxKind = 'tarea' | 'recordatorio' | 'tema' | 'palabra' | 'duda' | 'idea' | 'recurso' | 'nota';
export interface InboxItem extends Base {
  text: string;
  kind: InboxKind;
  subjectId?: ID;
  tags: string[];
  due?: string;
  dueTime?: string;
  estimateMin?: number;
  priority?: Priority;
  processed: boolean;
  resolved?: boolean;
  convertedTo?: { table: TableName; id: ID };
}

export type TopicStatus = 'no_iniciado' | 'introducido' | 'parcial' | 'cubierto' | 'estudiado' | 'repasado' | 'dominado';
export interface Topic extends Base {
  subjectId: ID;
  parentId?: ID;
  title: string;
  order: number;
  status: TopicStatus;
  statusChangedAt?: number;
}

export interface Note extends Base {
  title: string;
  body: string;
  subjectId?: ID;
  topicId?: ID;
  tags: string[];
}

export type EventKind = 'examen' | 'entrega' | 'reunion' | 'estudio' | 'personal' | 'otro';
export interface CalEvent extends Base {
  title: string;
  kind: EventKind;
  date: string;
  start?: string;
  end?: string;
  subjectId?: ID;
  notes?: string;
}

export interface StudySession extends Base {
  subjectId?: ID;
  topicId?: ID;
  taskId?: ID;
  goal?: string;
  startedAt: number;
  endedAt: number;
  focusMin: number;
  breakMin: number;
  outcome?: string;
  next?: string;
}

export interface Setting {
  key: string;
  value: unknown;
  updatedAt: number;
}

/** Device-only data (wallpaper, desktop stickers, custom stickers). Never synced. */
export interface LocalRow {
  key: string;
  value: unknown;
}

class FloppyDB extends Dexie {
  semesters!: Table<Semester, ID>;
  subjects!: Table<Subject, ID>;
  slots!: Table<Slot, ID>;
  tasks!: Table<Task, ID>;
  inbox!: Table<InboxItem, ID>;
  topics!: Table<Topic, ID>;
  notes!: Table<Note, ID>;
  events!: Table<CalEvent, ID>;
  sessions!: Table<StudySession, ID>;
  settings!: Table<Setting, string>;
  local!: Table<LocalRow, string>;

  constructor() {
    super('floppyos');
    this.version(1).stores({
      semesters: 'id, status, updatedAt',
      subjects: 'id, semesterId, updatedAt',
      slots: 'id, subjectId, weekday, updatedAt',
      tasks: 'id, subjectId, status, due, updatedAt',
      inbox: 'id, processed, updatedAt',
      topics: 'id, subjectId, parentId, updatedAt',
      notes: 'id, subjectId, topicId, updatedAt',
      events: 'id, date, subjectId, updatedAt',
      sessions: 'id, subjectId, startedAt, updatedAt',
      settings: 'key',
    });
    this.version(2).stores({ local: 'key' });
  }
}

export const db = new FloppyDB();

// Sync listens here; kept as a plain event so db.ts doesn't import the sync module.
const changeListeners = new Set<() => void>();
export const onLocalChange = (fn: () => void) => {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
};
const changed = () => changeListeners.forEach((fn) => fn());

export const DATA_TABLES = [
  'semesters', 'subjects', 'slots', 'tasks', 'inbox', 'topics', 'notes', 'events', 'sessions',
] as const;
export type TableName = (typeof DATA_TABLES)[number];

type RowOf<N extends TableName> = FloppyDB[N] extends Table<infer R, ID> ? R : never;
type NewRow<N extends TableName> = Omit<RowOf<N>, keyof Base>;

// crypto.randomUUID only exists in secure contexts; tablets on LAN http need the fallback.
export function newId(): ID {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function table<N extends TableName>(name: N): Table<RowOf<N>, ID> {
  return db[name] as unknown as Table<RowOf<N>, ID>;
}

export async function create<N extends TableName>(name: N, data: NewRow<N>): Promise<RowOf<N>> {
  const now = Date.now();
  const row = { ...data, id: newId(), createdAt: now, updatedAt: now } as RowOf<N>;
  await table(name).put(row);
  changed();
  return row;
}

export async function patch<N extends TableName>(name: N, id: ID, changes: Partial<NewRow<N>>) {
  const t = table(name);
  const cur = await t.get(id);
  if (!cur) return;
  await t.put({ ...cur, ...changes, updatedAt: Date.now() });
  changed();
}

export async function remove(name: TableName, id: ID) {
  const t = db[name] as unknown as Table<Base, ID>;
  const cur = await t.get(id);
  if (cur) await t.put({ ...cur, deletedAt: Date.now(), updatedAt: Date.now() });
  changed();
}

/** Live list of non-deleted rows of a table. */
export function useRows<N extends TableName>(name: N): RowOf<N>[] {
  return (
    useLiveQuery(async () => (await table(name).toArray()).filter((r) => !(r as Base).deletedAt), [name]) ??
    EMPTY
  ) as RowOf<N>[];
}
const EMPTY: never[] = [];

export function useSetting<T>(key: string, def: T): [T, (v: T) => void] {
  const row = useLiveQuery(() => db.settings.get(key), [key]);
  const value = row === undefined ? def : (row.value as T);
  return [value, (v: T) => void db.settings.put({ key, value: v, updatedAt: Date.now() }).then(changed)];
}

export function useLocal<T>(key: string, def: T): [T, (v: T) => Promise<void>] {
  const row = useLiveQuery(() => db.local.get(key), [key]);
  const value = row === undefined ? def : (row.value as T);
  return [value, async (v: T) => void (await db.local.put({ key, value: v }))];
}

export const SUBJECT_COLORS = ['#cf6b5e', '#d9a24e', '#c9b13f', '#6fae9f', '#7f9fc6', '#8a5a8e', '#e2a3b4', '#8a7f73'];

/** The active semester: the one stored in settings, else the first marked activo. */
export function useActiveSemester() {
  const semesters = useRows('semesters');
  const [activeId, setActiveId] = useSetting<string | null>('activeSemesterId', null);
  const active =
    semesters.find((s) => s.id === activeId) ?? semesters.find((s) => s.status === 'activo') ?? semesters[0];
  return { semesters, active, setActiveId };
}

/** Subjects of the active semester (or all, if none is set). */
export function useSubjects() {
  const { active } = useActiveSemester();
  const all = useRows('subjects');
  const subjects = active ? all.filter((s) => s.semesterId === active.id) : all;
  return { subjects: [...subjects].sort((a, b) => a.name.localeCompare(b.name)), all };
}
