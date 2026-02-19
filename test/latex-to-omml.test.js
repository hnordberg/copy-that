const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCopyThatMath } = require('./setup');

const { api } = loadCopyThatMath();
const { latexToOMML, stripInvisible } = api;

function omml(tex, display) {
  return latexToOMML(tex, !!display);
}

function has(xml, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  assert.match(xml, re);
}
function lacks(xml, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  assert.doesNotMatch(xml, re);
}

// ── Basic atoms ────────────────────────────────────────────────────

describe('latexToOMML — basic atoms', () => {
  it('single letter becomes italic run', () => {
    const out = omml('x');
    has(out, '<m:t>x</m:t>');
  });

  it('digit becomes plain run', () => {
    const out = omml('42');
    has(out, '<m:t>42</m:t>');
    lacks(out, 'm:sty');
  });

  it('Greek letter maps to Unicode', () => {
    const out = omml('\\alpha');
    has(out, '<m:t>\u03B1</m:t>');
  });

  it('symbol maps to Unicode', () => {
    const out = omml('\\infty');
    has(out, '<m:t>\u221E</m:t>');
  });
});

// ── Subscripts, superscripts ───────────────────────────────────────

describe('latexToOMML — sub/sup', () => {
  it('subscript', () => {
    const out = omml('x_t');
    has(out, '<m:sSub>');
    has(out, '<m:t>x</m:t>');
    has(out, '<m:sub>');
    has(out, '<m:t>t</m:t>');
  });

  it('superscript', () => {
    const out = omml('x^2');
    has(out, '<m:sSup>');
    has(out, '<m:t>2</m:t>');
  });

  it('both sub and sup', () => {
    const out = omml('x_i^2');
    has(out, '<m:sSubSup>');
  });
});

// ── Fractions and roots ────────────────────────────────────────────

describe('latexToOMML — frac/sqrt', () => {
  it('\\frac produces <m:f>', () => {
    const out = omml('\\frac{a}{b}');
    has(out, '<m:f>');
    has(out, '<m:num>');
    has(out, '<m:den>');
  });

  it('\\frac with spaces before braces', () => {
    const out = omml('\\frac {a}{b}');
    has(out, '<m:f>');
  });

  it('\\sqrt produces <m:rad> with degHide', () => {
    const out = omml('\\sqrt{x}');
    has(out, '<m:rad>');
    has(out, 'degHide');
  });

  it('\\sqrt[n] produces <m:rad> with degree', () => {
    const out = omml('\\sqrt[3]{x}');
    has(out, '<m:deg>');
    has(out, '<m:t>3</m:t>');
    lacks(out, 'degHide');
  });
});

// ── Nary operators ─────────────────────────────────────────────────

describe('latexToOMML — nary', () => {
  it('\\sum produces <m:nary>', () => {
    const out = omml('\\sum_{i=1}^{n} x_i');
    has(out, '<m:nary>');
    has(out, '\u2211');
  });

  it('empty sup gets supHide', () => {
    const out = omml('\\sum_{j} c_j');
    has(out, 'supHide m:val="on"');
  });

  it('empty sub gets subHide', () => {
    const out = omml('\\sum^{n} a');
    has(out, 'subHide m:val="on"');
  });

  it('display mode uses undOvr limLoc', () => {
    const out = omml('\\sum_{j} c_j', true);
    has(out, 'limLoc m:val="undOvr"');
  });

  it('inline mode uses subSup limLoc', () => {
    const out = omml('\\sum_{j} c_j', false);
    has(out, 'limLoc m:val="subSup"');
  });

  it('nary body collects remaining expression', () => {
    const out = omml('\\sum_{i} a_i + b');
    has(out, '<m:e>');
    // The body should contain content (not be self-closing)
    lacks(out, '<m:e/>');
  });
});

// ── Delimiters ─────────────────────────────────────────────────────

describe('latexToOMML — \\left...\\right', () => {
  it('produces <m:d>', () => {
    const out = omml('\\left( x \\right)');
    has(out, '<m:d>');
  });

  it('trailing subscript attaches to delimiter', () => {
    const out = omml('\\left( a \\right)_{k=0}');
    has(out, '<m:sSub>');
    has(out, '<m:d>');
    // The sSub should wrap the delimiter
    const ssubStart = out.indexOf('<m:sSub>');
    const dStart = out.indexOf('<m:d>');
    assert.ok(ssubStart < dStart, 'sSub should wrap the delimiter');
  });

  it('captures close delimiter from \\right', () => {
    const out = omml('\\left[ x \\right]');
    has(out, 'endChr m:val="\\]"');
    has(out, 'begChr m:val="\\["');
  });

  it('default parens omit dPr', () => {
    const out = omml('\\left( x \\right)');
    lacks(out, '<m:dPr>');
  });

  it('\\left. invisible delimiter', () => {
    const out = omml('\\left. x \\right|');
    has(out, '<m:d>');
  });
});

