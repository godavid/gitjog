// Unit tests of the a11y baseline matching. Run: node --test actions/web-quality/a11y-match.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { currentDocument, isGeneratedId, loadBaseline, matchFindings, normalizeHtml, normalizeTarget, parseBaseline, toFinding } from './a11y-match.mjs';

const f = (over = {}) => ({ rule: 'color-contrast', target: '.note', path: '/', viewport: 'desktop', impact: 'serious', help: 'h', html: '<p class="note">Low</p>', ...over });

test('normalizeTarget drops positional parts and keeps the rest', () => {
  assert.equal(normalizeTarget('ul > li:nth-child(3) > a'), 'ul > li > a');
  assert.equal(normalizeTarget('.card:nth-of-type(2) .note:nth-last-child(1)'), '.card .note');
  assert.equal(normalizeTarget('p:nth-last-of-type(2n+1)'), 'p');
  assert.equal(normalizeTarget('li:first-child a:last-child span:first-of-type b:last-of-type i:only-child u:only-of-type'), 'li a span b i u');
  assert.equal(normalizeTarget('div > :nth-child(2) > p'), 'div > p');
  assert.equal(normalizeTarget(['iframe:nth-child(2)', '.note']), 'iframe .note');
  assert.equal(normalizeTarget('  .a   .b '), '.a .b');
  assert.equal(normalizeTarget('.first-child-card'), '.first-child-card');
  assert.equal(normalizeTarget(normalizeTarget('ul > li:nth-child(3) > a')), 'ul > li > a');
});

