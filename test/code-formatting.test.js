const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const codeFormattingCode = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'code-formatting.js'),
  'utf-8'
);

function createWindow(bodyHtml = '') {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>
      code { font-family: monospace; font-size: 14px; color: rgb(200, 200, 200); }
      pre { font-family: monospace; font-size: 14px; display: block; white-space: pre; }
      .hljs-keyword { color: rgb(255, 0, 0); font-weight: bold; }
      .hljs-string { color: rgb(0, 255, 0); }
      .hljs-comment { color: rgb(128, 128, 128); font-style: italic; }
    </style></head><body>${bodyHtml}</body></html>`,
    { url: 'http://localhost', resources: 'usable' }
  );
  const context = vm.createContext(dom.window);
  vm.runInContext(codeFormattingCode, context);
  return { window: dom.window, document: dom.window.document, api: dom.window.CopyThatCode };
}

function parseFragment(doc, html) {
  return new doc.defaultView.DOMParser().parseFromString(html, 'text/html').body;
}

// ── inlineCodeStyles ──────────────────────────────────────────────

describe('inlineCodeStyles', () => {
  it('inlines font-family on <code> elements in the fragment', () => {
    const { document, api } = createWindow(
      '<pre><code id="c">hello</code></pre>'
    );
    const source = document.querySelector('pre');
    const frag = parseFragment(document, source.innerHTML);

    api.inlineCodeStyles(source, frag);

    const code = frag.querySelector('code');
    assert.ok(code.style.fontFamily, 'fontFamily should be set');
    assert.match(code.style.fontFamily, /monospace/);
  });

  it('inlines color on syntax-highlighted child spans', () => {
    const { document, api } = createWindow(
      '<pre><code><span class="hljs-keyword">if</span> x</code></pre>'
    );
    const source = document.querySelector('pre');
    const frag = parseFragment(document, source.innerHTML);

    api.inlineCodeStyles(source, frag);

    const span = frag.querySelector('.hljs-keyword');
    assert.ok(span.style.color, 'color should be set on keyword span');
  });

  it('inlines font-weight on bold keyword spans', () => {
    const { document, api } = createWindow(
      '<pre><code><span class="hljs-keyword">def</span></code></pre>'
    );
    const source = document.querySelector('pre');
    const frag = parseFragment(document, source.innerHTML);

    api.inlineCodeStyles(source, frag);

    const span = frag.querySelector('.hljs-keyword');
    assert.ok(span.style.fontWeight, 'fontWeight should be set');
  });

  it('inlines font-style on italic comment spans', () => {
    const { document, api } = createWindow(
      '<pre><code><span class="hljs-comment"># note</span></code></pre>'
    );
    const source = document.querySelector('pre');
    const frag = parseFragment(document, source.innerHTML);

    api.inlineCodeStyles(source, frag);

    const span = frag.querySelector('.hljs-comment');
    assert.ok(span.style.fontStyle, 'fontStyle should be set');
  });

  it('handles multiple code elements', () => {
    const { document, api } = createWindow(
      '<div><code id="a">one</code> and <code id="b">two</code></div>'
    );
    const source = document.querySelector('div');
    const frag = parseFragment(document, source.innerHTML);

    api.inlineCodeStyles(source, frag);

    const codes = frag.querySelectorAll('code');
    assert.equal(codes.length, 2);
    codes.forEach((c) => {
      assert.ok(c.style.fontFamily, 'each code element should have fontFamily');
    });
  });

  it('does nothing when there are no code/pre elements', () => {
    const { document, api } = createWindow('<div><p>hello</p></div>');
    const source = document.querySelector('div');
    const frag = parseFragment(document, source.innerHTML);

    api.inlineCodeStyles(source, frag);

    const p = frag.querySelector('p');
    assert.equal(p.style.fontFamily, '', 'non-code elements should be untouched');
  });
});

// ── convertCodeToLatex ────────────────────────────────────────────

describe('convertCodeToLatex', () => {
  it('converts <pre> to verbatim environment', () => {
    const { document, api } = createWindow();
    const frag = parseFragment(document, '<pre>x = 1\ny = 2</pre>');

    api.convertCodeToLatex(frag);

    const text = frag.textContent;
    assert.match(text, /\\begin\{verbatim\}/);
    assert.match(text, /\\end\{verbatim\}/);
    assert.match(text, /x = 1/);
    assert.equal(frag.querySelector('pre'), null, '<pre> should be removed');
  });

  it('converts inline <code> to \\texttt{}', () => {
    const { document, api } = createWindow();
    const frag = parseFragment(document, '<p>Use <code>foo()</code> here</p>');

    api.convertCodeToLatex(frag);

    const text = frag.textContent;
    assert.match(text, /\\texttt\{foo\(\)\}/);
    assert.equal(frag.querySelector('code'), null, '<code> should be removed');
  });

  it('escapes LaTeX special characters in inline code', () => {
    const { document, api } = createWindow();
    const frag = parseFragment(document, '<code>a_b & c#d</code>');

    api.convertCodeToLatex(frag);

    const text = frag.textContent;
    assert.match(text, /a\\_b/);
    assert.match(text, /\\&/);
    assert.match(text, /c\\#d/);
  });

  it('handles <pre><code>...</code></pre> without duplicating', () => {
    const { document, api } = createWindow();
    const frag = parseFragment(document,
      '<pre><code>print("hello")</code></pre>'
    );

    api.convertCodeToLatex(frag);

    const text = frag.textContent;
    assert.match(text, /\\begin\{verbatim\}/);
    assert.match(text, /\\end\{verbatim\}/);
    // The <pre> is handled first, removing the nested <code> too,
    // so we should NOT see \texttt
    assert.doesNotMatch(text, /\\texttt/);
  });

  it('does nothing when there are no code/pre elements', () => {
    const { document, api } = createWindow();
    const frag = parseFragment(document, '<p>just text</p>');

    api.convertCodeToLatex(frag);

    assert.equal(frag.textContent.trim(), 'just text');
  });
});