// ── Text commands ──────────────────────────────────────────────────

describe('latexToOMML — text', () => {
  it('\\mathrm produces upright text', () => {
    const out = omml('\\mathrm{diag}');
    has(out, '<m:t>diag</m:t>');
    has(out, 'm:val="p"');
  });

  it('\\displaystyle is a no-op', () => {
    const out = omml('\\displaystyle x');
    has(out, '<m:t>x</m:t>');
  });
});

// ── Accents and bars ───────────────────────────────────────────────

describe('latexToOMML — accents/bars', () => {
  it('\\hat produces <m:acc>', () => {
    const out = omml('\\hat{x}');
    has(out, '<m:acc>');
  });

  it('\\overline produces <m:bar> top', () => {
    const out = omml('\\overline{x}');
    has(out, '<m:bar>');
    has(out, 'pos m:val="top"');
  });
});

// ── Environments ───────────────────────────────────────────────────

describe('latexToOMML — environments', () => {
  it('pmatrix produces matrix with parens', () => {
    const out = omml('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
    has(out, '<m:m>');
    has(out, '<m:mr>');
    has(out, '<m:d>');
  });

  it('cases produces matrix with left brace', () => {
    const out = omml('\\begin{cases} x & y \\\\ a & b \\end{cases}');
    has(out, '<m:m>');
    has(out, 'begChr m:val="\\{"');
  });
});

// ── Display mode wrapping ──────────────────────────────────────────

describe('latexToOMML — display mode', () => {
  it('display=true wraps in oMathPara', () => {
    const out = omml('x', true);
    has(out, '<m:oMathPara');
  });

  it('display=false is just oMath', () => {
    const out = omml('x', false);
    has(out, '<m:oMath');
    lacks(out, 'oMathPara');
  });
});

// ── Invisible character stripping ─────────────────────────────────

describe('invisible character handling', () => {
  it('omRun strips zero-width spaces from LaTeX output', () => {
    const out = omml('a\u200Bb');
    has(out, '<m:t>a</m:t>');
    has(out, '<m:t>b</m:t>');
    lacks(out, '\u200B');
  });

  it('omRun strips function application (U+2061)', () => {
    const out = omml('f\u2061(x)');
    lacks(out, '\u2061');
  });

  it('stripInvisible removes all invisible chars', () => {
    const input = 'hello\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFFworld';
    assert.equal(stripInvisible(input), 'helloworld');
  });

  it('stripInvisible returns same string when no invisible chars', () => {
    assert.equal(stripInvisible('abc 123'), 'abc 123');
  });
});

// ── Self-closing tag expansion ─────────────────────────────────────

describe('latexToOMML — self-closing expansion', () => {
  it('no self-closing m: tags in output', () => {
    const out = omml('\\sqrt{\\frac{a}{b}}');
    lacks(out, /<m:\w+\s*\/>/);
  });
});

// ── stripDisplayStyle ──────────────────────────────────────────────

describe('stripDisplayStyle', () => {
  it('strips {\\displaystyle ...}', () => {
    const result = api.stripDisplayStyle('{\\displaystyle x+1}');
    assert.equal(result, 'x+1');
  });

  it('passes through plain LaTeX', () => {
    const result = api.stripDisplayStyle('x+1');
    assert.equal(result, 'x+1');
  });
});

// ── Wikipedia alt text round-trip ──────────────────────────────────

describe('latexToOMML — Wikipedia alt text', () => {
  it('typical displaystyle alt text converts correctly', () => {
    const alt = '{\\displaystyle f(t)=\\left(e^{it/r^{k}}\\right)_{k=0,1,\\ldots ,{\\frac {d}{2}}-1}}';
    const tex = api.stripDisplayStyle(alt);
    const out = latexToOMML(tex, true);
    has(out, '<m:oMathPara');
    has(out, '<m:d>');
    has(out, '<m:sSub>');
    has(out, '<m:f>');
    has(out, '<m:t>f</m:t>');
  });

  it('sum with subscript only', () => {
    const alt = '{\\displaystyle \\sum _{j}c_{j}f(t+\\Delta t_{j})=\\left(\\sum _{j}c_{j}\\,\\mathrm {diag} (f(\\Delta t_{j}))\\right)f(t)}';
    const tex = api.stripDisplayStyle(alt);
    const out = latexToOMML(tex, true);
    has(out, '<m:nary>');
    has(out, 'supHide m:val="on"');
    has(out, 'limLoc m:val="undOvr"');
    // Nary body should not be empty
    lacks(out, '<m:e></m:e></m:nary>');
  });

  it('simple expression without displaystyle', () => {
    const alt = '\\frac{1}{2}';
    const tex = api.stripDisplayStyle(alt);
    const out = latexToOMML(tex, true);
    has(out, '<m:f>');
    has(out, '<m:t>1</m:t>');
    has(out, '<m:t>2</m:t>');
  });
});
