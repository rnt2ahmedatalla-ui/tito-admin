import type { TFunction } from 'i18next';

const ERROR_MAP: Record<string, string> = {
  FORBIDDEN: 'errors.forbidden',
  SLOT_TAKEN: 'errors.slotTaken',
  CANCEL_WINDOW_PASSED: 'errors.cancelWindowPassed',
  BLOCKED_USER: 'errors.blockedUser',
  PROFILE_INCOMPLETE: 'errors.profileIncomplete',
  TOO_MANY_PENDING: 'errors.tooManyPending',
  BOOKING_CLOSED: 'errors.bookingClosed',
  PGRST116: 'errors.notFound',
  '23505': 'errors.duplicate',
  '42501': 'errors.forbidden',
};

export function mapError(error: unknown, t: TFunction): string {
  if (!error) return t('errors.generic');

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);

  for (const [code, key] of Object.entries(ERROR_MAP)) {
    if (message.includes(code)) return t(key);
  }

  const refId = Math.random().toString(36).slice(2, 8).toUpperCase();
  return t('errors.genericWithRef', { ref: refId });
}

export function getErrorCode(error: unknown): string | null {
  if (error instanceof Error) {
    for (const code of Object.keys(ERROR_MAP)) {
      if (error.message.includes(code)) return code;
    }
  }
  return null;
}
