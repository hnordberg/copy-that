(function () {
  const checkbox = document.getElementById('fix-single-char-equations');

  chrome.storage.local.get({ fixSingleCharEquations: false }, (st) => {
    checkbox.checked = !!st.fixSingleCharEquations;
  });

  checkbox.addEventListener('change', () => {
    chrome.storage.local.set({ fixSingleCharEquations: checkbox.checked });
  });

  async function activate(mode) {
    await chrome.storage.local.set({
      copyMode: mode,
      fixSingleCharEquations: checkbox.checked
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

  document.getElementById('copy-html').addEventListener('click', () => activate('html'));
  document.getElementById('copy-text').addEventListener('click', () => activate('text'));
})();
