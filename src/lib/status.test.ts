import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS, getStatusConfig } from './status';

describe('status map', () => {
  it('has all six statuses', () => {
    expect(Object.keys(BOOKING_STATUS)).toHaveLength(6);
  });

  it('returns config for each status', () => {
    const config = getStatusConfig('confirmed');
    expect(config.labelKey).toBe('status.confirmed');
    expect(config.bgClass).toBeTruthy();
  });
});
