const EGYPT_PHONE_RE = /^01[0125][0-9]{8}$/;
const MAX_MESSAGE_LENGTH = 900;
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/g;

export function normalizeEgyptPhone(phone: string): string | null {
  const cleaned = phone.replace(/\s+/g, '').replace(/^\+/, '');
  if (!EGYPT_PHONE_RE.test(cleaned)) return null;
  return `20${cleaned.slice(1)}`;
}

export function sanitizeMessage(text: string): string {
  return text.replace(CONTROL_CHARS_RE, '').slice(0, MAX_MESSAGE_LENGTH);
}

export function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const normalized = normalizeEgyptPhone(phone);
  if (!normalized) return null;

  const sanitized = sanitizeMessage(message);
  const encoded = encodeURIComponent(sanitized);
  const url = `https://wa.me/${normalized}?text=${encoded}`;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'wa.me') return null;
    if (parsed.searchParams.get('text') === null) return null;
    return url;
  } catch {
    return null;
  }
}

export function escapeCsvCell(value: string): string {
  const dangerous = /^[=+\-@\t\r]/;
  const escaped = value.replace(/"/g, '""');
  const prefixed = dangerous.test(value) ? `'${escaped}` : escaped;
  return `"${prefixed}"`;
}

export function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}
