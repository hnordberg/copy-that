# Math Equation Support — Technical Reference

## Why this exists

When you copy text containing math equations from a webpage and paste it into a
Microsoft Office application (Word, OneNote, PowerPoint), the equations lose
their structure. They arrive as either:

- A flat string of Unicode characters with no subscripts, superscripts, or
  fraction layout.
- A pile of CSS-styled `<span>` elements that Office doesn't understand, so it
  renders them as garbled inline text.

MS Office has its own native equation format called **OMML** (Office Math Markup
Language). If the HTML on the clipboard contains OMML wrapped in the right
conditional comments, Office recognises it and inserts a real editable equation
object — the same kind you get from Insert > Equation.

This extension intercepts the HTML copy path and converts any detected math into
OMML before placing it on the clipboard.

---

## The clipboard format Office expects

When OneNote (or Word) copies an equation to the clipboard, the `text/html`
payload on Windows (CF\_HTML) looks like this:

```
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>
<body>
  Some text
  <!--[if gte msEquation 12]>
    <m:oMath xmlns:m="http://schemas.microsoft.com/office/2004/12/omml">
      ... OMML elements ...
    </m:oMath>
  <![endif]-->
  <![if !msEquation]><span>fallback text</span><![endif]>
  more text
</body>
</html>
```

Key points:

1. **MS Office namespace declarations** on the `<html>` tag
   (`xmlns:o`, `xmlns:m`).
2. **`<!--[if gte msEquation 12]>...<![endif]-->`** — This is an MS Office
   conditional comment. Standard browsers see this as a normal HTML comment and
   ignore it. Office parses the content inside and renders the OMML.
3. **`<![if !msEquation]>...<![endif]>`** — The inverse conditional. Office
   skips this block; standard browsers treat `<![if ...]>` as a bogus comment
   (invisible) but render the `<span>` between the two markers. This serves as
   fallback text for non-Office paste targets.
4. **`xmlns:m` on each `<m:oMath>`** — Because the OMML lives inside an HTML
   comment (which is opaque text to the HTML parser), the XML namespace must be
   self-declared on the root OMML element. Office's parser reads the comment
   content as XML, not as part of the HTML DOM.

### Why we use `document.execCommand('copy')`

The modern `navigator.clipboard.write()` API sanitises HTML before writing it to
the clipboard. Chromium's sanitiser parses the HTML into a DOM and re-serialises
it. This would:

- Mangle the `<![if !msEquation]>` syntax into `<!--[if !msEquation]-->`.
- Potentially strip namespace-prefixed elements if they appear outside comments.

To bypass sanitisation we use the older `document.execCommand('copy')` approach:
we register a `copy` event listener that calls `e.clipboardData.setData('text/html', html)`
with our raw string, then trigger `document.execCommand('copy')`. The
`clipboardData.setData` path writes the bytes to the system clipboard with no
transformation. The `clipboardWrite` permission in the manifest authorises this.

`execCommand` is technically deprecated, but it remains universally supported and
there is no sanitisation-free alternative in the Async Clipboard API yet.

---

## How math is detected — `findMathElements()`

The detection runs against a temporary DOM created from the clicked element's
`innerHTML`. It checks six sources in priority order:

### 1. KaTeX with MathML

```
<span class="katex">
  <span class="katex-mathml">
    <math xmlns="http://www.w3.org/1998/Math/MathML">...</math>
  </span>
  <span class="katex-html" aria-hidden="true">... visual spans ...</span>
</span>
```

KaTeX's default output mode (`htmlAndMathml`) includes a hidden `<math>` element
inside `.katex-mathml`. We extract this and convert it via the MathML → OMML
path.

If the `.katex` element is inside a `[data-math]` container, we replace the
whole container (not just the `.katex` span) so the visual rendering is fully
swapped for OMML.

### 2. MathJax v3

```
<mjx-container class="MathJax" jax="CHTML">
  ... visual rendering ...
  <mjx-assistive-mml>
    <math xmlns="http://www.w3.org/1998/Math/MathML">...</math>
  </mjx-assistive-mml>
</mjx-container>
```

