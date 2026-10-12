/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Prints the WCAG contrast ratio of every text and state colour pair, read from src/styles.css.
// Usage: node design/contrast.mjs   (exits 1 if any pair is under its minimum)
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('/* ---- Base'));
const read = (text) => Object.fromEntries([...text.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\b/g)].map((m) => [m[1], m[2]]));
const light = read(css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)')));
const themes = { light, dark: { ...light, ...read(dark) } };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
// [foreground, background, minimum, what it is]
const pairs = [
  ['ink', 'paper', 4.5, 'text on the page'], ['ink', 'field', 4.5, 'text in a field, table or record'], ['ink', 'tint', 4.5, 'text on a hovered row'],
  ['ink-soft', 'paper', 4.5, 'secondary text on the page; disabled button text'], ['ink-soft', 'field', 4.5, 'secondary text in a field'], ['ink-soft', 'tint', 4.5, 'secondary text on a hovered row'],
  ['action', 'paper', 4.5, 'link and disclosure text'], ['on-action', 'action', 4.5, 'primary button'], ['on-action', 'action-strong', 4.5, 'primary button, hovered'],
  ['pass', 'paper', 4.5, 'Pass word and mark in a row'], ['pass', 'tint', 4.5, 'Pass on a hovered row'], ['on-fill', 'pass-fill', 4.5, 'Pass verdict'],
  ['fail', 'paper', 4.5, 'Fail word and mark in a row; field error'], ['fail', 'field', 4.5, 'refusal frame and mark'], ['fail', 'tint', 4.5, 'Fail on a hovered row'], ['on-fill', 'fail-fill', 4.5, 'Fail verdict'],
  ['on-flag', 'flag-fill', 4.5, 'Incomplete verdict'], ['on-flag', 'HATCH', 4.5, 'Incomplete verdict, on a hatch line'],
  ['ink', 'paper', 4.5, 'Not checked word'], ['ink-soft', 'paper', 4.5, 'Nothing to check word and mark'],
  ['rule-strong', 'paper', 3, 'control border on the page (non-text)'], ['rule-strong', 'field', 3, 'control border on a field (non-text)'],
  ['focus', 'paper', 3, 'focus ring (non-text)'], ['focus', 'field', 3, 'focus ring on a field (non-text)'], ['NOT-CHECKED-BOX', 'paper', 3, 'the Not checked box against the page: its border or its fill, whichever is stronger (non-text)'],
];
let bad = 0;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`);
  for (const [fg, bg, min, what] of pairs) {
    const b = bg === 'HATCH' ? mix(rgb(t['flag-fill']), [20, 35, 63], 0.16) : rgb(t[bg]);
    const r = fg === 'NOT-CHECKED-BOX' ? Math.max(ratio(rgb(t.ink), b), ratio(rgb(t['flag-fill']), b)) : ratio(rgb(t[fg]), b);
    if (r < min) bad++;
    console.log(`  ${r.toFixed(2).padStart(5)}  ${r >= min ? 'ok  ' : 'LOW '} ${`${fg} ${t[fg] ?? ''}`.padEnd(22)} on ${`${bg === 'HATCH' ? 'hatch line' : bg} ${bg === 'HATCH' ? '' : t[bg]}`.padEnd(24)} min ${min}  ${what}`);
  }
}
process.exit(bad ? 1 : 0);
