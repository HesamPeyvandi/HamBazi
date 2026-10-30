import { describe, it, expect } from 'vitest';
import { navApps, validCoord } from '@/lib/geo';

describe('geo helpers', () => {
  it('accepts Iranian coordinates and rejects swapped, missing and foreign ones', () => {
    expect(validCoord(35.5769, 53.392)).toBe(true);
    expect(validCoord(53.392, 35.5769)).toBe(false);
    expect(validCoord(null, 53)).toBe(false);
    expect(validCoord(NaN, 53)).toBe(false);
    expect(validCoord(51.5, -0.12)).toBe(false);
  });
  it('builds the four navigation links with lat,lng in the right order and no accidental extra parameters', () => {
    const apps = navApps(35.5769, 53.392);
    expect(apps.map((a) => a.key)).toEqual(['neshan', 'balad', 'waze', 'google']);
    const by = Object.fromEntries(apps.map((a) => [a.key, a.href]));
    expect(by.google).toBe('https://www.google.com/maps/dir/?api=1&destination=35.576900,53.392000&travelmode=driving');
    expect(by.waze).toBe('https://waze.com/ul?ll=35.576900,53.392000&navigate=yes');
    expect(by.neshan).toContain('lat=35.576900&lng=53.392000');
    expect(by.balad).toContain('destination=35.576900,53.392000');
    for (const a of apps) expect(a.href.startsWith('https://')).toBe(true);
  });
});