test('normalizeTarget and normalizeHtml drop generated ids only', () => {
  assert.equal(normalizeTarget('#radix-\\:r1\\: > button'), '#* > button');
  assert.equal(normalizeTarget('#main > #field-12345'), '#main > #*');
  assert.equal(normalizeHtml('<input id=":r3:" aria-labelledby="radix-:r4: title">'), '<input id="#" aria-labelledby="#">');
  assert.equal(normalizeHtml('<label for="email" id="email-label">x</label>'), '<label for="email" id="email-label">x</label>');
  assert.equal(isGeneratedId('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isGeneratedId('headlessui-menu-button-12'), true);
  assert.equal(isGeneratedId('main-nav'), false);
});

test('normalizeHtml collapses whitespace and drops style and nonce values', () => {
  assert.equal(normalizeHtml('<p  class="a"\n   style="color: red"   nonce="abc123">\n  Hi\n</p>'), '<p class="a"> Hi </p>');
  assert.equal(normalizeHtml("<script nonce='x1'>1</script>"), '<script>1</script>');
});

test('an inserted element that shifts nth-child does not make known findings new', () => {
  const baseline = [f({ target: '.card:nth-child(3) > .note', html: undefined }), f({ target: '.card:nth-child(4) > .note', html: undefined })];
  const current = [f({ target: '.card:nth-child(4) > .note' }), f({ target: '.card:nth-child(5) > .note', html: '<p class="note">Other</p>' })];
  const r = matchFindings(baseline, current);
  assert.deepEqual(r.fresh, []);
  assert.equal(r.known.length, 2);
  assert.deepEqual(r.stale, []);
});

test('a changed selector with the same html is known', () => {
  const baseline = [f({ target: '#old-wrapper .note', html: '<p class="note"  style="x:y">Low</p>' })];
  const current = [f({ target: '#new-wrapper .note', html: '<p class="note">Low</p>' })];
  const r = matchFindings(baseline, current);
  assert.deepEqual(r.fresh, []);
  assert.deepEqual(r.stale, []);
});

test('same target but different html is known through the target', () => {
  const r = matchFindings([f({ html: '<p class="note">Old text</p>' })], [f({ html: '<p class="note">New text</p>' })]);
  assert.deepEqual(r.fresh, []);
});

test('a different element is new, and the other rule, path or viewport never matches', () => {
  const base = [f()];
  assert.equal(matchFindings(base, [f({ target: '.other', html: '<p class="other">x</p>' })]).fresh.length, 1);
  assert.equal(matchFindings(base, [f({ rule: 'image-alt' })]).fresh.length, 1);
  assert.equal(matchFindings(base, [f({ path: '/about.html' })]).fresh.length, 1);
  assert.equal(matchFindings(base, [f({ viewport: 'mobile' })]).fresh.length, 1);
});

test('multiplicity: 3 equal baseline entries and 4 current findings leave 1 new', () => {
  const entry = f({ target: 'li:nth-child(1) > a', html: '<a href="#">x</a>' });
  const baseline = [entry, { ...entry, target: 'li:nth-child(2) > a' }, { ...entry, target: 'li:nth-child(3) > a' }];
  const current = [1, 2, 3, 4].map((n) => ({ ...entry, target: `li:nth-child(${n}) > a` }));
  const r = matchFindings(baseline, current);
  assert.equal(r.fresh.length, 1);
  assert.equal(r.known.length, 3);
  assert.equal(r.stale.length, 0);
  // and the other way round: 3 baseline entries, 2 current findings: 1 stale
  const back = matchFindings(baseline, current.slice(0, 2));
  assert.equal(back.fresh.length, 0);
  assert.equal(back.stale.length, 1);
});

test('a version 1 baseline (no html) is read through the normalized target', () => {
  const baseline = parseBaseline({ version: 1, findings: [{ rule: 'color-contrast', target: '.wrap > p:nth-child(2)', path: '/', viewport: 'desktop', impact: 'serious', help: 'h' }] });
  const shifted = f({ target: '.wrap > p:nth-child(3)', html: '<p>Low</p>' });
  assert.deepEqual(matchFindings(baseline, [shifted]).fresh, []);
  const other = f({ target: '.wrap > ul', html: '<ul></ul>' });
  const r = matchFindings(baseline, [other]);
  assert.equal(r.fresh.length, 1);
  assert.equal(r.stale.length, 1);
});

test('stale detection uses the same matching', () => {
  const baseline = [f({ target: '.a:nth-child(2)', html: '<p class="a">A</p>' }), f({ target: '.gone', html: '<p class="gone">G</p>' })];
  const current = [f({ target: '.a:nth-child(5)', html: '<p class="a">A</p>' })];
  const r = matchFindings(baseline, current);
  assert.deepEqual(r.fresh, []);
  assert.deepEqual(r.stale.map((s) => s.target), ['.gone']);
});

test('pass 1 (html) wins over pass 2 (target) so equal targets with different html pair up correctly', () => {
  const a = f({ target: 'li:nth-child(1)', html: '<li>A</li>' });
  const b = f({ target: 'li:nth-child(2)', html: '<li>B</li>' });
  // current order is swapped and the positions shifted: html decides.
  const r = matchFindings([a, b], [{ ...b, target: 'li:nth-child(3)' }, { ...a, target: 'li:nth-child(4)' }]);
  assert.deepEqual(r.fresh, []);
  assert.deepEqual(r.stale, []);
});

test('parseBaseline accepts versions 1 and 2 and rejects the rest', () => {
  assert.equal(parseBaseline({ version: 1, findings: [] }).length, 0);
  assert.equal(parseBaseline({ version: 2, findings: [{ rule: 'r', path: '/', viewport: 'mobile', html: '<p>x</p>' }] }).length, 1);
  assert.throws(() => parseBaseline({ version: 3, findings: [] }), /version/);
  assert.throws(() => parseBaseline({ version: 2 }), /findings/);
  assert.throws(() => parseBaseline({ version: 2, findings: [{ rule: 'r', path: '/', viewport: 'mobile' }] }), /target.*html/);
});

test('loadBaseline: a missing file is empty, a file is parsed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wq-a11y-'));
  try {
    assert.deepEqual(loadBaseline(path.join(dir, 'none.json')), []);
    const file = path.join(dir, 'b.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, findings: [{ rule: 'r', target: '.a', path: '/', viewport: 'mobile' }] }));
    assert.equal(loadBaseline(file).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('toFinding and currentDocument write the version 2 format', () => {
  const finding = toFinding({ id: 'color-contrast', impact: 'serious', help: 'Contrast' }, { target: ['.a', '.b'], html: '<p  style="x">  hi </p>' }, '/', 'mobile');
  assert.deepEqual(finding, { rule: 'color-contrast', target: '.a .b', path: '/', viewport: 'mobile', impact: 'serious', help: 'Contrast', html: '<p> hi </p>' });
  const doc = currentDocument([f({ rule: 'z' }), finding]);
  assert.equal(doc.version, 2);
  assert.deepEqual(doc.findings.map((x) => x.rule), ['color-contrast', 'z']);
  assert.deepEqual(Object.keys(doc.findings[0]), ['rule', 'target', 'path', 'viewport', 'impact', 'help', 'html']);
  // the document is a valid baseline for itself
  assert.deepEqual(matchFindings(parseBaseline(doc), doc.findings).fresh, []);
});

test('two equal html snippets, one changed: both stay known (no greedy theft)', () => {
  const base = [
    { rule: 'button-name', path: '/', viewport: 'desktop', target: '.first > button', html: '<button></button>' },
    { rule: 'button-name', path: '/', viewport: 'desktop', target: '.second > button', html: '<button></button>' },
  ];
  const cur = [
    { rule: 'button-name', path: '/', viewport: 'desktop', target: '.first > button', html: '<button type="button"></button>' },
    { rule: 'button-name', path: '/', viewport: 'desktop', target: '.second > button', html: '<button></button>' },
  ];
  const { fresh, stale } = matchFindings(base, cur);
  assert.deepEqual(fresh, []);
  assert.deepEqual(stale, []);
});
