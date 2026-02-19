const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCopyThatMath } = require('./setup');

const { api, document } = loadCopyThatMath();
const { mathMLtoOMML, mathText } = api;

function parseMath(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.querySelector('math');
}

function convert(html) {
  return mathMLtoOMML(parseMath(html));
}

function has(xml, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  assert.match(xml, re);
}
function lacks(xml, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  assert.doesNotMatch(xml, re);
}

// ── Basic elements ─────────────────────────────────────────────────

describe('mathMLtoOMML — basic', () => {
  it('mi single char → italic', () => {
    const out = convert('<math><mi>x</mi></math>');
    has(out, '<m:t>x</m:t>');
  });

  it('mi multi-char → upright', () => {
    const out = convert('<math><mi>sin</mi></math>');
    has(out, 'm:val="p"');
  });

  it('mn → plain run', () => {
    const out = convert('<math><mn>42</mn></math>');
    has(out, '<m:t>42</m:t>');
    lacks(out, 'm:sty');
  });

  it('mo → plain run', () => {
    const out = convert('<math><mo>+</mo></math>');
    has(out, '<m:t>\\+</m:t>');
  });
});

// ── Structure ──────────────────────────────────────────────────────

describe('mathMLtoOMML — structure', () => {
  it('msub → sSub', () => {
    const out = convert('<math><msub><mi>x</mi><mn>2</mn></msub></math>');
    has(out, '<m:sSub>');
  });

  it('msup → sSup', () => {
    const out = convert('<math><msup><mi>x</mi><mn>2</mn></msup></math>');
    has(out, '<m:sSup>');
  });

  it('mfrac → f', () => {
    const out = convert('<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>');
    has(out, '<m:f>');
    has(out, '<m:num>');
    has(out, '<m:den>');
  });

  it('msqrt → rad with degHide', () => {
    const out = convert('<math><msqrt><mi>x</mi></msqrt></math>');
    has(out, '<m:rad>');
    has(out, 'degHide m:val="on"');
  });

  it('mroot → rad with degree', () => {
    const out = convert('<math><mroot><mi>x</mi><mn>3</mn></mroot></math>');
    has(out, '<m:deg>');
    lacks(out, 'degHide');
  });
});

// ── Nary ───────────────────────────────────────────────────────────

describe('mathMLtoOMML — nary', () => {
  it('munder with big op → nary with supHide', () => {
    const out = convert(
      '<math><munder><mo>\u2211</mo><mi>j</mi></munder><mi>x</mi></math>');
    has(out, '<m:nary>');
    has(out, 'supHide m:val="on"');
  });

  it('msub with big op → nary via omNary', () => {
    const out = convert(
      '<math><msub><mo>\u2211</mo><mi>j</mi></msub><mi>x</mi></math>');
    has(out, '<m:nary>');
    has(out, '<m:supHide');
  });

  it('nary body collects remaining siblings', () => {
    const out = convert(
      '<math><mrow><munder><mo>\u2211</mo><mi>j</mi></munder>' +
      '<msub><mi>a</mi><mi>j</mi></msub></mrow></math>');
    // Body should contain content
    lacks(out, '<m:e></m:e></m:nary>');
    lacks(out, '<m:e/>');
  });
});

// ── Fences ─────────────────────────────────────────────────────────

describe('mathMLtoOMML — fences', () => {
  it('mrow with fence mo → d', () => {
    const out = convert(
      '<math><mrow><mo fence="true">(</mo><mi>x</mi><mo fence="true">)</mo></mrow></math>');
    has(out, '<m:d>');
  });

  it('mfenced → d', () => {
    const out = convert(
      '<math><mfenced open="[" close="]"><mi>a</mi></mfenced></math>');
    has(out, '<m:d>');
    has(out, 'begChr m:val="\\["');
    has(out, 'endChr m:val="\\]"');
  });
});

// ── Display mode ───────────────────────────────────────────────────

describe('mathMLtoOMML — display', () => {
  it('display="block" → oMathPara', () => {
    const out = convert('<math display="block"><mi>x</mi></math>');
    has(out, '<m:oMathPara');
  });

  it('no display attr → oMath only', () => {
    const out = convert('<math><mi>x</mi></math>');
    lacks(out, 'oMathPara');
  });
});

// ── Semantics ──────────────────────────────────────────────────────

describe('mathMLtoOMML — semantics', () => {
  it('uses first child, ignores annotation', () => {
    const out = convert(
      '<math><semantics><mrow><mi>x</mi></mrow>' +
      '<annotation encoding="application/x-tex">x</annotation></semantics></math>');
    has(out, '<m:t>x</m:t>');
    lacks(out, 'application/x-tex');
  });
});

// ── Self-closing expansion ─────────────────────────────────────────

describe('mathMLtoOMML — self-closing expansion', () => {
  it('no self-closing m: tags', () => {
    const out = convert('<math><msqrt><mfrac><mi>a</mi><mi>b</mi></mfrac></msqrt></math>');
    lacks(out, /<m:\w+\s*\/>/);
  });
});

// ── Default delimiters ────────────────────────────────────────────

describe('mathMLtoOMML — default delimiters', () => {
  it('fence with () omits dPr', () => {
    const out = convert(
      '<math><mrow><mo fence="true">(</mo><mi>x</mi><mo fence="true">)</mo></mrow></math>');
    lacks(out, '<m:dPr>');
  });

  it('mfenced with default open/close omits dPr', () => {
    const out = convert(
      '<math><mfenced><mi>a</mi></mfenced></math>');
    lacks(out, '<m:dPr>');
  });
});

// ── mathText fallback extraction ──────────────────────────────────

describe('mathText', () => {
  it('extracts text from simple math element', () => {
    const m = parseMath('<math><mi>x</mi><mo>+</mo><mn>1</mn></math>');
    assert.equal(mathText(m), 'x+1');
  });

  it('extracts from semantics first child, ignoring annotation', () => {
    const m = parseMath(
      '<math><semantics><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>' +
      '<annotation encoding="application/x-tex">a+b</annotation></semantics></math>');
    assert.equal(mathText(m), 'a+b');
  });

  it('returns empty string for empty math', () => {
    const m = parseMath('<math></math>');
    assert.equal(mathText(m), '');
  });
});
