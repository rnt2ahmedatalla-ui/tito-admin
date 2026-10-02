import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { CustomerSearchResult } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatCairoDateShort } from '@/lib/time';
import { mapError } from '@/lib/errors';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 25;

function CustomerCard({
  customer,
  onBlock,
}: {
  customer: CustomerSearchResult;
  onBlock: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'rounded-card border bg-white p-4 shadow-warm',
        customer.is_blocked ? 'border-danger/40' : 'border-bark/15',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-espresso">
            {customer.full_name || '—'}
          </p>
          <p className="mt-1 font-latin text-sm text-ink-70" dir="ltr">
            {customer.phone || '—'}
          </p>
          {customer.is_blocked ? (
            <span className="mt-2 inline-flex rounded-pill bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
              {t('customers.blocked')}
            </span>
          ) : null}
        </div>
        <Button
          variant={customer.is_blocked ? 'secondary' : 'danger'}
          size="sm"
          className="shrink-0"
          onClick={onBlock}
        >
          {customer.is_blocked ? t('customers.unblock') : t('customers.block')}
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-btn bg-sand/50 px-2.5 py-2">
          <p className="text-xs text-ink-70">{t('customers.totalBookings')}</p>
          <p className="font-latin font-semibold">{customer.total_bookings}</p>
        </div>
        <div className="rounded-btn bg-sand/50 px-2.5 py-2">
          <p className="text-xs text-ink-70">{t('customers.completed')}</p>
          <p className="font-latin font-semibold">{customer.completed_count}</p>
        </div>
        <div className="rounded-btn bg-sand/50 px-2.5 py-2">
          <p className="text-xs text-ink-70">{t('customers.noShows')}</p>
          <p className="font-latin font-semibold text-danger">{customer.no_show_count}</p>
        </div>
        <div className="rounded-btn bg-sand/50 px-2.5 py-2">
          <p className="text-xs text-ink-70">{t('customers.lastVisit')}</p>
          <p className="font-latin text-sm font-semibold">
            {customer.last_visit ? formatCairoDateShort(customer.last_visit) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

export function CustomersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [blockTarget, setBlockTarget] = useState<CustomerSearchResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['customers', debouncedSearch],
    queryFn: async ({ pageParam }) => {
      const { data: rows, error: qErr } = await supabase.rpc('admin_search_customers', {
        p_q: debouncedSearch,
        p_limit: PAGE_SIZE,
        p_offset: pageParam * PAGE_SIZE,
      });
      if (qErr) throw qErr;
      return (rows ?? []) as CustomerSearchResult[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PAGE_SIZE ? undefined : pages.length,
    staleTime: 15_000,
  });

  const customers = useMemo(() => data?.pages.flat() ?? [], [data]);

  const blockMutation = useMutation({
    mutationFn: async ({ id, blocked }: { id: string; blocked: boolean }) => {
      const { error: bErr } = await supabase.rpc('admin_block_user', {
        p_user_id: id,
        p_blocked: blocked,
      });
      if (bErr) throw bErr;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setBlockTarget(null);
      toast.success(t('app.confirm'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('customers.title')}</h1>

      <Input
        placeholder={t('app.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError ? (
        <div className="space-y-3 py-12 text-center">
          <p className="text-ink-70">
            {error instanceof Error ? error.message : t('app.noResults')}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            {t('app.retry', { defaultValue: 'Retry' })}
          </Button>
        </div>
      ) : customers.length === 0 ? (
        <p className="py-8 text-center text-ink-70">{t('app.noResults')}</p>
      ) : (
        <>
          {/* Mobile / tablet: stacked cards */}
          <div className="space-y-3 lg:hidden">
            {customers.map((c) => (
              <CustomerCard key={c.id} customer={c} onBlock={() => setBlockTarget(c)} />
            ))}
          </div>

          {/* Desktop: full table */}
          <div className="hidden overflow-x-auto rounded-card border border-bark/15 bg-white lg:block">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-bark/10 bg-sand/50 text-start text-xs font-medium text-ink-70">
                  <th className="px-4 py-2.5 font-medium">{t('customers.name')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('customers.phone')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('customers.totalBookings')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('customers.completed')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('customers.noShows')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('customers.lastVisit')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('customers.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-bark/10 last:border-b-0">
                    <td className="max-w-[12rem] truncate px-4 py-3 font-medium">
                      {c.full_name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-latin" dir="ltr">
                      {c.phone || '—'}
                    </td>
                    <td className="px-4 py-3 font-latin">{c.total_bookings}</td>
                    <td className="px-4 py-3 font-latin">{c.completed_count}</td>
                    <td className="px-4 py-3 font-latin text-danger">{c.no_show_count}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-latin">
                      {c.last_visit ? formatCairoDateShort(c.last_visit) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant={c.is_blocked ? 'secondary' : 'danger'}
                        size="sm"
                        onClick={() => setBlockTarget(c)}
                      >
                        {c.is_blocked ? t('customers.unblock') : t('customers.block')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasNextPage ? (
        <Button
          variant="secondary"
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {t('app.loadMore')}
        </Button>
      ) : null}

      <ConfirmDialog
        open={!!blockTarget}
        title={blockTarget?.is_blocked ? t('customers.unblock') : t('customers.block')}
        message={
          blockTarget?.is_blocked
            ? t('customers.unblockConfirm', { name: blockTarget.full_name ?? '' })
            : t('customers.blockConfirm', { name: blockTarget?.full_name ?? '' })
        }
        loading={blockMutation.isPending}
        onConfirm={() =>
          blockTarget &&
          void blockMutation.mutate({ id: blockTarget.id, blocked: !blockTarget.is_blocked })
        }
        onCancel={() => setBlockTarget(null)}
      />
    </div>
  );
}