Same idea: we find the `<math>` inside `<mjx-container>` and use the MathML →
OMML converter.

### 3. Native MathML

Bare `<math>` elements not already handled by cases 1 or 2.

### 4. LaTeX source via `data-math` attribute (fallback)

```
<span class="math-inline" data-math="x_t">
  <span class="katex">
    <span class="katex-html" aria-hidden="true">...</span>
  </span>
</span>
```

Some pages use KaTeX with `output: 'html'`, which omits the MathML accessibility
tree entirely. In that case there is no `<math>` element at all. However the
LaTeX source is often available in a `data-math` attribute on the container.

When we find `[data-math]` elements that were not already handled by steps 1–3,
we read the LaTeX string and convert it via the LaTeX → OMML parser.

Block-level equations are detected by the presence of `class="math-block"` or a
`.katex-display` child, and are wrapped in `<m:oMathPara>` (display mode)
instead of plain `<m:oMath>` (inline).

### 5. Wikipedia `.mwe-math-element` containers

Wikipedia wraps each equation in a container like:

```
<span class="mwe-math-element mwe-math-element-inline">
  <span class="mwe-math-mathml-inline mwe-math-mathml-a11y" style="display: none;">
    <math xmlns="http://www.w3.org/1998/Math/MathML">...</math>
  </span>
  <img class="mwe-math-fallback-image-inline"
       alt="{\displaystyle E=mc^{2}}" src="...">
</span>
```

The container has **both** a hidden `<math>` element (for screen-reader
accessibility) and a visible `<img>` fallback (the rendered SVG/PNG). If we
detected these independently, every equation would appear twice in the output.

This pass finds `.mwe-math-element` containers and replaces the **whole
container** as a single unit. It prefers the `<math>` element (MathML → OMML
path, higher fidelity) and falls back to extracting LaTeX from the `<img>` `alt`
attribute if no `<math>` is present. The `alt` text is typically wrapped in
`{\displaystyle ...}`, which `stripDisplayStyle()` removes before parsing.
Display vs inline is determined by `mwe-math-element-block` on the container.

### 6. Standalone Wikipedia math images

A safety-net pass for `img.mwe-math-fallback-image-inline` /
`img.mwe-math-fallback-image-display` elements that are **not** inside a
`.mwe-math-element` container (e.g. other MediaWiki-based wikis with different
markup). Same logic as above: strip `{\displaystyle ...}`, convert via LaTeX →
OMML.

---

## MathML → OMML conversion — `mathMLtoOMML()`

This is a recursive DOM walker (`omNode()`) that maps each MathML element to its
OMML equivalent. The mapping:

| MathML                | OMML                  | Notes                                          |
|-----------------------|-----------------------|------------------------------------------------|
| `<math>`              | `<m:oMath>`           | Top-level wrapper; `display="block"` → `<m:oMathPara>` |
| `<mi>`                | `<m:r>` with style    | Single-char → italic (`m:val="i"`), multi-char or `mathvariant="normal"` → upright (`"p"`) |
| `<mn>`                | `<m:r>`               | Numbers, no style override                     |
| `<mo>`                | `<m:r>`               | Operators, no style override                   |
| `<mtext>`             | `<m:r>` style `"p"`   | Upright text                                   |
| `<msub>`              | `<m:sSub>`            | N-ary operators (∑, ∫, etc.) become `<m:nary>` instead |
| `<msup>`              | `<m:sSup>`            | Same n-ary check                               |
| `<msubsup>`           | `<m:sSubSup>`         | Same n-ary check                               |
| `<mfrac>`             | `<m:f>`               | `<m:num>` and `<m:den>`                        |
| `<msqrt>`             | `<m:rad>` (deg hidden) |                                                |
| `<mroot>`             | `<m:rad>` with `<m:deg>` | Degree is second child                      |
| `<mfenced>`           | `<m:d>`               | Reads `open`, `close`, `separators` attributes |
| `<mrow>` with fences  | `<m:d>`               | Detected when first/last child `<mo>` has `fence="true"` or matched pair in `FENCE_PAIRS` |
| `<mover>` accent      | `<m:acc>`             | When `accent="true"` or overscript is a known combining char |
| `<mover>` overline    | `<m:bar>` pos `"top"` | When overscript is ¯, ‾, or ◌̅                  |
| `<mover>` general     | `<m:limUpp>`          | Upper limit                                    |
| `<munder>` n-ary      | `<m:nary>` undOvr     | When base is a big operator                    |
| `<munder>` underline  | `<m:bar>` pos `"bot"` |                                                |
| `<munder>` general    | `<m:limLow>`          | Lower limit                                    |
| `<munderover>` n-ary  | `<m:nary>` undOvr     | With both sub and sup                          |
| `<munderover>` general| nested limLow/limUpp  |                                                |
| `<mtable>`/`<mtr>`/`<mtd>` | `<m:m>`/`<m:mr>`/`<m:e>` | Matrix                              |
| `<semantics>`         | first child only      | Skips `<annotation>` children                  |
| `<mpadded>`, `<mstyle>` | passthrough         | Just process children                          |
| `<mphantom>`, `<mspace>`, `<annotation>` | empty | Invisible or metadata — skipped        |

