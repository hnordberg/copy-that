const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCopyThatMath } = require('./setup');

const { api, document } = loadCopyThatMath();
const { mathMLtoLaTeX } = api;

function parseMath(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.querySelector('math');
}

function convert(html) {
  return mathMLtoLaTeX(parseMath(html));
}

describe('mathMLtoLaTeX', () => {
  it('converts simple inline expression', () => {
    const out = convert('<math><mi>x</mi><mo>+</mo><mn>1</mn></math>');
    assert.equal(out, 'x+1');
  });

  it('prefers TeX annotation when available', () => {
    const out = convert(
      '<math><semantics><mrow><mi>x</mi></mrow>' +
      '<annotation encoding="application/x-tex">x^2</annotation></semantics></math>'
    );
    assert.equal(out, 'x^2');
  });

  it('converts fractions and roots', () => {
    const out = convert(
      '<math><mfrac><msqrt><mi>x</mi></msqrt><mroot><mi>y</mi><mn>3</mn></mroot></mfrac></math>'
    );
    assert.equal(out, '\\frac{\\sqrt{x}}{\\sqrt[3]{y}}');
  });

  it('converts subscripts and superscripts', () => {
    const out = convert('<math><msubsup><mi>a</mi><mi>i</mi><mn>2</mn></msubsup></math>');
    assert.equal(out, 'a_{i}^{2}');
  });

  it('converts fenced expressions', () => {
    const out = convert(
      '<math><mrow><mo fence="true">(</mo><mi>x</mi><mo fence="true">)</mo></mrow></math>'
    );
    assert.equal(out, '\\left(x\\right)');
  });

  it('converts summation with under/over limits', () => {
    const out = convert(
      '<math><munderover><mo>∑</mo><mi>i</mi><mi>n</mi></munderover><mi>x</mi></math>'
    );
    assert.equal(out, '\\sum_{i}^{n}x');
  });

  it('converts tables to matrix environment', () => {
    const out = convert(
      '<math><mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr>' +
      '<mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable></math>'
    );
    assert.equal(out, '\\begin{matrix}a & b \\\\ c & d\\end{matrix}');
  });
});
