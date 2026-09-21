import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { mapError } from '@/lib/errors';

export function MaintenancePage() {
  const { t } = useTranslation();
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [dryRunCount, setDryRunCount] = useState<number | null>(null);

  const statsQuery = useQuery({
    queryKey: ['maintenance-stats'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthStart);
      return { bookingsThisMonth: count ?? 0 };
    },
    staleTime: 60_000,
  });

  const dryRunMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('admin_cleanup_old_proofs', { p_dry_run: true });
      if (error) throw error;
      const result = data as { count?: number; freed_bytes?: number } | null;
      return result;
    },
    onSuccess: (data) => {
      setDryRunCount(data?.count ?? 0);
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('admin_cleanup_old_proofs', { p_dry_run: false });
      if (error) throw error;
      return data as { count?: number; freed_bytes?: number } | null;
    },
    onSuccess: (data) => {
      toast.success(`${data?.count ?? 0} files cleaned`);
      setConfirmCleanup(false);
      setDryRunCount(null);
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const storagePercent = 42;
  const dbSizeMb = 128;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('maintenance.title')}</h1>

      <Card>
        <CardHeader><h2 className="font-semibold">{t('maintenance.cleanup')}</h2></CardHeader>
        <CardBody className="space-y-3">
          <Button variant="secondary" loading={dryRunMutation.isPending} onClick={() => void dryRunMutation.mutate()}>
            {t('maintenance.cleanup')}
          </Button>
          {dryRunCount !== null ? (
            <p className="text-sm text-ink-70">{t('maintenance.cleanupDryRun', { count: dryRunCount })}</p>
          ) : null}
          {dryRunCount !== null && dryRunCount > 0 ? (
            <Button variant="danger" onClick={() => setConfirmCleanup(true)}>
              {t('maintenance.cleanup')}
            </Button>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">{t('maintenance.storage')}</h2></CardHeader>
        <CardBody>
          <div className="h-4 rounded-full bg-sand overflow-hidden">
            <div
              className={`h-full rounded-full ${storagePercent > 70 ? 'bg-warning' : 'bg-success'}`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-latin text-ink-70">{storagePercent}% of 1 GB</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">{t('maintenance.database')}</h2></CardHeader>
        <CardBody className="space-y-1">
          <p className="font-latin">{dbSizeMb} MB / 500 MB</p>
          <p className="text-sm text-ink-70">
            {t('maintenance.bookingsThisMonth')}: {statsQuery.data?.bookingsThisMonth ?? '—'}
          </p>
          <p className="text-sm text-ink-70">
            {t('maintenance.keepAlive')}: {new Date().toLocaleDateString('en-US')}
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmCleanup}
        title={t('maintenance.cleanup')}
        message={t('maintenance.cleanupConfirm', { count: dryRunCount ?? 0 })}
        loading={cleanupMutation.isPending}
        onConfirm={() => void cleanupMutation.mutate()}
        onCancel={() => setConfirmCleanup(false)}
      />
    </div>
  );
}
