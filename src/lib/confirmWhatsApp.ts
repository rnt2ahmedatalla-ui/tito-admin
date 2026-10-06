import { supabase } from '@/lib/supabase';
import { buildWhatsAppUrl, fillTemplate } from '@/lib/whatsapp';
import { formatCairoDateShort, formatCairoTime } from '@/lib/time';

const DEFAULT_CONFIRM_AR = 'تم استلام التحويل وتأكيد حجزك، مستنيك في الموعد المحدد.';
const DEFAULT_CONFIRM_EN = 'We received your transfer and confirmed your booking. See you at the appointment.';

type ConfirmWaInput = {
  phone: string;
  name: string;
  startAt: string;
  serviceAr: string;
  serviceEn: string;
  locale: string;
};

export async function openConfirmationWhatsApp(input: ConfirmWaInput): Promise<boolean> {
  const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
  const locale = input.locale.startsWith('ar') ? 'ar' : 'en';
  const raw =
    locale === 'ar'
      ? settings?.confirmation_template_ar || DEFAULT_CONFIRM_AR
      : settings?.confirmation_template_en || DEFAULT_CONFIRM_EN;

  const message = fillTemplate(raw, {
    name: input.name,
    time: formatCairoTime(input.startAt, locale),
    date: formatCairoDateShort(input.startAt),
    service: locale === 'ar' ? input.serviceAr : input.serviceEn,
    shop: settings?.shop_name ?? 'tito',
  });

  const url = buildWhatsAppUrl(input.phone, message);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
