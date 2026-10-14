import type { SpriteName } from '../pixel/sprites';

export type AppId = 'today' | 'inbox' | 'subjects' | 'tasks' | 'calendar' | 'timer' | 'notes' | 'search' | 'stickers' | 'settings' | 'grades' | 'projects' | 'cards' | 'ask';

export interface AppMeta {
  id: AppId;
  title: string;
  icon: SpriteName;
  size: { w: number; h: number };
  desktop: boolean;
  /** Title bar gradient when colorful title bars are on. */
  tint: [string, string];
}

export const APP_LIST: AppMeta[] = [
  { id: 'today', title: 'Mi Semestre', icon: 'computer', size: { w: 760, h: 560 }, desktop: true, tint: ['#7a5fd0', '#c3b4ff'] },
  { id: 'inbox', title: 'Bandeja', icon: 'inbox', size: { w: 720, h: 560 }, desktop: true, tint: ['#239a8a', '#8fe3cf'] },
  { id: 'tasks', title: 'Tareas', icon: 'tasks', size: { w: 820, h: 560 }, desktop: true, tint: ['#d9468f', '#ffb0d5'] },
  { id: 'calendar', title: 'Agenda', icon: 'calendar', size: { w: 920, h: 620 }, desktop: true, tint: ['#e0712c', '#ffcf8a'] },
  { id: 'subjects', title: 'Materias', icon: 'book', size: { w: 900, h: 600 }, desktop: true, tint: ['#4a6fd8', '#a9c4ff'] },
  { id: 'grades', title: 'Calificaciones', icon: 'grades', size: { w: 780, h: 600 }, desktop: true, tint: ['#2e9d5b', '#a6e8b8'] },
  { id: 'projects', title: 'Proyectos', icon: 'folder', size: { w: 920, h: 620 }, desktop: true, tint: ['#8a4fd0', '#e0b4ff'] },
  { id: 'cards', title: 'Tarjetas', icon: 'cards', size: { w: 640, h: 580 }, desktop: true, tint: ['#c2410c', '#fdba74'] },
  { id: 'timer', title: 'Estudio', icon: 'timer', size: { w: 520, h: 600 }, desktop: true, tint: ['#d2434f', '#ffa898'] },
  { id: 'notes', title: 'Apuntes', icon: 'notes', size: { w: 820, h: 560 }, desktop: true, tint: ['#b0840c', '#f2d86a'] },
  { id: 'ask', title: 'Pregúntale', icon: 'chat', size: { w: 620, h: 600 }, desktop: true, tint: ['#7a3fd0', '#ff9fd0'] },
  { id: 'search', title: 'Buscar', icon: 'search', size: { w: 600, h: 520 }, desktop: true, tint: ['#2f86bf', '#9fd6f5'] },
  { id: 'stickers', title: 'Stickers', icon: 'star', size: { w: 640, h: 600 }, desktop: true, tint: ['#e9579f', '#ffd36e'] },
  { id: 'settings', title: 'Panel de control', icon: 'gear', size: { w: 680, h: 600 }, desktop: true, tint: ['#5d5a8a', '#b4b0dc'] },
];

export const APPS = Object.fromEntries(APP_LIST.map((a) => [a.id, a])) as Record<AppId, AppMeta>;
