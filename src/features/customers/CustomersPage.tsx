import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { CustomerSearchResult } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatCairoDateShort, formatCairoTime } from '@/lib/time';
import { formatEGP } from '@/lib/money';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { mapError } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { CustomerFile } from './CustomerFile';
import { rpcUntyped } from '@/features/staff/staffLogin';

const PAGE_SIZE = 25;

function CustomerCard({
  customer,
  onBlock,
  onDelete,
  onOpen,
}: {
  customer: CustomerSearchResult;
  onBlock: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      className={cn(
        'cursor-pointer rounded-card border bg-white p-4 shadow-warm transition-colors hover:bg-sand/30',
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
          {customer.no_show_count >= 2 ? (
            <span className="mt-2 ms-1 inline-flex rounded-pill bg-warning/15 px-2 py-0.5 text-xs font-medium text-espresso">
              ⚠ {customer.no_show_count}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Button
            variant={customer.is_blocked ? 'secondary' : 'danger'}
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onBlock();
            }}
          >
            {customer.is_blocked ? t('customers.unblock') : t('customers.block')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            {t('app.delete', { defaultValue: 'مسح' })}
          </Button>
        </div>
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


function CustomerDetailPanel({
  customer,
  onClose,
  onBlock,
  onDelete,
}: {
  customer: CustomerSearchResult;
  onClose: () => void;
  onBlock: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const [template, setTemplate] = useState<'discount' | 'miss' | 'coupon' | 'custom'>('discount');
  const [couponCode, setCouponCode] = useState('');
  const [customText, setCustomText] = useState('');

  const historyQuery = useQuery({
    queryKey: ['customer-history', customer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, start_at, service_name_ar, service_name_en, price_egp, status')
        .eq('user_id', customer.id)
        .order('start_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        start_at: string;
        service_name_ar: string;
        service_name_en: string;
        price_egp: number;
        status: string;
      }>;
    },
  });

  const firstName = (customer.full_name ?? '').split(' ')[0] || '';
  const bookUrl = `${(import.meta.env.VITE_CUSTOMER_URL || 'https://tito-customer.vercel.app').replace(/\/+$/, '')}/book`;

  const message = (() => {
    if (template === 'custom') return customText;
    if (template === 'discount')
      return isAr
        ? `أهلاً ${firstName} 👋\nوحشتنا! عندنا خصم 10% على زيارتك الجاية.\nاحجز من هنا:\n${bookUrl}`
        : `Hi ${firstName} 👋\nWe miss you! Enjoy 10% off your next visit.\nBook here:\n${bookUrl}`;
    if (template === 'miss')
      return isAr
        ? `أهلاً ${firstName} 👋\nمن زمان ماجتش عندنا. تحب تحجز معاد جديد؟\n${bookUrl}`
        : `Hi ${firstName} 👋\nWe haven't seen you in a while. Want to book a new time?\n${bookUrl}`;
    return isAr
      ? `أهلاً ${firstName} 👋\nكوبون الخصم بتاعك: ${couponCode.trim().toUpperCase()}\nاحجز من هنا وطبّقه:\n${bookUrl}`
      : `Hi ${firstName} 👋\nYour discount code: ${couponCode.trim().toUpperCase()}\nBook here and apply it:\n${bookUrl}`;
  })();

  const sendWhatsApp = () => {
    const url = buildWhatsAppUrl(customer.phone ?? '', message);
    if (!url) {
      toast.error(isAr ? 'العميل مفيهوش رقم' : 'This customer has no phone number');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const chip = (key: typeof template, label: string) => (
    <button
      type="button"
      onClick={() => setTemplate(key)}
      className={cn(
        'rounded-btn border px-3 py-2 text-sm transition-colors',
        template === key ? 'border-gold bg-gold/20 font-semibold' : 'border-bark/20 bg-white text-ink-70',
      )}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-espresso/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-lg space-y-5 overflow-y-auto rounded-t-card bg-white p-5 shadow-warm-xl sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-bark/10 pb-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-espresso">{customer.full_name || '—'}</p>
            <p className="font-latin text-sm text-ink-70" dir="ltr">{customer.phone || '—'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-btn p-1.5 text-ink-70 hover:bg-sand" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
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

        <CustomerFile userId={customer.id} />

        <div className="space-y-2">
          <p className="font-semibold text-espresso">{isAr ? 'آخر الحجوزات' : 'Recent bookings'}</p>
          {historyQuery.isLoading ? (
            <Skeleton className="h-20" />
          ) : (historyQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-70">{isAr ? 'مفيش حجوزات' : 'No bookings'}</p>
          ) : (
            <ul className="divide-y divide-bark/10 rounded-btn border border-bark/10">
              {(historyQuery.data ?? []).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-espresso">
                    {formatCairoDateShort(b.start_at)} · {formatCairoTime(b.start_at, i18n.language)} ·{' '}
                    {isAr ? b.service_name_ar : b.service_name_en}
                  </span>
                  <span className="shrink-0 font-latin text-ink-70">{formatEGP(b.price_egp)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <p className="font-semibold text-espresso">{isAr ? 'ابعت رسالة واتساب' : 'Send a WhatsApp message'}</p>
          <div className="grid grid-cols-2 gap-2">
            {chip('discount', isAr ? 'خصم 10%' : '10% off')}
            {chip('miss', isAr ? 'وحشتنا' : 'We miss you')}
            {chip('coupon', isAr ? 'كوبون' : 'Coupon')}
            {chip('custom', isAr ? 'رسالة حرّة' : 'Custom')}
          </div>
          {template === 'coupon' ? (
            <Input
              label={isAr ? 'كود الكوبون' : 'Coupon code'}
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
            />
          ) : null}
          {template === 'custom' ? (
            <textarea
              rows={3}
              className="w-full rounded-btn border border-bark/20 bg-white p-3 text-sm text-espresso"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={isAr ? 'اكتب الرسالة' : 'Write the message'}
            />
          ) : (
            <div className="rounded-btn bg-sand/40 p-3 text-sm whitespace-pre-line text-espresso">{message}</div>
          )}
          <Button
            className="w-full"
            disabled={!customer.phone || (template === 'coupon' && !couponCode.trim()) || (template === 'custom' && !customText.trim())}
            onClick={sendWhatsApp}
          >
            {isAr ? 'ابعت على واتساب' : 'Send on WhatsApp'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-bark/10 pt-3">
          <Button variant={customer.is_blocked ? 'secondary' : 'danger'} size="sm" onClick={onBlock}>
            {customer.is_blocked ? t('customers.unblock') : t('customers.block')}
          </Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={onDelete}>
            {isAr ? 'مسح العميل' : 'Delete customer'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CustomersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [blockTarget, setBlockTarget] = useState<CustomerSearchResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerSearchResult | null>(null);
  const [deleteWithBookings, setDeleteWithBookings] = useState<number | null>(null);
  const [openCustomer, setOpenCustomer] = useState<CustomerSearchResult | null>(null);
  const autoOpenedRef = useRef(false);

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

  // لو جيت من التقارير (ومعاك ?q=)، التفاصيل بتتفتح على طول
  useEffect(() => {
    const q = searchParams.get('q');
    if (!q || autoOpenedRef.current || customers.length === 0) return;
    const match = customers.find((c) => (c.phone ?? '') === q || (c.full_name ?? '') === q) ?? customers[0];
    autoOpenedRef.current = true;
    if (match) setOpenCustomer(match);
  }, [customers, searchParams]);

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

  const deleteMutation = useMutation({
    mutationFn: async ({ id, withBookings }: { id: string; withBookings: boolean }) => {
      const { error: dErr } = await rpcUntyped('admin_delete_customer', { p_user: id, p_with_bookings: withBookings });
      if (dErr) throw new Error(dErr.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeleteTarget(null);
      setDeleteWithBookings(null);
      setOpenCustomer(null);
      toast.success(t('app.confirm'));
    },
    onError: (e) => {
      const m = (e as Error).message;
      const hit = /HAS_BOOKINGS:(\d+)/.exec(m);
      if (hit) {
        setDeleteWithBookings(Number(hit[1]));
        return;
      }
      setDeleteTarget(null);
      setDeleteWithBookings(null);
      toast.error(/IS_ADMIN|IS_STAFF/.test(m) ? 'ده حساب أدمن أو حلاق، مينفعش يتمسح من هنا' : mapError(e, t));
    },
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
              <CustomerCard
                key={c.id}
                customer={c}
                onBlock={() => setBlockTarget(c)}
                onDelete={() => setDeleteTarget(c)}
                onOpen={() => setOpenCustomer(c)}
              />
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
                  <tr
                    key={c.id}
                    onClick={() => setOpenCustomer(c)}
                    className="cursor-pointer border-b border-bark/10 last:border-b-0 hover:bg-sand/30"
                  >
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setBlockTarget(c);
                        }}
                      >
                        {c.is_blocked ? t('customers.unblock') : t('customers.block')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ms-1 text-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(c);
                        }}
                      >
                        {t('app.delete', { defaultValue: 'مسح' })}
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

      {openCustomer ? (
        <CustomerDetailPanel
          customer={openCustomer}
          onClose={() => setOpenCustomer(null)}
          onBlock={() => {
            setBlockTarget(openCustomer);
            setOpenCustomer(null);
          }}
          onDelete={() => {
            setDeleteTarget(openCustomer);
            setOpenCustomer(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget && deleteWithBookings === null}
        title="مسح العميل"
        message={`هتمسح "${deleteTarget?.full_name ?? ''}" من قايمة العملاء نهائياً. لو عنده حجوزات هسألك قبل ما أمسحها.`}
        confirmLabel="مسح"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, withBookings: false })}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget && deleteWithBookings !== null}
        title="العميل ده عنده حجوزات"
        message={`عنده ${deleteWithBookings ?? 0} حجز. لو كملت هتتمسح كل حجوزاته ودفعاته معاه، وده هيأثر على الإيراد والتقارير بتاعة الفترة دي. متأكد؟`}
        confirmLabel="امسحه مع حجوزاته"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, withBookings: true })}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteWithBookings(null);
        }}
      />

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