---

## LaTeX → OMML conversion — `latexToOMML()`

A recursive-descent parser that tokenises the LaTeX string and emits OMML
directly (without an intermediate MathML step).

### What it handles

| LaTeX construct                      | OMML output         |
|--------------------------------------|---------------------|
| Single letter (`x`, `y`)            | `<m:r>` italic      |
| Digits (`42`, `3.14`)               | `<m:r>` plain       |
| Greek (`\sigma`, `\alpha`)           | `<m:r>` italic, Unicode char from `GREEK` map |
| Symbols (`\cdot`, `\infty`, etc.)    | `<m:r>` with Unicode char from `SYMS` map |
| Subscript (`x_t`, `x_{n+1}`)        | `<m:sSub>`          |
| Superscript (`x^2`, `e^{i\pi}`)     | `<m:sSup>`          |
| Both (`x_i^2`)                       | `<m:sSubSup>`       |
| `\frac{a}{b}`                        | `<m:f>`             |
| `\sqrt{x}`, `\sqrt[3]{x}`           | `<m:rad>`           |
| `\text{...}`, `\mathrm{...}`, etc.  | `<m:r>` upright     |
| `\hat{x}`, `\vec{v}`, `\dot{q}`     | `<m:acc>`           |
| `\overline{x}`, `\underline{x}`     | `<m:bar>`           |
| `\sum_{}^{}`, `\int`, `\prod`       | `<m:nary>`          |
| `\left( ... \right)`                | `<m:d>`             |
| `\begin{pmatrix}...\end{pmatrix}`   | `<m:m>` + `<m:d>`   |
| `\begin{cases}...\end{cases}`       | `<m:m>` + `<m:d>` with `{` |

### Parser structure

The parser is a closure inside `latexToOMML()` that captures `src` (the LaTeX
string) and `pos` (the read cursor). Key internal functions:

- **`parseExpr(terminator)`** — The main loop. Reads atoms until it hits the
  `terminator` character (e.g. `}`, `]`, or empty string for end-of-input).
  After each atom, checks for trailing `_` / `^` to attach sub/superscripts.
- **`handleCmd(cmd)`** — Dispatches a `\command` name. Checks the Greek, symbol,
  n-ary, fraction, sqrt, text, accent, delimiter, and environment tables in
  order. Falls back to emitting the command name as upright text.
- **`readGroup()`** — Skips whitespace, reads `{...}` and returns the parsed
  OMML inside. The whitespace skip is important because LaTeX (and Wikipedia's
  alt text in particular) allows spaces between commands and their arguments,
  e.g. `\frac {t}{r^{k}}`.
- **`readRawGroup()`** — Same whitespace skip, reads `{...}` and returns the raw
  string (used for `\text{}` where we want literal characters, not parsed math).
- **`readToken()`** — Reads a single token: a group, a command, a letter, a
  number, or a single character.
