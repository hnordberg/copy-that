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
        const htmlToCopy = targetElement.innerHTML;
        const textFallback = targetElement.innerText; // Fallback plain text

        if (htmlToCopy) {
          try {
            const htmlBlob = new Blob([htmlToCopy], { type: 'text/html' });
            const textBlob = new Blob([textFallback], { type: 'text/plain' });
            const item = new ClipboardItem({
              'text/html': htmlBlob,
              'text/plain': textBlob
            });

            navigator.clipboard.write([item])
              .then(() => {
                console.log('innerHTML (as HTML, with text fallback) copied to clipboard. HTML snippet:', htmlToCopy.substring(0, 100) + (htmlToCopy.length > 100 ? '...' : ''));
                targetElement.style.cssText += successStyle;
                setTimeout(() => {
                  if (targetElement) {
                    targetElement.style.outline = '';
                  }
                }, 2000);
              })
              .catch(err => {
                console.error('Failed to copy as rich text: ', err);
                alert("Failed to copy as rich text. See console for details.");
              })
              .finally(() => {
                cleanup();
              });
          } catch (error) {
            console.error("Error creating ClipboardItem: ", error);
            alert("Failed to prepare HTML for clipboard. See console.");
            cleanup();
          }
        } else {
          console.log("Clicked element has no innerHTML to copy for rich text.");
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