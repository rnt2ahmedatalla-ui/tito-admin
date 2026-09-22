/**
 * Claims due reminder jobs and sends WhatsApp Cloud API messages.
 * Run via GitHub Actions cron every 5 minutes.
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://mmyqpjiqasokkmgvbqgw.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function rpc(name, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function formatCairo(iso, lang) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
  const time = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return { date, time };
}

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (/^01[0125]\d{8}$/.test(digits)) return `2${digits}`;
  if (/^201[0125]\d{8}$/.test(digits)) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

async function sendWhatsApp(phoneNumberId, token, to, body) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`WA ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

const due = (await rpc('claim_due_reminders', { p_limit: 20 })) ?? [];
console.log('due', due.length);

for (const row of due) {
  try {
    if (!row.wa_phone_number_id || !row.wa_access_token) {
      throw new Error('NO_WA_CREDENTIALS');
    }
    if (!row.phone) throw new Error('NO_PHONE');
    const to = normalizePhone(row.phone);
    if (!to) throw new Error('BAD_PHONE');

    const lang = row.language === 'en' ? 'en' : 'ar';
    const { date, time } = formatCairo(row.start_at, lang);
    const template =
      (lang === 'ar' ? row.template_ar : row.template_en) ||
      (lang === 'ar'
        ? 'أهلاً {name} 👋 تذكير بحجزك في {shop} يوم {date} الساعة {time} ({service}).'
        : 'Hi {name} 👋 reminder for your booking at {shop} on {date} at {time} ({service}).');

    const message = fillTemplate(template, {
      name: row.full_name ?? '',
      shop: row.shop_name ?? 'tito',
      date,
      time,
      service: lang === 'ar' ? row.service_name_ar : row.service_name_en,
    });

    await sendWhatsApp(row.wa_phone_number_id, row.wa_access_token, to, message);
    await rpc('complete_reminder_job', { p_job_id: row.job_id, p_ok: true });
    console.log('sent', row.booking_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await rpc('complete_reminder_job', {
      p_job_id: row.job_id,
      p_ok: false,
      p_error: msg,
    });
    console.log('fail', row.booking_id, msg);
  }
}

console.log('done');
