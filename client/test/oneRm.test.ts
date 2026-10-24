import { describe, expect, it } from 'vitest';
import { oneRepMax } from '../src/lib/oneRm.ts';

describe('oneRepMax', () => {
  it('estimates 100 kg × 5 with each formula', () => {
    const kg = (formula: Parameters<typeof oneRepMax>[2]) => oneRepMax(100000, 5, formula) / 1000;
    expect(kg('brzycki')).toBeCloseTo(112.5, 1);
    expect(kg('epley')).toBeCloseTo(116.67, 1);
    expect(kg('mcglothin')).toBeCloseTo(113.71, 1);
    expect(kg('lombardi')).toBeCloseTo(117.46, 1);
    expect(kg('mayhew')).toBeCloseTo(119.01, 1);
    expect(kg('oconner')).toBeCloseTo(112.5, 1);
    expect(kg('wathen')).toBeCloseTo(116.58, 1);
    expect(kg('average')).toBeCloseTo((112.5 + 116.67 + 113.71 + 117.46 + 119.01 + 112.5 + 116.58) / 7, 1);
  });

  it('keeps a single rep as is', () => {
    expect(oneRepMax(100000, 1, 'epley')).toBe(100000);
    expect(oneRepMax(100000, 1, 'mayhew')).toBe(100000);
  });
});
