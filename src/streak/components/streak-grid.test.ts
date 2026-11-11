import { describe, expect, it } from 'vite-plus/test';

import { dayAt, dayWords, weeks } from './streak-grid';

const TODAY = '2026-11-10';

it('labels today and adds the frozen or missed status to a picked day', () => {
  expect(dayWords(TODAY, 'alive', TODAY)).toBe('TODAY · TUE 10 NOV');
  expect(dayWords('2026-11-05', 'frozen', TODAY)).toBe('THU 5 NOV · FROZEN');
  expect(dayWords('2026-10-28', 'missed', TODAY)).toBe('WED 28 OCT · MISSED');
});

describe('weeks', () => {
  it('lays out 13 weeks ending with this one, Monday on top', () => {
    const grid = weeks(TODAY);

    expect(grid).toHaveLength(13);
    expect(grid[12]).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(grid[0][0]).toBe('2026-08-17');
  });
});

describe('dayAt', () => {
  // 20px squares, 3px gaps: 13 columns and 7 rows.
  const at = (x: number, y: number) => dayAt(TODAY, x, y, 13 * 23 - 3, 7 * 23 - 3);

  it('picks the square under a tap, a gap counting for the square before it', () => {
    expect(at(10, 10)).toBe('2026-08-17');
    expect(at(21.5, 21.5)).toBe('2026-08-17');
    expect(at(23 * 12 + 5, 23 + 5)).toBe(TODAY);
  });

  it('ignores days still to come and taps outside the grid', () => {
    expect(at(23 * 12 + 5, 23 * 2 + 5)).toBeNull();
    expect(at(-1, 10)).toBeNull();
    expect(at(10, 7 * 23 + 1)).toBeNull();
  });
});
