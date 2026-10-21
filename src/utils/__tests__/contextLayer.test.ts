import { describe, expect, it } from 'vitest';
import {
  CONTEXT_BREAKS, CONTEXT_COLOURS, INCOME_TOP_CODE, UNRELIABLE_MOE_FRACTION, acsWindow, contextClassIndex,
  contextClassLabels, contextFillColorExpr, contextNoDataFilter, contextValidFilter, readContext,
} from '../contextLayer';
import { contextPopupLines } from '../../components/Interval/ContextPopup';

describe('context layer scales', () => {
  it('has four breaks and five colours per metric, ascending', () => {
    for (const metric of ['density', 'income'] as const) {
      expect(CONTEXT_BREAKS[metric]).toHaveLength(4);
      expect(CONTEXT_COLOURS[metric]).toHaveLength(5);
      const b = CONTEXT_BREAKS[metric];
      expect([...b].sort((x, y) => x - y)).toEqual([...b]);
    }
  });

  it('puts a value on a break in the upper class, and covers both ends', () => {
    expect(contextClassIndex('density', 0)).toBe(0);
    expect(contextClassIndex('density', 49.9)).toBe(0);
    expect(contextClassIndex('density', 50)).toBe(1);
    expect(contextClassIndex('density', 1161.8)).toBe(4);
    expect(contextClassIndex('density', 60000)).toBe(4);
    expect(contextClassIndex('income', 49642)).toBe(0);
    expect(contextClassIndex('income', 63750)).toBe(2);
    expect(contextClassIndex('income', 250001)).toBe(4);
  });

  it('keeps separate scales per metric', () => {
    expect(CONTEXT_BREAKS.density).not.toEqual(CONTEXT_BREAKS.income);
    expect(CONTEXT_COLOURS.density).not.toEqual(CONTEXT_COLOURS.income);
  });

  it('builds a step expression with every break and colour', () => {
    const expr = contextFillColorExpr('income');
    expect(expr).toEqual(['step', ['get', 'income'], ...[CONTEXT_COLOURS.income[0], 49643, CONTEXT_COLOURS.income[1], 63750, CONTEXT_COLOURS.income[2], 79750, CONTEXT_COLOURS.income[3], 105547, CONTEXT_COLOURS.income[4]]]);
  });

  it('labels five classes without all-caps', () => {
    const labels = contextClassLabels('income');
    expect(labels).toHaveLength(5);
    expect(labels[0]).toBe('Under $49,643');
    expect(labels[4]).toBe('$105,547 or more');
    for (const l of [...labels, ...contextClassLabels('density')]) expect(/\p{Ll}/u.test(l) || /^[\d$,.–]+$/.test(l)).toBe(true);
  });

  it('names the survey window', () => {
    expect(acsWindow(2023)).toEqual([2019, 2023]);
  });
});

describe('what counts as no reliable figure', () => {
  it('density: a value, or missing', () => {
    expect(readContext('density', { density: 1200 })).toMatchObject({ kind: 'value', value: 1200 });
    expect(readContext('density', {})).toEqual({ kind: 'missing' });
    // The baked income flag does not grey density.
    expect(readContext('density', { density: 10, income_moe_pct: 0.9 })).toMatchObject({ kind: 'value' });
  });

  it('income: missing, too uncertain, or a value with its margin', () => {
    expect(readContext('income', {})).toEqual({ kind: 'missing' });
    expect(readContext('income', { income: 70000 })).toMatchObject({ kind: 'uncertain', marginPct: null });
    expect(readContext('income', { income: 70000, income_moe_pct: UNRELIABLE_MOE_FRACTION + 0.01 })).toMatchObject({ kind: 'uncertain' });
    expect(readContext('income', { income: 70000, income_moe_pct: UNRELIABLE_MOE_FRACTION })).toMatchObject({ kind: 'value', marginPct: UNRELIABLE_MOE_FRACTION });
  });

  it('income at the top code is a valid figure even with a huge margin', () => {
    expect(readContext('income', { income: INCOME_TOP_CODE, income_moe_pct: 0.8 })).toMatchObject({ kind: 'value', topCoded: true });
    expect(readContext('income', { income: INCOME_TOP_CODE })).toMatchObject({ kind: 'value', topCoded: true });
  });

  it('map filters are exact complements', () => {
    expect(contextNoDataFilter('income')).toEqual(['!', contextValidFilter('income')]);
    expect(contextValidFilter('density')).toEqual(['has', 'density']);
  });
});

describe('popup lines', () => {
  it('income shows the value and the margin of error', () => {
    const { lines } = contextPopupLines('income', { income: 63750, income_moe_pct: 0.18 });
    expect(lines).toEqual(['$63,750 a year', 'Could be off by about 18%']);
  });
  it('top-coded income shows the top code, no margin', () => {
    expect(contextPopupLines('income', { income: INCOME_TOP_CODE, income_moe_pct: 0.5 }).lines).toEqual(['$250,000 or more']);
  });
  it('uncertain and missing figures say so', () => {
    expect(contextPopupLines('income', { income: 50000, income_moe_pct: 0.4 }).lines[0]).toMatch(/Too uncertain/);
    expect(contextPopupLines('density', {}).lines[0]).toMatch(/No population/);
  });
  it('density shows a rounded figure', () => {
    expect(contextPopupLines('density', { density: 1161.84 }).lines).toEqual(['1,162 people per square kilometre']);
  });
});
