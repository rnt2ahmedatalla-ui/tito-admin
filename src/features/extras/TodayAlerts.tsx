import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { useFinData } from '@/features/finance/useFinance';
import { cairoDayBounds, cairoDateString } from '@/lib/time';
import { cn } from '@/lib/cn';
import { useWaitlistCount } from './useWaitlistCount';
import { lastBackupAgeDays } from '@/features/backup/backupLib';

type Alert = { key: string; text: string; to: string; tone: 'warn' | 'info' };

/** تنبيهات ذكية فوق التقويم: كل اللي محتاج انتباهك في مكان واحد (بتختفي لوحدها لما تتحل) */
export function TodayAlerts() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const [open, setOpen] = useState(true);
  const fin = useFinData();
  const waitN = useWaitlistCount().data ?? 0;

  const late = useQuery({
    queryKey: ['alerts-late-payments'],
    staleTime: 60_000,
    retry: false,
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

  const vip = useQuery({
    queryKey: ['alerts-vip', cairoDateString(new Date())],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<string[]> => {
      const b = cairoDayBounds(new Date());
      const today = await untypedDb
        .from('bookings')
        .select('user_id, start_at, profile:profiles!bookings_user_id_fkey(full_name)')
        .in('status', ['confirmed', 'pending_payment'])
        .gte('start_at', b.start)
        .lte('start_at', b.end);
      const rows = (today.data ?? []) as Array<{ user_id: string; profile: { full_name: string | null } | null }>;
      const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
      if (ids.length === 0) return [];
      const done = await untypedDb.from('bookings').select('user_id').eq('status', 'completed').in('user_id', ids).limit(3000);
      const count = new Map<string, number>();
      ((done.data ?? []) as Array<{ user_id: string }>).forEach((r) => count.set(r.user_id, (count.get(r.user_id) ?? 0) + 1));
      return rows.filter((r) => (count.get(r.user_id) ?? 0) >= 10).map((r) => r.profile?.full_name ?? '—');
    },
  });

  const alerts: Alert[] = [];
  const n = late.data ?? 0;
  if (waitN > 0) alerts.push({ key: 'wait', tone: 'warn', to: '/routine?t=waitlist', text: L(`${waitN} عميل مستني في قايمة الانتظار`, `${waitN} customer(s) on the waiting list`) });
  if (n > 0) alerts.push({ key: 'late', tone: 'warn', to: '/routine?t=payments', text: L(`${n} دفعة مستنية أكتر من ساعتين`, `${n} payment(s) waiting over 2 hours`) });

  const d = fin.data;
  if (d) {
    const low = (d.items ?? []).filter((i) => i.is_active && i.min_qty > 0 && i.qty <= i.min_qty);
    if (low.length > 0) {
      const names = low.slice(0, 2).map((i) => i.name).join('، ');
      alerts.push({ key: 'stock', tone: 'warn', to: '/more/finance?tab=inventory', text: L(`مخزون قرّب يخلص: ${names}${low.length > 2 ? ` +${low.length - 2}` : ''}`, `Low stock: ${names}${low.length > 2 ? ` +${low.length - 2}` : ''}`) });
    }
    const soon = cairoDateString(new Date(Date.now() + 7 * 86400_000));
    const due = (d.assets ?? []).filter((a) => a.is_active && a.next_service_date && a.next_service_date <= soon);
    if (due.length > 0) {
      alerts.push({ key: 'assets', tone: 'warn', to: '/more/finance?tab=assets', text: L(`صيانة مستحقة: ${due.slice(0, 2).map((a) => a.name).join('، ')}`, `Service due: ${due.slice(0, 2).map((a) => a.name).join(', ')}`) });
    }
  }

  const v = vip.data ?? [];
  if (v.length > 0) alerts.push({ key: 'vip', tone: 'info', to: '/bookings', text: L(`عميل مميز النهاردة: ${v.slice(0, 2).join('، ')}`, `VIP today: ${v.slice(0, 2).join(', ')}`) });

  const age = lastBackupAgeDays();
  if (age === null || age >= 7) {
    alerts.push({ key: 'backup', tone: 'info', to: '/more/backup', text: age === null ? L('لسه معملتش نسخة احتياطية للبيانات', 'No data backup yet') : L(`آخر نسخة احتياطية من ${age} يوم`, `Last backup ${age} days ago`) });
  }

  if (alerts.length === 0) return null;
  return (
    <div className="rounded-card border border-gold/40 bg-gold/10">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-espresso">
          <TriangleAlert className="size-4 shrink-0 text-gold" aria-hidden />
          {L('تنبيهات', 'Alerts')} <span className="font-latin">({alerts.length})</span>
        </span>
        {open ? <ChevronUp className="size-4 shrink-0 text-ink-70" /> : <ChevronDown className="size-4 shrink-0 text-ink-70" />}
      </button>
      {open ? (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {alerts.map((a) => (
            <Link
              key={a.key}
              to={a.to}
              className={cn(
                'min-w-0 max-w-full rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors',
                a.tone === 'warn' ? 'border-danger/30 bg-white text-danger hover:bg-danger/10' : 'border-bark/20 bg-white text-espresso hover:bg-sand/50',
              )}
            >
              <span className="block truncate">{a.text}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
