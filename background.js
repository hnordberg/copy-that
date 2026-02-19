// Listen for clicks on the extension's toolbar icon (action in MV3)
chrome.action.onClicked.addListener(async (tab) => {
  // Ensure the tab has a URL and is not a chrome:// page etc.
  if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
    try {
      // Inject the content script using the MV3 API: chrome.scripting.executeScript
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['mathml-to-omml.js', 'content.js']
      });
      console.log("Copy That script injected.");
    } catch (err) {
      console.error("Failed to inject script:", err.message);
    }
  } else {
    console.log("Cannot inject script into this page (e.g., chrome:// pages).");
  }
});
