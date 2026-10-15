import { useLiveQuery } from 'dexie-react-hooks';
import { DATA_TABLES, db, purge, restore, type Base, type TableName } from '../db';
import { askConfirm } from '../os/dialogs';
import { Btn, Empty } from '../os/ui';
import { useWindowStatus } from '../os/status';

const TYPE: Record<TableName, string> = {
  semesters: 'Semestre', subjects: 'Materia', slots: 'Clase del horario', tasks: 'Tarea', inbox: 'Nota rápida', topics: 'Tema',
  notes: 'Apunte', events: 'Evento', sessions: 'Sesión de estudio', refs: 'Referencia', projects: 'Proyecto', cards: 'Tarjeta',
};

export interface TrashItem {
  table: TableName;
  row: Base & Record<string, unknown>;
  name: string;
}

function nameOf(table: TableName, r: Record<string, unknown>): string {
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  const text = str('title') || str('name') || str('text') || str('front') || str('goal') || str('body').slice(0, 60);
  if (text) return text;
  if (table === 'slots') return `Clase (${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][r.weekday as number] ?? ''} ${str('start')})`;
  return 'Sin título';
}

/** Everything deleted and not yet emptied, newest first. */
export function useTrash(): TrashItem[] | undefined {
  return useLiveQuery(async () => {
    const out: TrashItem[] = [];
    for (const t of DATA_TABLES) {
      const rows = (await db.table(t).filter((r: Base) => !!r.deletedAt && !r.purged).toArray()) as (Base & Record<string, unknown>)[];
      for (const row of rows) out.push({ table: t, row, name: nameOf(t, row) });
    }
    return out.sort((a, b) => (b.row.deletedAt ?? 0) - (a.row.deletedAt ?? 0));
  });
}

/** Recycle bin: restore or permanently remove deleted items. */
export default function Trash() {
  const items = useTrash();
  useWindowStatus([items ? `${items.length} elemento${items.length === 1 ? '' : 's'}` : null]);
  if (!items) return null;

  return (
    <div className="app">
      <div className="toolbar">
        <Btn small disabled={!items.length} onClick={async () => { for (const it of items) await restore(it.table, it.row.id); }}>Restaurar todo</Btn>
        <Btn small disabled={!items.length} onClick={async () => {
          if (await askConfirm(`¿Eliminar definitivamente ${items.length} elemento${items.length > 1 ? 's' : ''}?`, { title: 'Vaciar papelera', danger: true, ok: 'Vaciar', detail: 'Ya no se podrán restaurar.' }))
            for (const it of items) await purge(it.table, it.row.id);
        }}>Vaciar papelera</Btn>
        <span className="grow" />
        <span className="hint">{items.length} elemento{items.length === 1 ? '' : 's'}</span>
      </div>
      <div className="scroll">
        {!items.length ? (
          <Empty>La papelera está vacía.</Empty>
        ) : (
          <table className="grid-table trash-table">
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Eliminado</th><th /></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={`${it.table}:${it.row.id}`}>
                  <td className="ellipsis">{it.name}</td>
                  <td>{TYPE[it.table]}</td>
                  <td className="hint">{new Date(it.row.deletedAt!).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="row-btns">
                    <Btn small onClick={() => void restore(it.table, it.row.id)}>Restaurar</Btn>
                    <Btn small aria-label="Eliminar definitivamente" onClick={async () => { if (await askConfirm(`¿Eliminar definitivamente «${it.name}»?`, { title: 'Confirmar eliminación', danger: true, ok: 'Sí', cancel: 'No' })) void purge(it.table, it.row.id); }}>×</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="hint">Al borrar algo en FloppyOS viene aquí primero. Lo que restauras vuelve a aparecer en todos tus dispositivos.</p>
    </div>
  );
}
