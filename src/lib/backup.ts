import { DATA_TABLES, db, type Base, type Setting } from '../db';

export interface BackupFile {
  app: 'FloppyOS';
  version: 1;
  exportedAt: number;
  data: Record<string, Base[]>;
  settings: Setting[];
}

export async function exportAll(): Promise<BackupFile> {
  const data: Record<string, Base[]> = {};
  for (const t of DATA_TABLES) data[t] = (await db.table(t).toArray()) as Base[];
  return { app: 'FloppyOS', version: 1, exportedAt: Date.now(), data, settings: await db.settings.toArray() };
}

export function downloadJSON(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Merges a backup into the local database, keeping the newest version of each record
 * (deletions travel as tombstones). Importing the other device's file is therefore a manual sync.
 */
export async function mergeBackup(file: BackupFile) {
  if (file?.app !== 'FloppyOS' || !file.data) throw new Error('El archivo no es un respaldo de FloppyOS.');
  let added = 0;
  let updated = 0;
  await db.transaction('rw', [...DATA_TABLES.map((t) => db.table(t)), db.settings], async () => {
    for (const t of DATA_TABLES) {
      const rows = file.data[t] ?? [];
      const table = db.table(t);
      for (const row of rows) {
        if (!row?.id || typeof row.updatedAt !== 'number') continue;
        const cur = (await table.get(row.id)) as Base | undefined;
        if (!cur) {
          await table.put(row);
          added++;
        } else if (row.updatedAt > cur.updatedAt) {
          await table.put(row);
          updated++;
        }
      }
    }
    for (const s of file.settings ?? []) {
      const cur = await db.settings.get(s.key);
      if (!cur || (s.updatedAt ?? 0) > (cur.updatedAt ?? 0)) await db.settings.put(s);
    }
  });
  return { added, updated };
}
