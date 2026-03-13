const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const mathCode = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'mathml-to-omml.js'),
  'utf-8'
);
const contentCode = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'content.js'),
  'utf-8'
);

function createHarness(initialHtml = '') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });
  const { window } = dom;
  const { document } = window;
  document.body.innerHTML = initialHtml;

  window.alert = () => {};
  window.getSelection = () => ({
    selectAllChildren() {},
    removeAllRanges() {},
  });

  const storageState = {
    copyMode: 'html',
    mathMode: 'omml',
    fixSingleCharEquations: false,
  };

  window.chrome = {
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...storageState }),
      },
    },
  };

  const originalAdd = document.addEventListener.bind(document);
  const originalRemove = document.removeEventListener.bind(document);
  const copyListeners = new Set();

  document.addEventListener = (type, listener, options) => {
    if (type === 'copy') {
      copyListeners.add(listener);
      return;
    }
    originalAdd(type, listener, options);
  };
  document.removeEventListener = (type, listener, options) => {
    if (type === 'copy') {
      copyListeners.delete(listener);
      return;
    }
    originalRemove(type, listener, options);
  };

  document.execCommand = (cmd) => {
    if (cmd !== 'copy') return false;
    const data = {};
    const event = {
      clipboardData: {
        setData(type, value) {
          data[type] = value;
        },
      },
      preventDefault() {},
    };
    for (const listener of [...copyListeners]) listener(event);
    document.__lastClipboardData = data;
    return true;
  };

  const context = vm.createContext(window);
  vm.runInContext(mathCode, context);

  async function injectContent() {
    vm.runInContext(contentCode, context);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function click(selector) {
    const el = document.querySelector(selector);
    assert.ok(el, `Element not found: ${selector}`);
    el.dispatchEvent(new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }));
  }

  return {
    storageState,
    injectContent,
    click,
    getClipboardData() {
      return document.__lastClipboardData || {};
    },
  };
}

describe('content clipboard output modes', () => {
  it('OMML mode writes both text/html and text/plain', async () => {
    const h = createHarness('<math id="m"><mi>x</mi></math>');
    h.storageState.mathMode = 'omml';
    await h.injectContent();

    h.click('#m');
    const clip = h.getClipboardData();

    assert.equal(typeof clip['text/plain'], 'string');
    assert.equal(typeof clip['text/html'], 'string');
    assert.match(clip['text/html'], /msEquation|xmlns:m=/);
  });

  it('LaTeX mode writes only text/plain', async () => {
    const h = createHarness('<math id="m"><mi>x</mi></math>');
    h.storageState.mathMode = 'latex';
    await h.injectContent();

    h.click('#m');
    const clip = h.getClipboardData();

    assert.equal(typeof clip['text/plain'], 'string');
    assert.equal(clip['text/html'], undefined);
    assert.match(clip['text/plain'], /\\\(x\\\)/);
  });

  it('MathML mode writes only text/plain', async () => {
    const h = createHarness('<math id="m"><mi>x</mi></math>');
    h.storageState.mathMode = 'mathml';
    await h.injectContent();

    h.click('#m');
    const clip = h.getClipboardData();

    assert.equal(typeof clip['text/plain'], 'string');
    assert.equal(clip['text/html'], undefined);
    assert.match(clip['text/plain'], /<math[^>]*>/);
    assert.match(clip['text/plain'], /<\/math>/);
  });

  it('Unicode mode writes only text/plain', async () => {
    const h = createHarness('<img id="m" alt="\\alpha + \\beta = \\gamma" />');
    h.storageState.mathMode = 'unicode';
    await h.injectContent();

    h.click('#m');
    const clip = h.getClipboardData();

    assert.equal(typeof clip['text/plain'], 'string');
    assert.equal(clip['text/html'], undefined);
    assert.match(clip['text/plain'], /α \+ β = γ/);
  });

  it('LaTeX text output never leaks math placeholders', async () => {
    const h = createHarness(
      '<div id="box"><math><mi>x</mi></math><span>+</span><math><mi>y</mi></math></div>'
    );
    h.storageState.mathMode = 'latex';
    await h.injectContent();

    h.click('#box');
    const clip = h.getClipboardData();

    assert.equal(typeof clip['text/plain'], 'string');
    assert.doesNotMatch(clip['text/plain'], /___MATH_PH_\d+___/);
    assert.match(clip['text/plain'], /\\\(x\\\)/);
    assert.match(clip['text/plain'], /\\\(y\\\)/);
  });

  it('MathML text output never leaks math placeholders', async () => {
    const h = createHarness(
      '<div id="box"><math><mi>x</mi></math><span>+</span><math><mi>y</mi></math></div>'
    );
    h.storageState.mathMode = 'mathml';
    await h.injectContent();

    h.click('#box');
    const clip = h.getClipboardData();

    assert.equal(typeof clip['text/plain'], 'string');
    assert.doesNotMatch(clip['text/plain'], /___MATH_PH_\d+___/);
    assert.match(clip['text/plain'], /<math[^>]*>/);
  });

  it('Unicode text output never leaks math placeholders', async () => {
    const h = createHarness(
      '<div id="box"><math><mi>α</mi></math><span>+</span><math><mi>β</mi></math></div>'
    );
    h.storageState.mathMode = 'unicode';
    await h.injectContent();

    h.click('#box');
    const clip = h.getClipboardData();

    assert.equal(typeof clip['text/plain'], 'string');
    assert.doesNotMatch(clip['text/plain'], /___MATH_PH_\d+___/);
    assert.match(clip['text/plain'], /α/);
    assert.match(clip['text/plain'], /β/);
  });

  it('re-injection while active applies updated math mode', async () => {
    const h = createHarness('<math id="m"><mi>x</mi></math>');

    h.storageState.mathMode = 'omml';
    await h.injectContent();

    // Re-inject with new settings before any click.
    h.storageState.mathMode = 'latex';
    await h.injectContent();

    h.click('#m');
    const clip = h.getClipboardData();

    assert.equal(typeof clip['text/plain'], 'string');
    assert.equal(clip['text/html'], undefined);
  });
});
