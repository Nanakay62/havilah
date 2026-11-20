'use strict';

import { describe, it, expect } from 'vitest';
import { parseMonthRangeQuery } from '../utils/dateRangeFilter.js';

describe('parseMonthRangeQuery', () => {
  it('returns inactive when no date parameters are provided', () => {
    expect(parseMonthRangeQuery({})).toEqual({ active: false });
    expect(parseMonthRangeQuery({ month: '', from: '', to: '' })).toEqual({ active: false });
  });

  it('parses a single month into exact UTC start and end boundaries', () => {
    const res = parseMonthRangeQuery({ month: '2026-11' });
    expect(res.active).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.from).toBe('2026-11');
    expect(res.to).toBe('2026-11');
    expect(res.range.$gte.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(res.range.$lte.toISOString()).toBe('2026-11-30T23:59:59.999Z');
  });

  it('handles leap-year and non-leap-year February correctly', () => {
    const leap = parseMonthRangeQuery({ month: '2024-02' });
    expect(leap.range.$lte.toISOString()).toBe('2024-02-29T23:59:59.999Z');

    const nonLeap = parseMonthRangeQuery({ month: '2026-02' });
    expect(nonLeap.range.$lte.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });

  it('parses multi-month ranges (Jan–Apr and Jan–Dec)', () => {
    const q1Plus = parseMonthRangeQuery({ from: '2026-01', to: '2026-04' });
    expect(q1Plus.active).toBe(true);
    expect(q1Plus.range.$gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(q1Plus.range.$lte.toISOString()).toBe('2026-04-30T23:59:59.999Z');

    const fullYear = parseMonthRangeQuery({ from: '2026-01', to: '2026-12' });
    expect(fullYear.active).toBe(true);
    expect(fullYear.range.$gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(fullYear.range.$lte.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('rejects malformed months and inverted ranges', () => {
    expect(parseMonthRangeQuery({ month: '2026-13' }).error).toBeTruthy();
    expect(parseMonthRangeQuery({ from: '2026-1' }).error).toBeTruthy();
    expect(parseMonthRangeQuery({ to: 'invalid' }).error).toBeTruthy();
    expect(parseMonthRangeQuery({ from: '2026-06', to: '2026-02' }).error).toBeTruthy();
  });
});
