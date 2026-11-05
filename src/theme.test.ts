import { readFileSync } from 'node:fs';

import { expect, test } from 'vite-plus/test';

import { colors } from './theme';

test('colors mirror the @theme block in global.css', () => {
  const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8');
  const tokens = Object.fromEntries(
    [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map(([, name, hex]) => [name, hex]),
  );
  expect(colors).toEqual(tokens);
});
