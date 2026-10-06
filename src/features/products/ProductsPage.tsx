import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatEGP } from '@/lib/money';
import { mapError } from '@/lib/errors';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

type Product = {
  id: string;
  name_ar: string;
  name_en: string;
  price_egp: number;
  image_path: string | null;
  is_active: boolean;
  sort_order: number;
};

type ProductOrderRow = {
  id: string;
  product_name_ar: string;
  product_name_en: string;
  price_egp: number;
  status: string;
  method: string | null;
  created_at: string;
  profile: { full_name: string | null; phone: string | null } | null;
};

export function ProductsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name_ar: '', name_en: '', price_egp: 0 });
  const [file, setFile] = useState<File | null>(null);

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const ordersQuery = useQuery({
    queryKey: ['product-orders', 'queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_orders')
        .select(
          'id, product_name_ar, product_name_en, price_egp, status, method, created_at, profile:profiles!product_orders_user_id_fkey(full_name, phone)',
        )
        .in('status', ['awaiting', 'submitted'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        profile: Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile,
      })) as ProductOrderRow[];
    },
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      let image_path: string | null = null;
      if (file) {
        const path = `${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, {
          upsert: false,
        });
        if (upErr) throw upErr;
        image_path = path;
      }
      const maxOrder = (productsQuery.data ?? []).reduce((m, p) => Math.max(m, p.sort_order), 0);
      const { error } = await supabase.from('products').insert({
        name_ar: form.name_ar,
        name_en: form.name_en,
        price_egp: form.price_egp,
        image_path,
        is_active: true,
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowForm(false);
      setForm({ name_ar: '', name_en: '', price_egp: 0 });
      setFile(null);
      toast.success(t('app.save'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'confirmed' | 'rejected' }) => {
      const { error } = await supabase.rpc('admin_set_product_order_status', {
        p_order_id: id,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === 'confirmed' ? t('payments.confirm') : t('payments.reject'));
      void queryClient.invalidateQueries({ queryKey: ['product-orders'] });
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const locale = i18n.language;
  const orders = ordersQuery.data ?? [];
  const publicUrl = (path: string | null) =>
    path
      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('products.title')}</h1>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="size-4" />
          {t('products.add')}
        </Button>
      </div>

      <section id="product-orders" className="scroll-mt-20 space-y-3">
        <div>
          <h2 className="text-lg font-bold text-espresso">{t('payments.productOrdersTitle')}</h2>
          <p className="mt-1 text-sm text-ink-70">{t('products.ordersHereHint')}</p>
        </div>
        {ordersQuery.isLoading ? (
          <Skeleton className="h-24" />
        ) : orders.length === 0 ? (
          <p className="text-sm text-ink-70">{t('payments.productOrdersEmpty')}</p>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const name = o.profile?.full_name ?? '—';
              const phone = o.profile?.phone ?? '';
              const productName = locale?.startsWith('ar') ? o.product_name_ar : o.product_name_en;
              const waUrl = phone
                ? buildWhatsAppUrl(
                    phone,
                    locale?.startsWith('ar')
                      ? `أهلاً ${name}، بخصوص طلب المنتج «${productName}» بمبلغ ${formatEGP(o.price_egp)} — ابعت صورة التحويل هنا لو لسه مبعتتهاش 🙏`
                      : `Hi ${name}, about your product order “${productName}” for ${formatEGP(o.price_egp)} — please send the transfer screenshot here if you haven’t 🙏`,
                  )
                : null;
              return (
                <Card key={o.id}>
                  <CardBody className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0 space-y-1">
                      <span className="inline-flex rounded-pill bg-gold/20 px-2.5 py-0.5 text-xs font-semibold text-bark">
                        {t('payments.productBadge')}
                      </span>
                      <p className="text-lg font-semibold text-espresso">{productName}</p>
                      <p className="font-latin text-xl font-bold text-espresso">{formatEGP(o.price_egp)}</p>
                      <p className="text-sm text-ink-70">{name}</p>
                      <p className="font-latin text-sm text-ink-70" dir="ltr">
                        {phone || '—'}
                      </p>
                      {o.method ? (
                        <p className="text-xs text-ink-70">
                          {o.method === 'vodafone_cash' ? 'Vodafone Cash' : 'InstaPay'}
                          {o.status === 'awaiting' ? ` · ${t('payments.productAwaitingPay')}` : null}
                        </p>
                      ) : (
                        <p className="text-xs text-ink-70">{t('payments.productAwaitingPay')}</p>
                      )}
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-40">
                      {waUrl ? (
                        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                          <Button variant="secondary" size="sm" className="w-full">
                            <MessageCircle className="size-4" />
                            {t('payments.openCustomerWhatsApp')}
                          </Button>
                        </a>
                      ) : null}
                      <Button
                        variant="primary"
                        size="md"
                        className="w-full bg-success hover:bg-success/90"
                        loading={statusMutation.isPending}
                        onClick={() => void statusMutation.mutate({ id: o.id, status: 'confirmed' })}
                      >
                        {t('payments.confirm')}
                      </Button>
                      <Button
                        variant="danger"
                        size="md"
                        className="w-full"
                        loading={statusMutation.isPending}
                        onClick={() => void statusMutation.mutate({ id: o.id, status: 'rejected' })}
                      >
                        {t('payments.reject')}
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {showForm ? (
        <Card>
          <CardBody className="space-y-3">
            <Input label={t('products.nameAr')} value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            <Input label={t('products.nameEn')} value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            <Input label={t('products.price')} type="number" value={form.price_egp} onChange={(e) => setForm({ ...form, price_egp: Number(e.target.value) })} />
            <Input label={t('products.image')} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="flex gap-2">
              <Button variant="primary" loading={saveMutation.isPending} disabled={!form.name_ar || !form.name_en} onClick={() => void saveMutation.mutate()}>
                {t('app.save')}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>{t('app.cancel')}</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {productsQuery.isLoading ? (
        <Skeleton className="h-40" />
      ) : (productsQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-70">{t('products.empty')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(productsQuery.data ?? []).map((p) => (
            <Card key={p.id}>
              <CardBody className="flex gap-3 p-3">
                {publicUrl(p.image_path) ? (
                  <img src={publicUrl(p.image_path)!} alt="" className="size-16 rounded-btn object-cover" />
                ) : (
                  <div className="size-16 rounded-btn bg-sand" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{locale === 'ar' ? p.name_ar : p.name_en}</p>
                  <p className="font-latin text-sm text-ink-70">{formatEGP(p.price_egp)}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
