// Code formatting utilities for Copy That.
// Inlines computed styles on <code>/<pre> elements (OMML mode) and converts
// them to LaTeX equivalents (LaTeX mode).
window.CopyThatCode = (() => {
  'use strict';

  // Styles to capture from the source page and inline onto code/pre elements.
  // backgroundColor is intentionally omitted — it clashes when the target
  // app uses a different theme (e.g. dark mode in OneNote).
  const CODE_STYLE_PROPS = [
    'fontFamily', 'fontSize', 'color',
    'whiteSpace', 'padding', 'borderRadius', 'display',
  ];

  // Styles to capture from child spans (syntax highlighting).
  const CHILD_STYLE_PROPS = ['color', 'fontWeight', 'fontStyle'];

  /**
   * Read computed styles from a live source element for a code/pre block.
   */
  function getCodeBlockStyles(el) {
    const cs = window.getComputedStyle(el);
    const styles = {};
    for (const prop of CODE_STYLE_PROPS) {
      styles[prop] = cs[prop];
    }
    return styles;
  }

  /**
   * Build a parallel map of child-element styles from a live source element.
   * Captures computed color/fontWeight/fontStyle for every child element
   * (e.g. hljs-keyword spans) so syntax highlighting survives the clipboard.
   *
   * Returns a flat array of style objects, one per element in tree order
   * (matching querySelectorAll('*') on both source and fragment).
   */
  function buildChildStyleList(sourceCodeEl) {
    const children = sourceCodeEl.querySelectorAll('*');
    const list = [];
    children.forEach((child) => {
      const cs = window.getComputedStyle(child);
      const styles = {};
      for (const prop of CHILD_STYLE_PROPS) {
        styles[prop] = cs[prop];
      }
      list.push(styles);
    });
    return list;
  }

  /**
   * Apply inline styles onto a code/pre element in the parsed fragment,
   * plus all of its children (for syntax highlighting colors).
   */
  function applyStylesToFragment(fragCodeEl, blockStyles, childStyleList) {
    for (const prop of CODE_STYLE_PROPS) {
      if (blockStyles[prop]) {
        fragCodeEl.style[prop] = blockStyles[prop];
      }
    }
    const fragChildren = fragCodeEl.querySelectorAll('*');
    fragChildren.forEach((child, i) => {
      const styles = childStyleList[i];
      if (!styles) return;
      for (const prop of CHILD_STYLE_PROPS) {
        if (styles[prop]) {
          child.style[prop] = styles[prop];
        }
      }
    });
  }

  /**
   * High-level: read computed styles from the live source element and
   * apply them as inline styles on the parsed fragment's code/pre elements,
   * including syntax-highlighting styles on child spans.
   *
   * @param {HTMLElement} sourceRoot - live DOM element that was clicked
   * @param {HTMLElement} fragRoot   - DOMParser fragment root (doc.body)
   */
  function inlineCodeStyles(sourceRoot, fragRoot) {
    const sourceEls = sourceRoot.querySelectorAll('code, pre');
    const fragEls = fragRoot.querySelectorAll('code, pre');
    sourceEls.forEach((srcEl, i) => {
      const fragEl = fragEls[i];
      if (!fragEl) return;
      const blockStyles = getCodeBlockStyles(srcEl);
      const childStyles = buildChildStyleList(srcEl);
      applyStylesToFragment(fragEl, blockStyles, childStyles);
    });
  }

  // --- LaTeX conversion for <code> and <pre> elements ---

  function escapeLatex(text) {
    // Escape characters that are special in LaTeX
    return text
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([#$%&_{}~^])/g, '\\$1');
  }

  /**
   * Replace <code> and <pre> elements in a DOM fragment with their
   * LaTeX equivalents, returned as plain text.
   *
   * - Inline <code>  -> \texttt{...}
   * - Block  <pre>   -> \begin{verbatim}...\end{verbatim}
   *
   * Operates on the fragment in-place, replacing elements with text nodes.
   *
   * @param {HTMLElement} fragRoot - DOMParser fragment root (doc.body)
   */
  function convertCodeToLatex(fragRoot) {
    // Handle <pre> first (they may contain <code> children)
    fragRoot.querySelectorAll('pre').forEach((pre) => {
      const text = pre.textContent;
      const latex = '\n\\begin{verbatim}\n' + text + '\n\\end{verbatim}\n';
      pre.replaceWith(document.createTextNode(latex));
    });

    // Remaining <code> elements (inline)
    fragRoot.querySelectorAll('code').forEach((code) => {
      const text = code.textContent;
      const latex = '\\texttt{' + escapeLatex(text) + '}';
      code.replaceWith(document.createTextNode(latex));
    });
  }

  return { inlineCodeStyles, convertCodeToLatex };
})();
