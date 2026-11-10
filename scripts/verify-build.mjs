import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const expectedText = [
  '<html lang="en">',
  '<h1>Nonogram Solver — Solve Your Puzzle Online</h1>',
  'What Is a Nonogram?',
  'How to Use This Nonogram Solver',
  'Tips for Entering Nonogram Clues',
  'Frequently Asked Questions',
  'What is a nonogram solver?',
  'Can I download the solved puzzle?',
  'Row 1',
  'Column 1',
  'https://nonogramsolver.app/'
];
for (const text of expectedText) assert.ok(html.includes(text), `Missing static HTML text: ${text}`);
assert.match(html, /<link rel="canonical" href="https:\/\/nonogramsolver\.app\/"/);
assert.match(html, /<meta property="og:title"/);
assert.match(html, /<label for="width">/);
assert.match(html, /<label for="height">/);
assert.match(html, /aria-label="Row 1 clues"/);
assert.match(html, /aria-label="Column 1 clues"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /role="alert"/);
const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((match) => JSON.parse(match[1]));
assert.equal(schemas.find((schema) => schema['@type'] === 'WebApplication')?.name, 'Nonogram Solver');
const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');
assert.equal(faq?.mainEntity.length, 7);
for (const item of faq.mainEntity) {
  assert.ok(html.includes(item.name), `FAQ question not visible: ${item.name}`);
  assert.ok(html.includes(item.acceptedAnswer.text), `FAQ answer not visible: ${item.name}`);
}
const assets = await readdir(new URL('../dist/_astro/', import.meta.url));
assert.ok(assets.some((asset) => asset.startsWith('solver.worker-') && asset.endsWith('.js')));
const cssFile = assets.find((asset) => asset.endsWith('.css'));
assert.ok(cssFile, 'Missing CSS asset');
const css = await readFile(new URL(`../dist/_astro/${cssFile}`, import.meta.url), 'utf8');
assert.match(css, /@media\s*\(max-width:\s*560px\)/);
for (const file of ['favicon.svg', 'robots.txt', 'sitemap.xml']) {
  await readFile(new URL(`../dist/${file}`, import.meta.url));
}
console.log('Static HTML, FAQ schema, Worker asset, and crawl files verified.');
