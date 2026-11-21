import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DatabaseBackup, Eraser } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { mapError } from '@/lib/errors';
import { lastBackupAgeDays } from '@/features/backup/backupLib';
import { CleaningChecklist } from './CleaningChecklist';

type Cleanup = { count?: number; freed_bytes?: number } | null;
const mb = (b?: number) => `${((b ?? 0) / 1048576).toFixed(1)} MB`;

export function MaintenancePage() {
  const { t, i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [dry, setDry] = useState<Cleanup | undefined>(undefined);

  const stats = useQuery({
    queryKey: ['maintenance-stats'],
    staleTime: 60_000,
    queryFn: async () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [all, month, cust] = await Promise.all([
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
      ]);
      return { all: all.count ?? 0, month: month.count ?? 0, customers: cust.count ?? 0 };
    },
  });

  const dryRun = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('admin_cleanup_old_proofs', { p_dry_run: true });
      if (error) throw error;
      return data as Cleanup;
    },
    onSuccess: (d) => setDry(d ?? { count: 0 }),
    onError: (e) => toast.error(mapError(e, t)),
  });

  const cleanup = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('admin_cleanup_old_proofs', { p_dry_run: false });
      if (error) throw error;
      return data as Cleanup;
    },
    onSuccess: (d) => {
      toast.success(L(`اتمسح ${d?.count ?? 0} ملف`, `${d?.count ?? 0} files cleaned`));
      setConfirmCleanup(false);
      setDry(undefined);
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const age = lastBackupAgeDays();
  const stat = (label: string, v: number | undefined) => (
    <div className="rounded-card border border-default bg-white p-3 text-center">
      <p className="font-latin text-2xl font-bold text-espresso">{v ?? '—'}</p>
      <p className="mt-0.5 text-xs text-ink-70">{label}</p>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('maintenance.title')}</h1>
        <p className="mt-1 text-sm text-ink-70">{L('صيانة بسيطة بتحافظ على النظام سريع ومجاني.', 'Simple upkeep that keeps the system fast and free.')}</p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {stat(L('عملاء', 'Customers'), stats.data?.customers)}
        {stat(L('حجوزات الشهر', 'Bookings this month'), stats.data?.month)}
        {stat(L('كل الحجوزات', 'All bookings'), stats.data?.all)}
      </div>

      <CleaningChecklist />

      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 font-semibold"><DatabaseBackup className="size-4 text-gold" aria-hidden />{L('النسخة الاحتياطية', 'Backup')}</h2>
        </CardHeader>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-70">
            {age === null ? L('لسه معملتش نسخة احتياطية.', 'No backup yet.') : L(`آخر نسخة من ${age} يوم.`, `Last backup ${age} day(s) ago.`)}
          </p>
          <Link to="/more/backup" className="inline-flex min-h-9 items-center rounded-btn bg-gold px-4 text-sm font-semibold text-espresso">{L('افتح النسخ الاحتياطي', 'Open backup')}</Link>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 font-semibold"><Eraser className="size-4 text-gold" aria-hidden />{t('maintenance.cleanup')}</h2>
          <p className="mt-1 text-sm text-ink-70">{L('بيمسح صور إثبات الدفع القديمة عشان يوفر مساحة. الحجوزات والمدفوعات نفسها مش بتتمسح.', 'Removes old payment-proof images to save space. Bookings and payments are kept.')}</p>
        </CardHeader>
        <CardBody className="space-y-3">
          <Button variant="secondary" loading={dryRun.isPending} onClick={() => dryRun.mutate()}>
            {L('1) شوف هيتمسح كام ملف', '1) Preview what will be removed')}
          </Button>
          {dry !== undefined ? (
            <p className="rounded-btn bg-sand/50 p-3 text-sm">
              {dry?.count ? L(`هيتمسح ${dry.count} ملف (حوالي ${mb(dry.freed_bytes)}).`, `${dry.count} file(s) will be removed (about ${mb(dry.freed_bytes)}).`) : L('مفيش حاجة قديمة تتمسح. كله تمام ✅', 'Nothing old to remove. All good ✅')}
            </p>
          ) : null}
          {dry?.count ? (
            <Button variant="danger" onClick={() => setConfirmCleanup(true)}>{L('2) امسح دلوقتي', '2) Remove now')}</Button>
          ) : null}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmCleanup}
        title={t('maintenance.cleanup')}
        message={t('maintenance.cleanupConfirm', { count: dry?.count ?? 0 })}
        loading={cleanup.isPending}
        onConfirm={() => cleanup.mutate()}
        onCancel={() => setConfirmCleanup(false)}
      />
    </div>
  );
}
