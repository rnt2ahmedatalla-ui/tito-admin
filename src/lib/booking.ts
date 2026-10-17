import type { BookingWithRelations, Payment, Profile } from '@/types/database';

export function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function normalizeBooking(row: BookingWithRelations): BookingWithRelations & {
  profile: Pick<Profile, 'full_name' | 'phone'> | null;
  payment: Payment | null;
} {
  return {
    ...row,
    profile: first(row.profile),
    payment: first(row.payment),
  };
}

export function isOnlineBooking(b: {
  pay_at_shop?: boolean | null;
  payment?: Payment | Payment[] | null;
  status?: string;
}): boolean {
  if (b.pay_at_shop) return false;
  const p = first(b.payment);
  if (p?.method === 'cash') return false;
  if (p?.method === 'instapay' || p?.method === 'vodafone_cash') return true;
  return !b.pay_at_shop;
}

export function isShopBooking(b: {
  pay_at_shop?: boolean | null;
  payment?: Payment | Payment[] | null;
}): boolean {
  if (b.pay_at_shop) return true;
  const p = first(b.payment);
  return p?.method === 'cash';
}

