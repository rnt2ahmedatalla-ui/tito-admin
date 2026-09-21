import { describe, expect, it } from 'vitest';
import { buildDateRangeQuery, cairoDateString, formatCairoTime, toCairo } from './time';

describe('time utilities', () => {
  it('formats Cairo time in Arabic', () => {
    const formatted = formatCairoTime('2026-04-25T10:30:00Z', 'ar');
    expect(formatted).toMatch(/[صم]/);
  });

  it('builds date range query', () => {
    expect(buildDateRangeQuery('2026-01-01', '2026-01-31')).toEqual({
      gte: '2026-01-01',
      lte: '2026-01-31',
    });
  });

  it('converts to Cairo timezone', () => {
    const d = toCairo('2026-10-25T12:00:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(cairoDateString(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
