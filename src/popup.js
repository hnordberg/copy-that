(function () {
  const fixSingleCharCheckbox = document.getElementById('fix-single-char-equations');
  const copyHtmlRadio = document.getElementById('copy-html');
  const copyTextRadio = document.getElementById('copy-text');

  chrome.storage.local.get(
    { fixSingleCharEquations: false, copyMode: 'text' },
    (st) => {
      fixSingleCharCheckbox.checked = !!st.fixSingleCharEquations;
      const isHtml = st.copyMode === 'html';
      copyHtmlRadio.checked = isHtml;
      copyTextRadio.checked = !isHtml;
    }
  );

  fixSingleCharCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ fixSingleCharEquations: fixSingleCharCheckbox.checked });
  });

  async function activate(mode) {
    await chrome.storage.local.set({
      copyMode: mode,
      fixSingleCharEquations: fixSingleCharCheckbox.checked
    });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['mathml-to-omml.js', 'content.js']
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
