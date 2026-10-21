import { describe, expect, it } from 'vitest';
import { contrastRatio, onColor, tooSimilar } from '../src/lib/color.ts';
import { formatDuration, formatKg, formatSetValues, parseDuration, parseKg, parseKm } from '../src/lib/format.ts';
import { regionState } from '../src/lib/muscles.ts';
import { addSet, defaultTargets, removeSet, setSimpleCount, toSimple, updateAll } from '../src/lib/targets.ts';

describe('color', () => {
  it('picks readable text on the accent colour', () => {
    expect(onColor('#D4FF3A')).toBe('#0E1012');
    expect(onColor('#1D3A8A')).toBe('#FFFFFF');
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21);
  });

  it('flags muscle colours that are hard to tell apart', () => {
    // The pair the user found too close in the first mock-up.
    expect(tooSimilar('#FF6A2B', '#A34E28')).toBe(true);
    expect(tooSimilar('#FF4D2E', '#FF4D2E')).toBe(true);
    // Current defaults.
    expect(tooSimilar('#FF4D2E', '#FFD166')).toBe(false);
    expect(tooSimilar('#3A86FF', '#FFE8A3')).toBe(false);
  });
});

describe('format', () => {
  it('round-trips kilograms with French decimals', () => {
    expect(formatKg(82500)).toBe('82,5');
    expect(formatKg(80000)).toBe('80');
    expect(parseKg('82,5')).toBe(82500);
    expect(parseKg('12.25')).toBe(12250);
    expect(parseKg('')).toBeNull();
    expect(parseKg('-3')).toBeNull();
    expect(parseKm('5,2')).toBe(5200);
  });

  it('formats a performed set per exercise type', () => {
    expect(formatSetValues('weight_reps', { reps: 8, weightG: 80000 })).toBe('80 kg × 8');
    expect(formatSetValues('weighted_bw', { reps: 6, weightG: 10000 })).toBe('+10 kg × 6');
    expect(formatSetValues('assisted_bw', { reps: 6, weightG: 20000 })).toBe('−20 kg × 6');
    expect(formatSetValues('bw_reps', { reps: 12 })).toBe('12 reps');
    expect(formatSetValues('duration', { durationS: 60 })).toBe('1:00');
    expect(formatSetValues('distance_duration', { durationS: 1500, distanceM: 5200 })).toBe('5,2 km · 25:00');
    expect(formatSetValues('weight_distance', { weightG: 24000, distanceM: 40 })).toBe('24 kg · 40 m');
  });

  it('parses and formats durations', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(parseDuration('25')).toBe(25);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:30')).toBe(90);
    // Timer keypad style: the last two digits are seconds.
    expect(parseDuration('130')).toBe(90);
    expect(parseDuration('200')).toBe(120);
    expect(parseDuration('1000')).toBe(600);
    expect(parseDuration('13000')).toBe(5400);
    expect(formatDuration(parseDuration('130')!)).toBe('1:30');
    expect(parseDuration('1:02:05')).toBe(3725);
    expect(parseDuration('1:x')).toBeNull();
  });
});

describe('targets', () => {
  it('uses the right fields per exercise type', () => {
    expect(defaultTargets('duration')[0]).toMatchObject({ durationS: 30 });
    expect(defaultTargets('duration')[0]!.reps).toBeUndefined();
    expect(defaultTargets('distance_duration')).toHaveLength(1);
  });

  it('switches from per-set to simple using the first working set', () => {
    const perSet = [
      { kind: 'warmup' as const, reps: 12, weightG: 50000 },
      { kind: 'normal' as const, reps: 8, weightG: 80000 },
      { kind: 'normal' as const, reps: 6, weightG: 85000 },
    ];
    expect(toSimple(perSet)).toEqual([
      { kind: 'normal', reps: 8, weightG: 80000 },
      { kind: 'normal', reps: 8, weightG: 80000 },
    ]);
  });

  it('edits simple mode as a whole', () => {
    const t = defaultTargets('weight_reps');
    expect(setSimpleCount(t, 5)).toHaveLength(5);
    expect(updateAll(t, { reps: 6 }).every((s) => s.reps === 6)).toBe(true);
    expect(addSet(t, 'weight_reps')).toHaveLength(4);
    expect(removeSet([t[0]!], 0)).toHaveLength(1);
  });
});

describe('body map regions', () => {
  it('groups lats and middle back on the upper back', () => {
    expect(regionState('upper-back', ['lats'], [])).toBe('primary');
    expect(regionState('upper-back', ['quads'], ['middleback'])).toBe('secondary');
    expect(regionState('chest', ['quads'], [])).toBe('idle');
    expect(regionState('head', ['quads'], [])).toBe('body');
  });
});

