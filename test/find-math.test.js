const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCopyThatMath } = require('./setup');

const { api, document } = loadCopyThatMath();
const { findMathElements } = api;

function container(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

// ── KaTeX detection ────────────────────────────────────────────────

describe('findMathElements — KaTeX', () => {
  it('detects .katex with .katex-mathml', () => {
    const c = container(
      '<span class="katex">' +
        '<span class="katex-mathml"><math><mi>x</mi></math></span>' +
        '<span class="katex-html" aria-hidden="true">x</span>' +
      '</span>');
    const items = findMathElements(c);
    assert.equal(items.length, 1);
    assert.ok(items[0].mathml);
  });

  it('replaces data-math ancestor if present', () => {
    const c = container(
      '<span data-math="x"><span class="katex">' +
        '<span class="katex-mathml"><math><mi>x</mi></math></span>' +
      '</span></span>');
    const items = findMathElements(c);
    assert.equal(items.length, 1);
    assert.equal(items[0].element.getAttribute('data-math'), 'x');
  });
});

// ── MathJax detection ──────────────────────────────────────────────

describe('findMathElements — MathJax', () => {
  it('detects mjx-container with math', () => {
    const c = container(
      '<mjx-container class="MathJax">' +
        '<mjx-math></mjx-math>' +
        '<mjx-assistive-mml><math><mi>x</mi></math></mjx-assistive-mml>' +
      '</mjx-container>');
    const items = findMathElements(c);
    assert.equal(items.length, 1);
    assert.ok(items[0].mathml);
  });
});

// ── Native math ────────────────────────────────────────────────────

describe('findMathElements — native math', () => {
  it('detects standalone <math>', () => {
    const c = container('<math><mi>x</mi></math>');
    const items = findMathElements(c);
    assert.equal(items.length, 1);
  });

  it('no duplicates when math already handled by KaTeX pass', () => {
    const c = container(
      '<span class="katex"><span class="katex-mathml">' +
        '<math><mi>x</mi></math></span></span>');
    const items = findMathElements(c);
    assert.equal(items.length, 1);
  });
});

// ── Structural duplicate detection ─────────────────────────────────

describe('findMathElements — structural detection', () => {
  it('hidden math + sibling img (Wikipedia pattern) → replaces wrapper', () => {
    const c = container(
      '<span class="mwe">' +
        '<span style="display:none"><math><mi>x</mi></math></span>' +
        '<img alt="{\\displaystyle x}">' +
      '</span>');
    const items = findMathElements(c);
    assert.equal(items.length, 1);
    assert.equal(items[0].element.className, 'mwe');
  });

  it('hidden math + sibling img at container boundary → no duplicate', () => {
    // Simulates clicking on .mwe-math-element directly
    const c = container(
      '<span style="display:none"><math><mi>x</mi></math></span>' +
      '<img alt="{\\displaystyle x}">');
    const items = findMathElements(c);
    assert.equal(items.length, 1);
    assert.ok(items[0].mathml);
  });
});

// ── data-math fallback ─────────────────────────────────────────────

describe('findMathElements — data-math', () => {
  it('detects [data-math] without math element', () => {
    const c = container(
      '<span data-math="x^2"><span class="katex"><span class="katex-html">x²</span></span></span>');
    const items = findMathElements(c);
    assert.equal(items.length, 1);
    assert.equal(items[0].latex, 'x^2');
  });
});

// ── Standalone math images ─────────────────────────────────────────

describe('findMathElements — standalone images', () => {
  it('img with LaTeX alt text detected', () => {
    const c = container('<img alt="\\frac{1}{2}">');
    const items = findMathElements(c);
    assert.equal(items.length, 1);
    assert.ok(items[0].latex);
  });

  it('img without LaTeX alt text ignored', () => {
    const c = container('<img alt="a photo">');
    const items = findMathElements(c);
    assert.equal(items.length, 0);
  });
});
