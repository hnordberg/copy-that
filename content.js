(() => {
    // Prevent running multiple instances if injected multiple times accidentally
    if (window.elementTextCopierActive) {
      console.log("Copy That is already active. Click an element or press Esc.");
      return;
    }
    window.elementTextCopierActive = true;
    console.log("Copy That activated. Hover and click an element.");
  
    let lastHighlightedElement = null;
    const highlightStyle = 'outline: 2px solid red; cursor: pointer;';
    const highlightShiftStyle = 'outline: 2px solid blue; cursor: pointer;';
    const successStyle = 'outline: 2px solid limegreen;'; // Style after sending copy request
  
    const { escXml, mathMLtoOMML, latexToOMML, findMathElements, buildMsOfficeHtml } = window.CopyThatMath;

    // --- Event Handlers ---
  
    function handleMouseOver(event) {
      // Remove highlight from the previously hovered element
      if (lastHighlightedElement && lastHighlightedElement !== event.target) {
        lastHighlightedElement.style.outline = ''; // Reset specific style
        lastHighlightedElement.style.cursor = '';
      }
      // Apply highlight to the current element
      event.target.style.cssText += event.shiftKey ? highlightShiftStyle : highlightStyle;
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
      event.preventDefault(); // Stop default click behavior (like following a link)
      event.stopPropagation(); // Stop the click from bubbling up
  
      const targetElement = event.target;
      const isHtmlMode = event.shiftKey;

      if (isHtmlMode) {
        const textFallback = targetElement.innerText;
        let htmlToCopy = targetElement.innerHTML;

        try {
          const tc = document.createElement('div');
          tc.innerHTML = htmlToCopy;
          const mathItems = findMathElements(tc);
          if (mathItems.length > 0) {
            const reps = [];
            mathItems.forEach((item, i) => {
              const ph = `___OMML_PH_${i}___`;
              const omml = item.mathml
                ? mathMLtoOMML(item.mathml)
                : latexToOMML(item.latex, item.display);
              const text = item.mathml ? (item.mathml.textContent || '') : (item.latex || '');
              reps.push({ ph, omml, text });
              item.element.parentNode.replaceChild(document.createTextNode(ph), item.element);
            });
            let body = tc.innerHTML;
            for (const { ph, omml, text } of reps) {
              body = body.replace(ph,
                `<!--[if gte msEquation 12]>${omml}<![endif]-->` +
                `<![if !msEquation]><span>${escXml(text)}</span><![endif]>`);
            }
            htmlToCopy = buildMsOfficeHtml(body);
            console.log('Math detected, converted to MS Equation (OMML) format.');
          }
        } catch (e) {
          console.warn('OMML conversion failed, using raw HTML:', e);
          htmlToCopy = targetElement.innerHTML;
        }

        if (htmlToCopy) {
          try {
            const sel = window.getSelection();
            sel.selectAllChildren(targetElement);
            const copyHandler = (e) => {
              e.clipboardData.setData('text/html', htmlToCopy);
              e.clipboardData.setData('text/plain', textFallback);
              e.preventDefault();
            };
            document.addEventListener('copy', copyHandler);
            document.execCommand('copy');
            document.removeEventListener('copy', copyHandler);
            sel.removeAllRanges();
            console.log('HTML copied to clipboard.');
            targetElement.style.cssText += successStyle;
            setTimeout(() => {
              if (targetElement) targetElement.style.outline = '';
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
              console.log('innerText copied to clipboard:', textToCopy);
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
      console.log("Copy That deactivated.");
    }
  
    // --- Initialization ---
  
    // Add listeners to the body (delegation) and document (keydown)
    // Use capture phase (true) for click/keydown to catch it early
    document.body.addEventListener('mouseover', handleMouseOver);
    document.body.addEventListener('mouseout', handleMouseOut);
    document.body.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
  
  })(); // IIFE