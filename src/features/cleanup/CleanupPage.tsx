import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eraser } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useStaff } from '@/features/staff/StaffPage';
import { rpcUntyped } from '@/features/staff/staffLogin';
import { formatEGP } from '@/lib/money';
import { cairoDateString, formatCairoDateShort } from '@/lib/time';
import { cn } from '@/lib/cn';

type Preview = { bookings: number; revenue: number; payments: number; by_status?: Record<string, number>; first?: string | null; last?: string | null };
const STATUS_AR: Record<string, string> = { completed: 'تمت', confirmed: 'مؤكد (لسه متعلّم تمت)', cancelled: 'ملغي', expired: 'انتهت مهلة الدفع', no_show: 'ما حضرش', pending_payment: 'مستني دفع' };

/** تنظيف حجوزات ودخل الأيام اللي فاتت (لكل حلاق أو للكل). مبيلمسش العملاء ولا الخدمات ولا الإعدادات ولا التقييمات ولا المصروفات */
export function CleanupPage() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const staff = (useStaff().data ?? []).filter((m) => m.is_active || m.is_owner);
  const today = cairoDateString(new Date());
  const [sel, setSel] = useState<string>('all');
  const [before, setBefore] = useState(today);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const EXTRA_SCOPES: Array<[string, string, string]> = [
    ['finance', 'الحركات المالية والإقفال اليومي (وبداية الحساب بتبدأ من التاريخ ده)', 'Finance transactions & daily closings (accounting restarts at this date)'],
    ['reviews', 'التقييمات', 'Reviews'],
    ['notifications', 'الإشعارات', 'Notifications'],
    ['waitlist', 'قايمة الانتظار', 'Waiting list'],
    ['audit', 'سجل التغييرات', 'Audit log'],
    ['loyalty', 'نقاط الولاء (هتتصفّر نقاط العملاء الناتجة عن الفترة دي)', 'Loyalty points history (customers lose points earned in this period)'],
  ];
  const [scopes, setScopes] = useState<Set<string>>(new Set(['finance', 'reviews', 'notifications', 'waitlist', 'audit']));
  const toggleScope = (k: string) => setScopes((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const useExtras = sel === 'all' && scopes.size > 0;

  const who = sel === 'all' ? null : sel;
  const whoName = sel === 'all' ? L('كل الحلاقين', 'All barbers') : (staff.find((m) => m.id === sel)?.name ?? '');
  const WORD = isAr ? 'مسح' : 'delete';

  const check = useMutation({
    mutationFn: async () => {
      const { data, error } = await rpcUntyped('admin_purge_preview', { p_staff: who, p_before: before });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as Record<string, unknown>;
      return { bookings: Number(r.bookings ?? 0), revenue: Number(r.revenue ?? 0), payments: Number(r.payments ?? 0) } as Preview;
    },
    onSuccess: setPreview,
    onError: () => toast.error(L('معرفتش أحسب. اتأكد إنك شغّلت ملف features-v36.sql.', 'Could not preview. Make sure features-v36.sql was run.')),
  });

  const purge = useMutation({
    mutationFn: async () => {
      let deleted = 0;
      if ((preview?.bookings ?? 0) > 0) {
        const { data, error } = await rpcUntyped('admin_purge_barber_data', { p_staff: who, p_before: before });
        if (error) throw new Error(error.message);
        deleted = Number((data as { deleted?: number } | null)?.deleted ?? 0);
      }
      if (useExtras) {
        const { error } = await rpcUntyped('admin_purge_extras', { p_before: before, p_scopes: [...scopes] });
        if (error) throw new Error(error.message.includes('admin_purge_extras') ? 'شغّل ملف features-v48.sql الأول' : error.message);
      }
      return deleted;
    },
    onSuccess: (n) => {
      toast.success(L(`اتمسح ${n} حجز`, `${n} bookings deleted`));
      setConfirmOpen(false);
      setTyped('');
      setPreview(null);
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(L('معرفتش أمسح: ', 'Could not delete: ') + (e as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Eraser className="size-6 text-gold" aria-hidden />
        <h1 className="text-2xl font-semibold">{L('تنظيف البيانات', 'Data cleanup')}</h1>
      </div>

      <Card>
        <CardBody className="space-y-4 p-4">
          <p className="text-sm text-ink-70">
            {L(
              'اختار تاريخ، وكل اللي قبله بيتمسح (حجوزات ودفعات وسجلات)، وكل اللي من التاريخ ده لحد النهارده والجاي بيفضل زي ما هو. استخدمها عشان تبدأ شغلك الحقيقي من نضيف.',
              'Deletes bookings from past days (and their payments) so you can start clean. Today and upcoming bookings stay.',
            )}
          </p>
          <div className="rounded-btn bg-success/10 p-3 text-sm text-espresso">
            {L(
              'مبيتمسحش أبداً: العملاء، الخدمات، الحلاقين، الإعدادات، المنتجات، المخزون، الأجهزة والصيانة.',
              'Not touched: customers, services, barbers, settings, reviews, products, expenses and boxes.',
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-espresso">{L('اختار الحلاق', 'Choose barber')}</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={sel === 'all' ? 'primary' : 'secondary'} onClick={() => { setSel('all'); setPreview(null); }}>
                {L('كل الحلاقين', 'All barbers')}
              </Button>
              {staff.map((m) => (
                <Button key={m.id} size="sm" variant={sel === m.id ? 'primary' : 'secondary'} onClick={() => { setSel(m.id); setPreview(null); }}>
                  {m.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="max-w-xs">
            <Input
              type="date"
              dir="ltr"
              label={L('امسح كل اللي قبل يوم', 'Delete everything before')}
              max={today}
              value={before}
              onChange={(e) => { setBefore(e.target.value); setPreview(null); }}
            />
            <p className="mt-1 text-xs text-ink-70">{L('الافتراضي: النهاردة (يعني كل اللي فات).', 'Default: today (everything in the past).')}</p>
          </div>

          {sel === 'all' ? (
            <div className="space-y-2 rounded-btn border border-default p-3">
              <p className="text-sm font-medium text-espresso">{L('امسح كمان من نفس الفترة:', 'Also delete from the same period:')}</p>
              {EXTRA_SCOPES.map(([k, ar, en]) => (
                <label key={k} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-gold" checked={scopes.has(k)} onChange={() => toggleScope(k)} />
                  <span>{isAr ? ar : en}</span>
                </label>
              ))}
              <p className="text-xs text-ink-70">{L('لازم تختار "كل الحلاقين" عشان تظهر الاختيارات دي. العملاء والخدمات والإعدادات والمخزون والأجهزة بيفضلوا زي ما هم.', 'Choose "All barbers" to see these. Customers, services, settings, stock and equipment are kept.')}</p>
            </div>
          ) : null}

          <Button variant="secondary" loading={check.isPending} disabled={!before} onClick={() => check.mutate()}>
            {L('شوف هيتمسح كام', 'Preview what will be deleted')}
          </Button>

          {preview ? (
            <div className={cn('space-y-2 rounded-btn border p-3', preview.bookings > 0 ? 'border-danger/40 bg-danger/5' : 'border-default')}>
              <p className="font-semibold text-espresso">{whoName}</p>
              <p className="text-sm">
                {L('حجوزات هتتمسح:', 'Bookings to delete:')} <span className="font-latin font-bold">{preview.bookings}</span>
                {' · '}
                {L('إيراد الحلاقات اللي تمت:', 'Completed revenue:')} <span className="font-latin font-bold">{formatEGP(preview.revenue)}</span>
                {' · '}
                {L('دفعات:', 'Payments:')} <span className="font-latin font-bold">{preview.payments}</span>
              </p>
              {preview.by_status && Object.keys(preview.by_status).length > 0 ? (
                <ul className="flex flex-wrap gap-1.5 text-xs">
                  {Object.entries(preview.by_status).map(([k, v]) => (
                    <li key={k} className="rounded-full bg-sand px-2.5 py-1">
                      {isAr ? (STATUS_AR[k] ?? k) : k}: <span className="font-latin font-bold">{v}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {preview.first && preview.last ? (
                <p className="text-xs text-ink-70">
                  {L('من ', 'From ')}
                  <span className="font-latin">{formatCairoDateShort(preview.first)}</span>
                  {L(' لحد ', ' to ')}
                  <span className="font-latin">{formatCairoDateShort(preview.last)}</span>
                </p>
              ) : null}
              <Button variant="danger" disabled={preview.bookings === 0 && !useExtras} onClick={() => setConfirmOpen(true)}>
                {L('امسح', 'Delete')}
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {confirmOpen && preview ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setConfirmOpen(false)} aria-hidden />
          <div className="relative w-full max-w-md space-y-3 rounded-card bg-white p-4 shadow-warm-lg">
            <h3 className="text-lg font-semibold text-danger">{L('تحذير: مسح نهائي', 'Warning: permanent delete')}</h3>
            <p className="text-sm text-ink-70">
              {useExtras ? L(`وكمان: ${EXTRA_SCOPES.filter(([k]) => scopes.has(k)).map(([, ar]) => ar.split(' (')[0]).join('، ')}. `, `Also: ${EXTRA_SCOPES.filter(([k]) => scopes.has(k)).map(([, , en]) => en.split(' (')[0]).join(', ')}. `) : ''}
              {L(
                `هتمسح ${preview.bookings} حجز ودفعاتهم (${whoName}) قبل ${before}. الإيراد والتقارير بتاعة الفترة دي هتتصفّر ومينفعش ترجّعها. يفضّل تعمل نسخة احتياطية الأول.`,
                `This deletes ${preview.bookings} bookings and their payments (${whoName}) before ${before}. Income and reports for that period will be reset and cannot be restored. A backup first is recommended.`,
              )}
            </p>
            <Link to="/more/backup" className="inline-flex min-h-9 items-center rounded-btn bg-gold/20 px-3 text-sm font-semibold text-espresso">{L('حمّل نسخة احتياطية الأول', 'Download a backup first')}</Link>
            <Input
              dir="auto"
              label={L(`اكتب كلمة "${WORD}" للتأكيد`, `Type "${WORD}" to confirm`)}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setConfirmOpen(false); setTyped(''); }}>{L('إلغاء', 'Cancel')}</Button>
              <Button variant="danger" loading={purge.isPending} disabled={typed.trim().toLowerCase() !== WORD} onClick={() => purge.mutate()}>
                {L('امسح نهائياً', 'Delete permanently')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
