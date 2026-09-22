import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { CustomerSearchResult } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatCairoDateShort } from '@/lib/time';
import { mapError } from '@/lib/errors';

const PAGE_SIZE = 25;

export function CustomersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [blockTarget, setBlockTarget] = useState<CustomerSearchResult | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['customers', debouncedSearch],
    queryFn: async ({ pageParam }) => {
      const { data: rows, error } = await supabase.rpc('admin_search_customers', {
        p_q: debouncedSearch,
        p_limit: PAGE_SIZE,
        p_offset: pageParam * PAGE_SIZE,
      });
      if (error) throw error;
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
      const { error } = await supabase.rpc('admin_block_user', {
        p_user_id: id,
        p_blocked: blocked,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setBlockTarget(null);
      toast.success(t('app.confirm'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const virtualizer = useVirtualizer({
    count: customers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 5,
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
      ) : customers.length === 0 ? (
        <p className="py-8 text-center text-ink-70">{t('app.noResults')}</p>
      ) : (
        <div
          ref={parentRef}
          className="h-[60vh] overflow-auto rounded-card border border-bark/15 bg-white"
        >
          <div className="sticky top-0 grid grid-cols-6 gap-2 border-b border-bark/10 bg-sand/50 px-4 py-2 text-xs font-medium text-ink-70">
            <span>{t('customers.name')}</span>
            <span>{t('customers.phone')}</span>
            <span>{t('customers.totalBookings')}</span>
            <span>{t('customers.completed')}</span>
            <span>{t('customers.noShows')}</span>
            <span>{t('customers.lastVisit')}</span>
          </div>
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const c = customers[item.index];
              if (!c) return null;
              return (
                <div
                  key={c.id}
                  className="absolute inset-x-0 grid grid-cols-6 items-center gap-2 border-b border-bark/10 px-4 py-3"
                  style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
                >
                  <span className="truncate font-medium">{c.full_name}</span>
                  <span className="font-latin text-sm">{c.phone}</span>
                  <span className="font-latin">{c.total_bookings}</span>
                  <span className="font-latin">{c.completed_count}</span>
                  <span className="font-latin text-danger">{c.no_show_count}</span>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-latin">
                      {c.last_visit ? formatCairoDateShort(c.last_visit) : '—'}
                    </span>
                    <Button
                      variant={c.is_blocked ? 'secondary' : 'danger'}
                      size="sm"
                      onClick={() => setBlockTarget(c)}
                    >
                      {c.is_blocked ? t('customers.unblock') : t('customers.block')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
