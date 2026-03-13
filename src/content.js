(async () => {
    // Prevent running multiple instances if injected multiple times accidentally
    if (window.elementTextCopierActive) {
      if (typeof window.elementTextCopierCleanup === 'function') {
        window.elementTextCopierCleanup();
      } else {
        console.log("Copy That is already active. Click an element or press Esc.");
        return;
      }
    }
    const {
      copyMode: stored,
      fixSingleCharEquations,
      mathMode: storedMathMode
    } = await chrome.storage.local.get({
      copyMode: 'text',
      fixSingleCharEquations: false,
      mathMode: 'omml'
    });
    const copyMode = stored === 'html' ? 'html' : 'text';
    const mathMode = ['omml', 'latex', 'mathml', 'unicode'].includes(storedMathMode)
      ? storedMathMode
      : 'omml';
    const usePlainCharForSingleEquation = !!fixSingleCharEquations;
    window.elementTextCopierActive = true;
    console.log("Copy That activated (" + copyMode + ", math: " + mathMode + "). Hover and click an element to copy.");
  
    let lastHighlightedElement = null;
    const highlightStyle = 'outline: 2px solid red; cursor: pointer;';
    const successStyle = 'outline: 2px solid limegreen;'; // Style after sending copy request
  
    const { escXml, mathMLtoOMML, mathMLtoLaTeX, latexToOMML, findMathElements, buildMsOfficeHtml,
            stripInvisible, mathText, stripDisplayStyle } = window.CopyThatMath;

    function wrapEquation(omml, fallbackText) {
      return `<!--[if gte msEquation 12]>${omml}<![endif]-->` +
        `<![if !msEquation]><span>${escXml(fallbackText)}</span><![endif]>`;
    }

    // When option is on, single-char equations become plain text to avoid OneNote/Graph API <br /> bug
    function equationOrPlainChar(omml, fallbackText) {
      if (usePlainCharForSingleEquation && fallbackText.length === 1) {
        return escXml(fallbackText);
      }
      return wrapEquation(omml, fallbackText);
    }

    function wrapLatex(tex, display) {
      return display ? `\\[${tex}\\]` : `\\(${tex}\\)`;
    }

    function mathMLAsText(mathEl) {
      if (!mathEl) return '';
      let xml = new XMLSerializer().serializeToString(mathEl);
      if (xml.startsWith('<math') && !/\sxmlns=/.test(xml)) {
        xml = xml.replace('<math', '<math xmlns="http://www.w3.org/1998/Math/MathML"');
      }
      return stripInvisible(xml);
    }

    function latexToUnicode(tex) {
      if (!tex) return '';
      let out = stripDisplayStyle(tex);
      const cmdMap = {
        alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε',
        zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ',
        lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ',
        sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ',
        psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ',
        Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
        Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
        cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓',
        leq: '≤', geq: '≥', neq: '≠', approx: '≈', equiv: '≡',
        infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏',
        int: '∫', iint: '∬', iiint: '∭', oint: '∮', to: '→',
        leftarrow: '←', rightarrow: '→', Leftarrow: '⇐', Rightarrow: '⇒',
        Leftrightarrow: '⇔', ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
      };
      out = out.replace(/\\([a-zA-Z]+)/g, (_, c) => cmdMap[c] || c);
      out = out.replace(/\\([{}[\]()])/g, '$1');
      out = out.replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\!/g, '').replace(/\\:/g, ' ');
      out = out.replace(/[{}]/g, '');
      out = out.replace(/\s+/g, ' ').trim();
      return out;
    }

    function htmlFragmentToText(html) {
      const doc = new DOMParser().parseFromString(html || '', 'text/html');
      return doc.body.textContent || '';
    }

    // --- Event Handlers ---
  
    function handleMouseOver(event) {
      // Remove highlight from the previously hovered element
      if (lastHighlightedElement && lastHighlightedElement !== event.target) {
        lastHighlightedElement.style.outline = ''; // Reset specific style
        lastHighlightedElement.style.cursor = '';
      }
      // Apply highlight to the current element
      event.target.style.cssText += highlightStyle;
      lastHighlightedElement = event.target;
    }
  
    function handleMouseOut(event) {
      // Remove highlight if leaving the element
      if (event.target === lastHighlightedElement) {
         event.target.style.outline = '';
         event.target.style.cursor = '';
         lastHighlightedElement = null;
      }
    }
  
    function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();
  
      let targetElement = event.target;
      const isHtmlMode = copyMode === 'html';

      // If clicked inside a math container's visual rendering, walk up so
      // the full equation is captured and findMathElements can detect it.
      const mathAncestor = targetElement.closest(
        'mjx-container, .katex, math, .mwe-math-element');
      if (mathAncestor) targetElement = mathAncestor;
      // KaTeX HTML-only (no .katex-mathml) keeps LaTeX in a [data-math] ancestor.
      // Use that element as the copy root so findMathElements sees the attribute.
      if (isHtmlMode && targetElement.closest) {
        const dataMathEl = targetElement.closest('[data-math]');
        if (dataMathEl) targetElement = dataMathEl;
      }

      // Void/empty elements (img, br, hr, input…) have no innerHTML.
      // If the element carries math in an attribute (e.g. img alt with LaTeX),
      // use that directly. Otherwise walk up to the nearest ancestor with content.
      let altMathTex = null;
      if (!targetElement.innerHTML) {
        const alt = (targetElement.getAttribute('alt') || '').trim();
        if (isHtmlMode && alt && /\\[a-zA-Z]/.test(alt)) {
          altMathTex = alt;
        } else {
          while (targetElement && !targetElement.innerHTML) {
            targetElement = targetElement.parentElement;
          }
          if (!targetElement) targetElement = event.target;
        }
      }

      if (isHtmlMode) {
        const useLatexMath = mathMode === 'latex';
        const useMathMlMath = mathMode === 'mathml';
        const useUnicodeMath = mathMode === 'unicode';
        const usePlainMath = useLatexMath || useMathMlMath || useUnicodeMath;
        const plainModeName = useLatexMath ? 'LaTeX' : (useMathMlMath ? 'MathML' : 'Unicode');
        let textFallback = targetElement.innerText;
        // Use outerHTML when root has data-math so the parsed fragment contains
        // that element and findMathElements can find it (KaTeX HTML-only mode).
        const copyRootHtml = (targetElement.hasAttribute && targetElement.hasAttribute('data-math'))
          ? targetElement.outerHTML : targetElement.innerHTML;
        let htmlToCopy = altMathTex ? '' : copyRootHtml;
        let mathHandled = false;

        if (altMathTex) {
          try {
            const tex = stripDisplayStyle(altMathTex);
            const eq = useLatexMath
              ? escXml(wrapLatex(tex, true))
              : useMathMlMath
                ? escXml(tex)
                : useUnicodeMath
                  ? escXml(latexToUnicode(tex))
                : equationOrPlainChar(latexToOMML(tex, true), tex);
            htmlToCopy = usePlainMath ? '' : buildMsOfficeHtml(stripInvisible(eq));
            textFallback = useLatexMath ? wrapLatex(tex, true)
              : useMathMlMath ? tex
              : useUnicodeMath ? latexToUnicode(tex)
              : tex;
            mathHandled = true;
            console.log(
              usePlainMath
                ? `Math from element attribute, converted to ${plainModeName} format.`
                : 'Math from element attribute, converted to MS Equation (OMML) format.'
            );
          } catch (e) {
            console.warn(
              usePlainMath
                ? `${plainModeName} from alt attribute failed:`
                : 'OMML from alt attribute failed:',
              e
            );
          }
        } else if (targetElement.tagName && targetElement.tagName.toLowerCase() === 'math') {
          try {
            const latex = mathMLtoLaTeX(targetElement);
            const mathml = mathMLAsText(targetElement);
            const unicode = mathText(targetElement);
            const text = latex || unicode;
            const isBlock = targetElement.getAttribute('display') === 'block';
            const eq = useLatexMath
              ? escXml(wrapLatex(latex, isBlock))
              : useMathMlMath
                ? escXml(mathml)
                : useUnicodeMath
                  ? escXml(unicode)
                : equationOrPlainChar(mathMLtoOMML(targetElement), text);
            htmlToCopy = usePlainMath ? '' : buildMsOfficeHtml(
              stripInvisible(isBlock ? `<br>${eq}<br>` : ` ${eq} `)
            );
            textFallback = useLatexMath ? wrapLatex(latex, isBlock)
              : useMathMlMath ? mathml
              : useUnicodeMath ? unicode
              : text;
            mathHandled = true;
            console.log(
              usePlainMath
                ? `Native MathML element, converted to ${plainModeName} format.`
                : 'Native MathML element, converted to MS Equation (OMML) format.'
            );
          } catch (e) {
            console.warn(
              usePlainMath
                ? `${plainModeName} from MathML element failed:`
                : 'OMML from MathML element failed:',
              e
            );
          }
        }

        if (!mathHandled) try {
          const tc = new DOMParser().parseFromString(htmlToCopy, 'text/html').body;
          const mathItems = findMathElements(tc);
          if (mathItems.length > 0) {
            const reps = [];
            mathItems.forEach((item, i) => {
              const ph = `___MATH_PH_${i}___`;
              const isBlock = item.display ||
                (item.mathml && item.mathml.getAttribute('display') === 'block');
              const latex = item.mathml ? mathMLtoLaTeX(item.mathml) : stripDisplayStyle(item.latex || '');
              const mathml = item.mathml ? mathMLAsText(item.mathml) : '';
              const unicode = item.mathml ? mathText(item.mathml) : latexToUnicode(item.latex || '');
              const text = latex || (item.mathml ? mathText(item.mathml) : (item.latex || ''));
              const plainMath = useLatexMath
                ? wrapLatex(latex, !!isBlock)
                : useMathMlMath
                  ? (mathml || (item.latex || ''))
                  : useUnicodeMath
                    ? unicode
                  : '';
              const html = usePlainMath
                ? escXml(plainMath)
                : equationOrPlainChar(
                  item.mathml ? mathMLtoOMML(item.mathml) : latexToOMML(latex, item.display),
                  text
                );
              reps.push({ ph, html, display: !!isBlock });
              item.element.parentNode.replaceChild(document.createTextNode(ph), item.element);
            });
            let body = tc.innerHTML;
            for (const { ph, html, display } of reps) {
              body = body.split(ph).join(display ? `<br>${html}<br>` : ` ${html} `);
            }
            body = stripInvisible(body);
            htmlToCopy = usePlainMath ? '' : buildMsOfficeHtml(body);
            if (usePlainMath) {
              const textBody = body.replace(/___MATH_PH_\d+___/g, '');
              textFallback = htmlFragmentToText(textBody) || textFallback;
            }
            console.log(
              usePlainMath
                ? `Math detected, converted to ${plainModeName} format.`
                : 'Math detected, converted to MS Equation (OMML) format.'
            );
          }
        } catch (e) {
          console.warn(
            usePlainMath
              ? `${plainModeName} conversion failed, using raw HTML:`
              : 'OMML conversion failed, using raw HTML:',
            e
          );
          htmlToCopy = copyRootHtml;
        }

        if (htmlToCopy || usePlainMath) {
          try {
            const sel = window.getSelection();
            const selTarget = targetElement.firstChild ? targetElement : (targetElement.parentElement || targetElement);
            sel.selectAllChildren(selTarget);
            const copyHandler = (e) => {
              e.clipboardData.setData('text/plain', textFallback);
              if (!usePlainMath) {
                e.clipboardData.setData('text/html', htmlToCopy);
              }
              e.preventDefault();
            };
            document.addEventListener('copy', copyHandler);
            // execCommand('copy') + clipboardData.setData bypasses Chromium's HTML
            // sanitiser, which would strip the OMML conditional comments and
            // namespace-prefixed elements. navigator.clipboard.write() cannot do this.
            document.execCommand('copy');
            document.removeEventListener('copy', copyHandler);
            sel.removeAllRanges();
            const payloadPreview = usePlainMath ? textFallback : htmlToCopy;
            const payloadKind = usePlainMath ? 'Plain text' : 'HTML';
            console.log(payloadKind + ' copied to clipboard. First 100 characters:', payloadPreview.substring(0, 100));
            if (targetElement && targetElement.style) {
              targetElement.style.cssText += successStyle;
            }
            setTimeout(() => {
              if (targetElement && targetElement.style) targetElement.style.outline = '';
            }, 2000);
          } catch (error) {
            console.error("Error copying HTML: ", error);
            alert("Failed to copy. See console for details.");
          } finally {
            cleanup();
          }
        } else {
          console.log("Clicked element has no innerHTML to copy.");
          cleanup();
        }
      } else { // Plain text mode
        const textToCopy = targetElement.innerText;
        if (textToCopy) {
          navigator.clipboard.writeText(textToCopy)
            .then(() => {
              console.log('innerText copied to clipboard. First 100 characters:', textToCopy.substring(0, 100));
              targetElement.style.cssText += successStyle;
              setTimeout(() => {
                if (targetElement) {
                  targetElement.style.outline = '';
                }
              }, 2000);
            })
            .catch(err => {
              console.error('Failed to copy text: ', err);
              alert("Failed to copy text. See console for details.");
            })
            .finally(() => {
              cleanup();
            });
        } else {
          console.log("Clicked element has no innerText to copy.");
          cleanup();
        }
      }
    }

  
     function handleKeyDown(event) {
      if (event.key === 'Escape') {
        console.log("Selection cancelled by Escape key.");
        cleanup();
      }
    }
  
    // --- Cleanup Function ---
  
    function cleanup() {
      // Remove highlight from the last element
      if (lastHighlightedElement) {
        lastHighlightedElement.style.outline = '';
        lastHighlightedElement.style.cursor = '';
      }
      // Remove event listeners
      document.body.removeEventListener('mouseover', handleMouseOver);
      document.body.removeEventListener('mouseout', handleMouseOut);
      document.body.removeEventListener('click', handleClick, true); // Use capture phase
      document.removeEventListener('keydown', handleKeyDown, true); // Use capture phase
  
      window.elementTextCopierActive = false; // Mark as inactive
      window.elementTextCopierCleanup = null;
      console.log("Copy That deactivated.");
    }
  
    // --- Initialization ---
  
    // Add listeners to the body (delegation) and document (keydown)
    // Use capture phase (true) for click/keydown to catch it early
    document.body.addEventListener('mouseover', handleMouseOver);
    document.body.addEventListener('mouseout', handleMouseOut);
    document.body.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.elementTextCopierCleanup = cleanup;
  
  })();
