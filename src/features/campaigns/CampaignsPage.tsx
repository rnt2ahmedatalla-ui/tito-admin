import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { CustomerSearchResult } from '@/types/database';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { waLink } from '@/features/staff/staffLogin';
import { cn } from '@/lib/cn';

const CUSTOMER_URL = (import.meta.env.VITE_CUSTOMER_URL || 'https://tito-customer.vercel.app').replace(/\/+$/, '');

type Audience = 'all' | 'recent' | 'lapsed' | 'vip';
type Preset = { id: string; ar: string; en: string; label: [string, string] };

const PRESETS: Preset[] = [
  { id: 'ramadan', label: ['رمضان', 'Ramadan'], ar: 'رمضان كريم يا {name} 🌙\nكل سنة وانت طيب من {shop}. مواعيد رمضان اتحدثت، احجز مكانك من اللينك:', en: 'Ramadan Kareem {name} 🌙\nWishing you a blessed month from {shop}. Ramadan hours are updated, book your spot online.' },
  { id: 'eid', label: ['العيد', 'Eid'], ar: 'كل سنة وانت طيب يا {name} 🎉\n{shop} بيهنيك بالعيد. احجز حلاقة العيد بدري قبل الزحمة!', en: 'Eid Mubarak {name} 🎉\n{shop} wishes you a happy Eid. Book your Eid cut early before it gets busy!' },
  { id: 'quiet', label: ['عرض أوقات هادية', 'Quiet-hours offer'], ar: 'أهلاً {name} 👋\nعرض خاص من {shop}: خصم {discount}% لو حجزت في {hours}. المكان محدود، احجز دلوقتي!', en: 'Hi {name} 👋\nSpecial from {shop}: {discount}% off if you book {hours}. Limited spots, book now!' },
  { id: 'miss', label: ['وحشتنا', 'We miss you'], ar: 'وحشتنا يا {name} 😊\nبقالك فترة مجيتش {shop}. نورنا، احجز معادك من اللينك:', en: 'We miss you {name} 😊\nIt has been a while since your last visit to {shop}. Come back, book your spot online.' },
  { id: 'custom', label: ['رسالة حرة', 'Custom'], ar: 'أهلاً {name} 👋\n', en: 'Hi {name} 👋\n' },
];

