import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useStaff } from '@/features/staff/StaffPage';
import { rpcUntyped } from '@/features/staff/staffLogin';
import { formatEGP } from '@/lib/money';
import { cairoDateString } from '@/lib/time';
import { cn } from '@/lib/cn';

type Preview = { bookings: number; revenue: number; payments: number };

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
      const { data, error } = await rpcUntyped('admin_purge_barber_data', { p_staff: who, p_before: before });
      if (error) throw new Error(error.message);
      return Number((data as { deleted?: number } | null)?.deleted ?? 0);
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
              'بتمسح حجوزات الأيام اللي فاتت (ومعاها دفعاتها) عشان تبدأ حساب مالي نضيف. حجوزات النهاردة والأيام الجاية بتفضل زي ما هي.',
              'Deletes bookings from past days (and their payments) so you can start clean. Today and upcoming bookings stay.',
            )}
          </p>
          <div className="rounded-btn bg-success/10 p-3 text-sm text-espresso">
            {L(
              'مبيتمسحش: العملاء، الخدمات، الحلاقين، الإعدادات، التقييمات، المنتجات، المصروفات والخزاين.',
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
              <Button variant="danger" disabled={preview.bookings === 0} onClick={() => setConfirmOpen(true)}>
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
              {L(
                `هتمسح ${preview.bookings} حجز ودفعاتهم (${whoName}) قبل ${before}. الإيراد والتقارير بتاعة الفترة دي هتتصفّر ومينفعش ترجّعها. يفضّل تعمل نسخة احتياطية الأول.`,
                `This deletes ${preview.bookings} bookings and their payments (${whoName}) before ${before}. Income and reports for that period will be reset and cannot be restored. A backup first is recommended.`,
              )}
            </p>
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
