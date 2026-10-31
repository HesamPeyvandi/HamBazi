import { describe, it, expect } from 'vitest';
import { parseTimes, serializeTimes, timesLabel } from '@/lib/play-times';
import { geoUri } from '@/lib/geo';

describe('preferred play times (multi-select)', () => {
  it('serializes in canonical order, drops unknown and duplicate values, null when empty', () => {
    expect(serializeTimes(['night', 'morning', 'morning', 'bogus'])).toBe('morning,night');
    expect(serializeTimes([])).toBeNull();
    expect(serializeTimes(['x'])).toBeNull();
  });
  it('parses stored values, including a legacy single value', () => {
    expect(parseTimes('morning,evening')).toEqual(['morning', 'evening']);
    expect(parseTimes('evening')).toEqual(['evening']);
    expect(parseTimes(null)).toEqual([]);
    expect(parseTimes('foo,morning,morning')).toEqual(['morning']);
  });
  it('builds a Persian label', () => {
    expect(timesLabel('morning,evening')).toBe('صبح، عصر و شب');
    expect(timesLabel(null)).toBe('');
  });
});

describe('geo: URI for the Android app chooser', () => {
  it('has lat,lng first and an encoded label', () => {
    const u = geoUri(35.5769, 53.392, 'سالن (الف)');
    expect(u.startsWith('geo:35.576900,53.392000?q=35.576900,53.392000(')).toBe(true);
    expect(u).not.toMatch(/[()].*[()].*[()]/);
    expect(u.includes(' ')).toBe(false);
  });
});
