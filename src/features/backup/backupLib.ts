import { untypedDb } from '@/features/payments/useFinanceBoxes';

export const BACKUP_TABLES = [
  'profiles', 'bookings', 'booking_extras', 'payments', 'services', 'staff', 'staff_hours', 'settings', 'working_hours',
  'recurring_breaks', 'time_off', 'coupons', 'products', 'reviews', 'loyalty_settings', 'loyalty_ledger', 'packages',
  'customer_packages', 'waitlist', 'customer_notes', 'feature_settings', 'fin_wallets', 'fin_categories',
  'fin_transactions', 'fin_settings', 'fin_closings', 'fin_recurring', 'fin_recurring_log', 'fin_budgets', 'fin_items',
  'fin_item_moves', 'fin_assets',
] as const;

const KEY = 'tito.lastBackup';

export function lastBackupAgeDays(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return null;
    const t = Date.parse(v);
    if (Number.isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86400_000);
  } catch {
    return null;
  }
}

export function markBackupDone() {
  try {
    localStorage.setItem(KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

async function fetchAll(table: string): Promise<{ rows: unknown[]; ok: boolean }> {
  const out: unknown[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let res = await untypedDb.from(table).select('*').order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (res.error) res = await untypedDb.from(table).select('*').range(from, from + PAGE - 1);
    if (res.error) return { rows: out, ok: out.length > 0 };
    const rows = (res.data ?? []) as unknown[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    if (from > 200_000) break;
  }
  return { rows: out, ok: true };
}

export type BackupProgress = (table: string, count: number | null) => void;

/** بيجمّع كل جداول النظام في ملف JSON واحد ينزّل عندك (مجاني ١٠٠٪، من غير أي سيرفر) */
export async function runBackup(onProgress?: BackupProgress): Promise<{ blob: Blob; name: string; counts: Record<string, number | null> }> {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number | null> = {};
  for (const t of BACKUP_TABLES) {
    const r = await fetchAll(t);
    if (r.ok) {
      data[t] = r.rows;
      counts[t] = r.rows.length;
    } else {
      counts[t] = null; // الجدول مش موجود (ميزة لسه متفعلتش)
    }
    onProgress?.(t, counts[t] ?? null);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const payload = { app: 'tito', version: 1, created_at: new Date().toISOString(), tables: data };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  markBackupDone();
  return { blob, name: `tito-backup-${stamp}.json`, counts };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
