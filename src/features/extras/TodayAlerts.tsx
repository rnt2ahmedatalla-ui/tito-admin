import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useFinData } from '@/features/finance/useFinance';
import { useAuth } from '@/hooks/useAuth';
import { cairoDateString } from '@/lib/time';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { useWaitlistCount } from './useWaitlistCount';
import { lastBackupAgeDays } from '@/features/backup/backupLib';

export type Alert = { key: string; text: string; to: string; tone: 'warn' | 'info' };

const SEEN_KEY = 'tito.alerts.seen';
export const readSeenAlerts = () => {
  try {
    return localStorage.getItem(SEEN_KEY) || '';
  } catch {
    return '';
  }
};
export const writeSeenAlerts = (sig: string) => {
  try {
    localStorage.setItem(SEEN_KEY, sig);
  } catch {
    /* ignore */
  }
};

/** تنبيهات ذكية بتظهر جوه الجرس: كل اللي محتاج انتباهك في مكان واحد (بتختفي لوحدها لما تتحل) */
export function useAlerts(): { alerts: Alert[]; sig: string } {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const { role } = useAuth();
  const isAdmin = role !== 'staff';
  const fin = useFinData();
  const waitN = useWaitlistCount().data ?? 0;

  const late = useQuery({
    queryKey: ['alerts-late-payments'],
    staleTime: 60_000,
    retry: false,
    enabled: isAdmin,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 2 * 3600_000).toISOString();
      const { count, error } = await untypedDb
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted')
        .lt('created_at', cutoff);
      if (error) return 0;
      return count ?? 0;
    },
  });

  const alerts: Alert[] = [];
  if (!isAdmin) return { alerts, sig: '' };
  const iso = (x: string) => `⁨${x}⁩`;
  const n = late.data ?? 0;
  if (waitN > 0) alerts.push({ key: 'wait', tone: 'warn', to: '/routine?t=waitlist', text: L(`${waitN} عميل مستني في قايمة الانتظار`, `${waitN} customer(s) on the waiting list`) });
  if (n > 0) alerts.push({ key: 'late', tone: 'warn', to: '/routine?t=payments', text: L(`${n} دفعة مستنية أكتر من ساعتين`, `${n} payment(s) waiting over 2 hours`) });

  const d = fin.data;
  if (d) {
    const low = (d.items ?? []).filter((i) => i.is_active && i.min_qty > 0 && i.qty <= i.min_qty);
    if (low.length > 0) {
      const names = low.slice(0, 2).map((i) => iso(i.name)).join('، ');
      alerts.push({ key: 'stock', tone: 'warn', to: '/more/finance?tab=inventory', text: L(`مخزون قرّب يخلص: ${names}${low.length > 2 ? ` +${low.length - 2}` : ''}`, `Low stock: ${names}${low.length > 2 ? ` +${low.length - 2}` : ''}`) });
    }
    const soon = cairoDateString(new Date(Date.now() + 7 * 86400_000));
    const due = (d.assets ?? []).filter((a) => a.is_active && a.next_service_date && a.next_service_date <= soon);
    if (due.length > 0) {
      alerts.push({ key: 'assets', tone: 'warn', to: '/more/finance?tab=assets', text: L(`صيانة مستحقة: ${due.slice(0, 2).map((a) => iso(a.name)).join('، ')}`, `Service due: ${due.slice(0, 2).map((a) => iso(a.name)).join(', ')}`) });
    }
  }

  const age = lastBackupAgeDays();
  if (age === null || age >= 7) {
    alerts.push({ key: 'backup', tone: 'info', to: '/more/backup', text: age === null ? L('لسه معملتش نسخة احتياطية للبيانات', 'No data backup yet') : L(`آخر نسخة احتياطية من ${age} يوم`, `Last backup ${age} days ago`) });
  }

  const sig = alerts.map((x) => x.key + (x.text.match(/\d+/)?.[0] ?? '')).join('|');
  return { alerts, sig };
}
