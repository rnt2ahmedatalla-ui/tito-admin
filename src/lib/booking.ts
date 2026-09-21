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
