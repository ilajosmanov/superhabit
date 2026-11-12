import { readFileSync } from 'node:fs';

import { expect, test } from 'vite-plus/test';

import { dark, light, type Colors } from './theme';

const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8');
const tokens = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map(([, name, hex]) => [name, hex]),
  );

test('the palettes mirror global.css: dark in @theme, light under its media query', () => {
  const [theme, lightBlock] = css.split('@media (prefers-color-scheme: light)');
  expect(dark).toEqual(tokens(theme));
  expect(light).toEqual(tokens(lightBlock));
});

// WCAG 2 relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('contrast is measured as WCAG does: black on white is 21:1', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
});

test.each<[string, Colors]>([
  ['dark', dark],
  ['light', light],
])('%s: text reads at AA on the ground and on a card', (_, palette) => {
  for (const back of [palette.ground, palette.surface]) {
    // Small text: 4.5:1 (WCAG 1.4.3). Mark and warn are text too ("12 / 12", an error line).
    for (const ink of ['chalk', 'soft', 'muted', 'subtle', 'mark', 'warn'] as const)
      expect(contrast(palette[ink], back), `${ink} on ${back}`).toBeGreaterThanOrEqual(4.5);
    // Large numerals and icons only: 3:1.
    expect(contrast(palette.faint, back), `faint on ${back}`).toBeGreaterThanOrEqual(3);
  }
  // The primary key's label.
  expect(contrast(palette.ink, palette.accent)).toBeGreaterThanOrEqual(4.5);
});

test("light: a control's outline stands 3:1 off the page (WCAG 1.4.11)", () => {
  expect(contrast(light.edge, light.ground)).toBeGreaterThanOrEqual(3);
  expect(contrast(light.edge, light.surface)).toBeGreaterThanOrEqual(3);
});
