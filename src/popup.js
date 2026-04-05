(function () {
  const fixSingleCharCheckbox = document.getElementById('fix-single-char-equations');
  const copyHtmlRadio = document.getElementById('copy-html');
  const copyTextRadio = document.getElementById('copy-text');
  const startCopyButton = document.getElementById('start-copy');
  const mathOmmlRadio = document.getElementById('math-omml');
  const mathLatexRadio = document.getElementById('math-latex');
  const mathMathmlRadio = document.getElementById('math-mathml');
  const mathUnicodeRadio = document.getElementById('math-unicode');

  chrome.storage.local.get(
    { fixSingleCharEquations: false, copyMode: 'text', mathMode: 'omml' },
    (st) => {
      fixSingleCharCheckbox.checked = !!st.fixSingleCharEquations;
      const isHtml = st.copyMode === 'html';
      copyHtmlRadio.checked = isHtml;
      copyTextRadio.checked = !isHtml;
      const isLatexMath = st.mathMode === 'latex';
      const isMathMlMath = st.mathMode === 'mathml';
      const isUnicodeMath = st.mathMode === 'unicode';
      mathLatexRadio.checked = isLatexMath;
      mathMathmlRadio.checked = isMathMlMath;
      mathUnicodeRadio.checked = isUnicodeMath;
      mathOmmlRadio.checked = !isLatexMath && !isMathMlMath && !isUnicodeMath;
    }
  );

  fixSingleCharCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ fixSingleCharEquations: fixSingleCharCheckbox.checked });
  });

  function selectedMathMode() {
    if (mathLatexRadio.checked) return 'latex';
    if (mathMathmlRadio.checked) return 'mathml';
    if (mathUnicodeRadio.checked) return 'unicode';
    return 'omml';
  }

  function saveMathMode() {
    chrome.storage.local.set({ mathMode: selectedMathMode() });
  }

  async function activate(mode) {
    await chrome.storage.local.set({
      copyMode: mode,
      fixSingleCharEquations: fixSingleCharCheckbox.checked,
      mathMode: selectedMathMode()
    });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['mathml-to-omml.js', 'code-formatting.js', 'content.js']
        });
        window.close();
      } catch (err) {
        console.error('Failed to inject script:', err.message);
        document.getElementById('error').textContent = 'Cannot run on this page.';
        document.getElementById('error').hidden = false;
      }
    } else {
      document.getElementById('error').textContent = 'Cannot run on this page.';
      document.getElementById('error').hidden = false;
    }
  }

  copyHtmlRadio.addEventListener('change', () => {
    if (copyHtmlRadio.checked) activate('html');
  });

  copyTextRadio.addEventListener('change', () => {
    if (copyTextRadio.checked) activate('text');
  });

  startCopyButton.addEventListener('click', () => {
    activate(copyHtmlRadio.checked ? 'html' : 'text');
  });

  mathOmmlRadio.addEventListener('change', () => {
    if (mathOmmlRadio.checked) saveMathMode();
  });

  mathLatexRadio.addEventListener('change', () => {
    if (mathLatexRadio.checked) saveMathMode();
  });

  mathMathmlRadio.addEventListener('change', () => {
    if (mathMathmlRadio.checked) saveMathMode();
  });

  mathUnicodeRadio.addEventListener('change', () => {
    if (mathUnicodeRadio.checked) saveMathMode();
  });

  // Clicking the already-selected option activates with that mode
  copyHtmlRadio.closest('label').addEventListener('click', (e) => {
    if (copyHtmlRadio.checked) {
      e.preventDefault();
      activate('html');
    }
  });
  copyTextRadio.closest('label').addEventListener('click', (e) => {
    if (copyTextRadio.checked) {
      e.preventDefault();
      activate('text');
    }
  });
})();
