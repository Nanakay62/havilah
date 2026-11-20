'use strict';

const YYYY_MM_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Parses optional month / month-range query parameters (`month`, `from`, `to`)
 * in `YYYY-MM` format and returns UTC date boundaries for MongoDB `$gte`/`$lte`.
 *
 * - If none of `month`, `from`, `to` are provided, returns `{ active: false }`.
 * - If `month` is provided (e.g., `2026-11`), filters that single calendar month.
 * - If `from` and/or `to` are provided (e.g., `from=2026-01&to=2026-04`), filters
 *   inclusively from the first millisecond of `from` to the last millisecond of `to`.
 *
 * @param {object} query - Express `req.query` object
 * @returns {{ active: boolean, error?: string, from?: string|null, to?: string|null, range?: object }}
 */
function parseMonthRangeQuery(query = {}) {
  const rawMonth = typeof query.month === 'string' ? query.month.trim() : '';
  const rawFrom = typeof query.from === 'string' ? query.from.trim() : '';
  const rawTo = typeof query.to === 'string' ? query.to.trim() : '';

  if (!rawMonth && !rawFrom && !rawTo) {
    return { active: false };
  }

  let fromStr = rawFrom;
  let toStr = rawTo;

  if (rawMonth) {
    if (!YYYY_MM_REGEX.test(rawMonth)) {
      return { active: true, error: 'Invalid month format. Expected YYYY-MM (e.g., 2026-11).' };
    }
    fromStr = rawMonth;
    toStr = rawMonth;
  } else {
    if (fromStr && !YYYY_MM_REGEX.test(fromStr)) {
      return { active: true, error: 'Invalid "from" month format. Expected YYYY-MM (e.g., 2026-01).' };
    }
    if (toStr && !YYYY_MM_REGEX.test(toStr)) {
      return { active: true, error: 'Invalid "to" month format. Expected YYYY-MM (e.g., 2026-12).' };
    }
  }

  if (fromStr && toStr && fromStr > toStr) {
    return { active: true, error: '"from" month must be earlier than or equal to "to" month.' };
  }

  const range = {};
  if (fromStr) {
    const [, y, m] = fromStr.match(YYYY_MM_REGEX);
    range.$gte = new Date(Date.UTC(Number(y), Number(m) - 1, 1, 0, 0, 0, 0));
  }
  if (toStr) {
    const [, y, m] = toStr.match(YYYY_MM_REGEX);
    // Day 0 of month `Number(m)` gives the last calendar day of month `Number(m) - 1` (0-indexed)
    range.$lte = new Date(Date.UTC(Number(y), Number(m), 0, 23, 59, 59, 999));
  }

  return {
    active: true,
    from: fromStr || null,
    to: toStr || null,
    range,
  };
}

module.exports = { parseMonthRangeQuery };
