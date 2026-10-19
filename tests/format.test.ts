import { describe, expect, it } from 'vitest';
import { countdown, dist, met, metShort, num, parseMet, speed } from '../src/ui/format';

describe('format', () => {
  it('formats MET and parses it back', () => {
    expect(met(5468)).toBe('T+01:31:08');
    expect(metShort(1800)).toBe('T+0:30');
    expect(countdown(1568)).toBe('26:08');
    expect(parseMet('T+01:31:08')).toBe(5468);
    expect(parseMet('31:08')).toBe(1868);
    expect(parseMet('5468')).toBe(5468);
    expect(parseMet('1:75:00')).toBeNull();
    expect(parseMet('abc')).toBeNull();
  });
  it('uses a real minus sign and switches to km above 10 km', () => {
    expect(num(-74.96, 2)).toBe('−74.96');
    expect(num(19.84, 2, true)).toBe('+19.84');
    expect(dist(51260)).toBe('51.26 km');
    expect(dist(850)).toBe('850 m');
    expect(speed(0.42)).toBe('0.42 m/s');
    expect(speed(75.0)).toBe('75.0 m/s');
  });
});
