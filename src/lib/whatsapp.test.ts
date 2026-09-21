import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppUrl,
  normalizeEgyptPhone,
  sanitizeMessage,
  escapeCsvCell,
  fillTemplate,
} from './whatsapp';

describe('normalizeEgyptPhone', () => {
  it('accepts valid numbers', () => {
    expect(normalizeEgyptPhone('01012345678')).toBe('201012345678');
    expect(normalizeEgyptPhone('01112345678')).toBe('201112345678');
  });

  it('rejects invalid numbers', () => {
    expect(normalizeEgyptPhone('0212345678')).toBeNull();
    expect(normalizeEgyptPhone('abc')).toBeNull();
  });
});

describe('sanitizeMessage', () => {
  it('strips control characters and caps length', () => {
    const input = 'Hello\nWorld\x00' + 'x'.repeat(1000);
    const result = sanitizeMessage(input);
    expect(result).not.toContain('\n');
    expect(result.length).toBeLessThanOrEqual(900);
  });

  it('handles injection characters', () => {
    const msg = 'أحمد & # test';
    const url = buildWhatsAppUrl('01012345678', msg);
    expect(url).toContain('wa.me');
    expect(url).toContain('text=');
  });
});

describe('buildWhatsAppUrl', () => {
  it('builds valid https wa.me URL', () => {
    const url = buildWhatsAppUrl('01012345678', 'مرحبا');
    expect(url).toMatch(/^https:\/\/wa\.me\/201012345678\?text=/);
  });

  it('rejects invalid phone', () => {
    expect(buildWhatsAppUrl('invalid', 'hi')).toBeNull();
  });
});

describe('escapeCsvCell', () => {
  it('prefixes formula injection chars', () => {
    expect(escapeCsvCell('=SUM(A1)')).toContain("'=SUM(A1)");
    expect(escapeCsvCell('+123')).toContain("'+123");
    expect(escapeCsvCell('-formula')).toContain("'-formula");
    expect(escapeCsvCell('@evil')).toContain("'@evil");
  });
});

describe('fillTemplate', () => {
  it('replaces placeholders', () => {
    expect(fillTemplate('Hi {name} at {time}', { name: 'Ali', time: '7:30' })).toBe('Hi Ali at 7:30');
  });
});