const sentKey = (id: string) => `tito.campaign.sent.${id}`;
function loadSent(id: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(sentKey(id)) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** حملات واتساب مجانية: بتختار الجمهور والرسالة وتبعت لكل عميل بضغطة (من غير أي خدمة مدفوعة) */
export function CampaignsPage() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const [audience, setAudience] = useState<Audience>('all');
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [msgLang, setMsgLang] = useState<'ar' | 'en'>(isAr ? 'ar' : 'en');
  const [texts, setTexts] = useState<Record<string, { ar: string; en: string }>>({});
  const [discount, setDiscount] = useState('15');
  const [hours, setHours] = useState('');
  const [sent, setSent] = useState<Set<string>>(() => loadSent(PRESETS[0].id));

  const shopQ = useQuery({
    queryKey: ['settings', 'shop-name'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('shop_name, shop_location_url').eq('id', 1).maybeSingle();
      return (data ?? { shop_name: 'tito' }) as { shop_name: string };
    },
  });

  const customersQ = useQuery({
    queryKey: ['campaign-customers'],
    staleTime: 60_000,
    queryFn: async () => {
      const all: CustomerSearchResult[] = [];
      for (let page = 0; page < 6; page++) {
        const { data, error } = await supabase.rpc('admin_search_customers', { p_q: '', p_limit: 500, p_offset: page * 500 });
        if (error) throw error;
        const rows = (data ?? []) as CustomerSearchResult[];
        all.push(...rows);
        if (rows.length < 500) break;
      }
      return all;
    },
  });

  const list = useMemo(() => {
    const now = Date.now();
    const day = 86400_000;
    return (customersQ.data ?? []).filter((c) => {
      if (!c.phone || c.is_blocked) return false;
      const last = c.last_visit ? Date.parse(c.last_visit) : null;
      if (audience === 'recent') return last !== null && now - last <= 60 * day;
      if (audience === 'lapsed') return last === null ? c.completed_count > 0 : now - last >= 30 * day;
      if (audience === 'vip') return c.completed_count >= 10;
      return true;
    });
  }, [customersQ.data, audience]);

  const current = texts[preset.id] ?? { ar: preset.ar, en: preset.en };
  const body = current[msgLang];
  const setBody = (v: string) => setTexts((p) => ({ ...p, [preset.id]: { ...current, [msgLang]: v } }));
  const shop = shopQ.data?.shop_name ?? 'tito';

  const render = (name: string) =>
    body
      .replace(/\{name\}/g, (name || '').split(' ')[0] || (msgLang === 'ar' ? 'يا غالي' : 'there'))
      .replace(/\{shop\}/g, shop)
      .replace(/\{discount\}/g, discount || '10')
      .replace(/\{hours\}/g, hours || (msgLang === 'ar' ? 'في الأوقات الهادية' : 'at quiet hours'))
      .trimEnd() + `\n${CUSTOMER_URL}`;

  const pickPreset = (p: Preset) => {
    setPreset(p);
    setSent(loadSent(p.id));
  };
  const markSent = (id: string) => {
    const next = new Set(sent).add(id);
    setSent(next);
    try {
      localStorage.setItem(sentKey(preset.id), JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };
  const resetSent = () => {
    setSent(new Set());
    try {
      localStorage.removeItem(sentKey(preset.id));
    } catch {
      /* ignore */
    }
  };

  const audiences: Array<[Audience, string]> = [
    ['all', L('كل العملاء', 'All customers')],
    ['recent', L('زاروني آخر شهرين', 'Visited in last 60 days')],
    ['lapsed', L('غايبين +30 يوم', 'Away 30+ days')],
    ['vip', L('عملاء مميزين (10+ زيارات)', 'VIP (10+ visits)')],
  ];
  const chip = (active: boolean) =>
    cn('min-h-9 rounded-full border px-3 text-sm font-medium transition-colors', active ? 'border-gold bg-gold text-espresso' : 'border-default bg-white text-ink-70 hover:bg-sand');

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{L('الحملات والعروض', 'Campaigns & offers')}</h1>
        <p className="mt-1 text-sm text-ink-70">{L('ابعت تهنئة أو عرض لعملائك على واتساب بضغطة لكل عميل، مجاناً ومن غير أي خدمة مدفوعة.', 'Send greetings or offers over WhatsApp, one tap per customer. Free, no paid service.')}</p>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold">{L('1) الرسالة', '1) Message')}</h2></CardHeader>
        <CardBody className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={chip(preset.id === p.id)} onClick={() => pickPreset(p)}>{isAr ? p.label[0] : p.label[1]}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className={chip(msgLang === 'ar')} onClick={() => setMsgLang('ar')}>عربي</button>
            <button type="button" className={chip(msgLang === 'en')} onClick={() => setMsgLang('en')}>English</button>
          </div>
          <textarea rows={4} maxLength={600} dir={msgLang === 'ar' ? 'rtl' : 'ltr'} value={body} onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-btn border border-bark/20 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" />
          <p className="text-xs text-ink-70">{L('بيانات تلقائية:', 'Auto-fill:')} <span className="font-latin">{'{name} {shop} {discount} {hours}'}</span></p>
          {preset.id === 'quiet' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={L('نسبة الخصم %', 'Discount %')} type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              <Input label={L('الأوقات (مثلاً: من 2 لـ 5 العصر)', 'Hours (e.g. 2–5 PM)')} value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          ) : null}
          <div className="rounded-btn border border-default bg-sand/40 p-3 text-sm" dir={msgLang === 'ar' ? 'rtl' : 'ltr'}>
            <p className="mb-1 text-xs text-ink-70" dir={isAr ? 'rtl' : 'ltr'}>{L('معاينة', 'Preview')}</p>
            <p className="whitespace-pre-line">{render(isAr ? 'أحمد' : 'Ahmed')}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">{L('2) الجمهور', '2) Audience')}</h2>
        </CardHeader>
        <CardBody className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {audiences.map(([id, label]) => (
              <button key={id} type="button" className={chip(audience === id)} onClick={() => setAudience(id)}>{label}</button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 text-sm text-ink-70">
            <span>{L(`${list.length} عميل · اتبعت لـ ${list.filter((c) => sent.has(c.id)).length}`, `${list.length} customers · sent to ${list.filter((c) => sent.has(c.id)).length}`)}</span>
            <button type="button" className="text-xs underline" onClick={resetSent}>{L('صفّر علامات الإرسال', 'Reset sent marks')}</button>
          </div>
          {customersQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : customersQ.isError ? (
            <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('حصل خطأ في تحميل العملاء.', 'Could not load customers.')}</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-ink-70">{L('مفيش عملاء في الفئة دي.', 'No customers in this group.')}</p>
          ) : (
            <ul className="divide-y divide-default rounded-card border border-default bg-white">
              {list.map((c) => {
                const link = waLink(c.phone ?? '', render(c.full_name ?? ''));
                const done = sent.has(c.id);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-espresso">{c.full_name || '—'}</p>
                      <p className="font-latin text-xs text-ink-70" dir="ltr">{c.phone}</p>
                    </div>
                    {link ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => markSent(c.id)}
                        className={cn('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-btn px-3 text-sm font-medium', done ? 'bg-sand text-ink-70' : 'bg-success text-white hover:opacity-90')}>
                        {done ? <Check className="size-4" aria-hidden /> : <MessageCircle className="size-4" aria-hidden />}
                        {done ? L('اتبعت', 'Sent') : L('واتساب', 'WhatsApp')}
                      </a>
                    ) : (
                      <span className="text-xs text-danger">{L('رقم غير صالح', 'Invalid number')}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