- **`parseEnv(env)`** — Handles `\begin{env}...\end{env}`. Splits on `\\` for
  rows and `&` for cells, recursively parsing each cell. Wraps in `<m:m>` and
  optional delimiters depending on the environment name.
- **`readDelimCh()`** — Reads a delimiter character after `\left` or `\right`.
  Handles `\{`, `\}`, `\|`, named delimiters like `\langle`, and `.` for
  invisible delimiters.

### Limitations / known gaps

- **No `\underbrace` / `\overbrace`** — These have no direct OMML equivalent.
  They would need to be approximated with grouping + accent, or simply emitted
  as text.
- **No colour commands** — `\color{red}{x}` is silently ignored; the content
  renders but without colour.
- **No `\phantom`** — Invisible spacers are dropped.
- **`\left...\right` close delimiter** — After `\right` is consumed inside
  `parseExpr`, the closing character is read but the `omDelim` call from the
  `\left` handler currently defaults to `)` if it can't recover the close char.
  This works for the common `\left(...\right)` case but may produce a stray `)`
  for unusual delimiter pairs.
- **Alignment environments** — `align`, `aligned`, `gather`, `equation` etc.
  are not supported. They would need multi-equation handling that OMML doesn't
  directly model.
- **Display style** — `\displaystyle`, `\textstyle`, `\scriptstyle`, and
  `\scriptscriptstyle` are treated as no-ops. The display vs inline distinction
  comes from the container's context (CSS class or element type), not from LaTeX
  commands. The `{\displaystyle ...}` wrapper used by Wikipedia's `alt` text is
  stripped during detection by `stripDisplayStyle()` before parsing.

---

## File structure

```
mathml-to-omml.js    The converter library (IIFE → window.CopyThatMath)
content.js           Content script — UI, detection, clipboard write
background.js        Injects [mathml-to-omml.js, content.js] in order
manifest.json        MV3 manifest with clipboardWrite permission
```

`background.js` injects both files via `chrome.scripting.executeScript({ files: [...] })`.
They execute sequentially in the page's main world — `mathml-to-omml.js` sets
`window.CopyThatMath`, then `content.js` destructures the API from it.

---

## Adding support for new math sources

To handle a new rendering library (e.g. Temml, or a custom renderer):

1. **In `findMathElements()`**, add a new `querySelectorAll` pass before the
   `[data-math]` fallback. Check for the library's container element, extract
   the `<math>` element (if it includes MathML) or the LaTeX source string.
2. Push a result with either `{ mathml: <math element> }` (to use the MathML
   converter) or `{ latex: "..." }` (to use the LaTeX parser).
3. Call `mark()` on both the found element and its `[data-math]` ancestor (if
   any) so the later passes don't double-process it.

To handle new LaTeX commands:

1. **Simple symbols** — Add to the `SYMS` map (command name → Unicode char).
2. **Greek letters** — Add to the `GREEK` map.
3. **N-ary operators** — Add to `NARY_LATEX` (command name → Unicode char).
4. **Accents** — Add to `ACCENT_LATEX` (command name → combining Unicode char).
5. **Structural commands** (like `\frac`) — Add a new `if` branch in
   `handleCmd()` that reads the appropriate arguments and returns the OMML
   string using the builder helpers.

---

## Debugging tips

- Open the browser console on the page where you're testing. The extension logs
  `"Math detected, converted to MS Equation (OMML) format."` when conversion
  fires, or `"OMML conversion failed, using raw HTML:"` with the error if it
  threw.
- On Windows, you can inspect what's on the clipboard in PowerShell:
  ```powershell
  Get-Clipboard -Format Text -TextFormatType Html -Raw
  ```
  This shows the CF\_HTML payload including the `<!--[if gte msEquation 12]>`
  conditional comment with the OMML inside.
- To test just the OMML output without pasting, you can call the converter
  directly in the browser console after the extension is injected:
  ```javascript
  window.CopyThatMath.latexToOMML("\\frac{1}{2}")
  window.CopyThatMath.latexToOMML("\\sigma(W \\cdot [h_{t-1}, x_t] + b)")
  ```
