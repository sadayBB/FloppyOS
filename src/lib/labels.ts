import type { EventKind, Priority, SlotKind, TaskStatus, TopicStatus } from '../db';

export const TOPIC_STATUS: { id: TopicStatus; label: string; color: string }[] = [
  { id: 'no_iniciado', label: 'No iniciado', color: '#cfc6b8' },
  { id: 'introducido', label: 'Introducido', color: '#f0dc8a' },
  { id: 'parcial', label: 'Visto parcial', color: '#e9b872' },
  { id: 'cubierto', label: 'Cubierto en clase', color: '#7f9fc6' },
  { id: 'estudiado', label: 'Estudiado', color: '#6fae9f' },
  { id: 'repasado', label: 'Repasado', color: '#3f9a7e' },
  { id: 'dominado', label: 'Dominado', color: '#8a5a8e' },
];
export const topicStatus = (s: TopicStatus) => TOPIC_STATUS.find((x) => x.id === s)!;
export const topicRank = (s: TopicStatus) => TOPIC_STATUS.findIndex((x) => x.id === s);

export const TASK_STATUS: { id: TaskStatus; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'programada', label: 'Programada' },
  { id: 'en_progreso', label: 'En progreso' },
  { id: 'bloqueada', label: 'Bloqueada' },
  { id: 'completada', label: 'Completada' },
  { id: 'cancelada', label: 'Cancelada' },
];
export const isOpen = (s: TaskStatus) => s !== 'completada' && s !== 'cancelada';

export const PRIORITY: Record<Priority, { label: string; mark: string; color: string }> = {
  1: { label: 'Baja', mark: '·', color: '#8a7f73' },
  2: { label: 'Media', mark: '!', color: '#7f9fc6' },
  3: { label: 'Alta', mark: '!!', color: '#d9a24e' },
  4: { label: 'Urgente', mark: '!!!', color: '#cf6b5e' },
};

export const EVENT_KIND: Record<EventKind, { label: string; color: string }> = {
  examen: { label: 'Examen', color: '#cf6b5e' },
  entrega: { label: 'Entrega', color: '#d9a24e' },
  reunion: { label: 'Reunión', color: '#8a5a8e' },
  estudio: { label: 'Bloque de estudio', color: '#6fae9f' },
  personal: { label: 'Personal', color: '#e2a3b4' },
  otro: { label: 'Otro', color: '#a89c8e' },
};

export const SLOT_KIND: Record<SlotKind, string> = {
  clase: 'Clase',
  laboratorio: 'Laboratorio',
  trabajo: 'Trabajo',
  traslado: 'Traslado',
  descanso: 'Descanso',
  otro: 'Otro',
};
