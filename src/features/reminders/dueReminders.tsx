import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { waLink } from '@/features/staff/staffLogin';
import { fillTemplate } from '@/lib/whatsapp';
import { formatCairoTime, formatCairoDateShort } from '@/lib/time';
import { first } from '@/lib/booking';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import type { BookingWithRelations, Settings } from '@/types/database';

const DEFAULT_TPL_AR = 'أهلاً {name} 🙏\nتذكير بمعادك النهارده الساعة {time} في {shop} ({service}). مستنينك ✂️';
const DEFAULT_TPL_EN = 'Hi {name} 🙏\nReminder: your appointment today at {time} at {shop} ({service}). See you soon ✂️';

export function useReminderSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      return data as Settings;
    },
    staleTime: 60_000,
  });
}

export function reminderUrl(b: BookingWithRelations, s: Settings | undefined, isAr: boolean): string | null {
  const phone = first(b.profile)?.phone ?? '';
  if (!phone) return null;
  const tpl = (isAr ? s?.reminder_template_ar : s?.reminder_template_en) || (isAr ? DEFAULT_TPL_AR : DEFAULT_TPL_EN);
  const msg = fillTemplate(tpl, {
    name: first(b.profile)?.full_name ?? '',
    time: formatCairoTime(b.start_at, isAr ? 'ar' : 'en'),
    date: formatCairoDateShort(b.start_at),
    service: (isAr ? b.service_name_ar : b.service_name_en) ?? '',
    shop: s?.shop_name ?? '',
  });
  return waLink(phone, msg);
}

export function useMarkReminderSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_mark_reminder_sent', { p_booking_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reminders'] });
      void qc.invalidateQueries({ queryKey: ['due-reminders'] });
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

/** زرار صغير على كارت الحجز في الجدول: رمادي = لسه بدري، دهبي بينبض = وقت التذكير، أخضر = اتبعت */
export function ReminderChip({ booking }: { booking: BookingWithRelations }) {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const role = useAuth().role;
  const settings = useReminderSettings();
  const mark = useMarkReminderSent();
  if (role === 'staff' || booking.status !== 'confirmed') return null;
  const start = new Date(booking.start_at).getTime();
  if (start < Date.now() - 15 * 60_000) return null;
  const mins = Number(settings.data?.reminder_minutes_before ?? 120);
  const due = start - Date.now() <= mins * 60_000;
  const sent = !!booking.reminder_sent_at || !!(booking as unknown as { push_reminded_at?: string | null }).push_reminded_at;
  const url = reminderUrl(booking, settings.data, isAr);
  if (!url) return null;
  return (
    <button
      type="button"
      aria-label={isAr ? 'تذكير واتساب' : 'WhatsApp reminder'}
      title={sent ? (isAr ? 'اتبعت — دوس تبعت تاني' : 'Sent — tap to resend') : due ? (isAr ? 'وقت التذكير' : 'Time to remind') : (isAr ? 'ابعت تذكير' : 'Send reminder')}
      onClick={(e) => {
        e.stopPropagation();
        window.open(url, '_blank', 'noopener,noreferrer');
        if (!sent) mark.mutate(booking.id);
      }}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full',
        sent ? 'bg-emerald-500 text-white' : due ? 'animate-pulse bg-gold text-espresso' : 'bg-black/10 text-current opacity-60',
      )}
    >
      {sent ? <Check className="size-3" /> : <MessageCircle className="size-3" />}
    </button>
  );
}

const CHOICES: Array<[number, string, string]> = [[60, 'ساعة', '1h'], [120, 'ساعتين', '2h'], [180, '٣ ساعات', '3h'], [1440, 'يوم', '1d']];

/** شريط أعلى الصفحة: لو فيه عملاء وقت تذكيرهم جه، دوسة وتبعتلهم واحد ورا التاني */
export function DueRemindersBar() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const role = useAuth().role;
  const qc = useQueryClient();
  const settings = useReminderSettings();
  const mins = Number(settings.data?.reminder_minutes_before ?? 120);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const mark = useMarkReminderSent();

  const q = useQuery({
    queryKey: ['due-reminders', mins],
    enabled: role !== 'staff' && !!settings.data,
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date();
      const end = new Date(now.getTime() + mins * 60_000);
      const { data, error } = await supabase
        .from('bookings')
        .select('*, profile:profiles!bookings_user_id_fkey(full_name, phone)')
        .eq('status', 'confirmed')
        .is('reminder_sent_at', null)
        .gte('start_at', now.toISOString())
        .lte('start_at', end.toISOString())
        .order('start_at');
      if (error) throw error;
      return ((data ?? []) as BookingWithRelations[]).filter((b) => !!first(b.profile)?.phone && !(b as unknown as { push_reminded_at?: string | null }).push_reminded_at);
    },
  });

  const setMins = useMutation({
    mutationFn: async (v: number) => {
      const { error } = await untypedDb.from('settings').update({ reminder_minutes_before: v }).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['due-reminders'] });
      toast.success(L('اتحفظ ✓', 'Saved ✓'));
    },
  });

  const list = (q.data ?? []).filter((b) => !done.has(b.id));
  if (role === 'staff' || list.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center gap-3 rounded-card border border-gold/60 bg-gold/15 p-3 text-start transition active:scale-[0.99]"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold text-espresso"><BellRing className="size-5 animate-pulse" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-espresso">
            {L(`${list.length} عميل وقت تذكيرهم جه`, `${list.length} customer(s) due for a reminder`)}
          </span>
          <span className="block text-xs text-ink-70">{L('دوس وابعتلهم واتساب بضغطة', 'Tap to send WhatsApp in one tap each')}</span>
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-card bg-white p-4 shadow-warm-raised">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-espresso">{L('تذكيرات جاهزة', 'Reminders due')}</h2>
              <button type="button" aria-label="close" onClick={() => setOpen(false)} className="p-1 text-ink-70"><X className="size-5" /></button>
            </div>
            <ul className="space-y-2">
              {list.map((b) => {
                const url = reminderUrl(b, settings.data, isAr);
                const left = Math.max(1, Math.round((new Date(b.start_at).getTime() - Date.now()) / 60000));
                return (
                  <li key={b.id} className="flex items-center gap-3 rounded-btn border border-default p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-espresso">{first(b.profile)?.full_name}</p>
                      <p className="text-xs text-ink-70">
                        <span className="font-latin" dir="ltr">{formatCairoTime(b.start_at, isAr ? 'ar' : 'en')}</span> · {L(`بعد ${left} دقيقة`, `in ${left} min`)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!url}
                      onClick={() => {
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                        mark.mutate(b.id);
                        setDone((s) => new Set(s).add(b.id));
                      }}
                    >
                      <MessageCircle className="size-4" /> {L('ابعت', 'Send')}
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 border-t border-bark/10 pt-3">
              <p className="mb-2 text-sm font-medium text-espresso">{L('أبعت التذكير قبل المعاد بـ', 'Remind customers before the visit by')}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {CHOICES.map(([v, ar, en]) => (
                  <button key={v} type="button" onClick={() => setMins.mutate(v)}
                    className={cn('min-h-10 rounded-btn text-sm font-medium', mins === v ? 'bg-gold text-espresso' : 'bg-sand/60 text-ink-70')}>
                    {isAr ? ar : en}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
