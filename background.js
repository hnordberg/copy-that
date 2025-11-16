// Listen for clicks on the extension's icon (browser action in V2)
chrome.browserAction.onClicked.addListener(function(tab) {
    // Ensure the tab has a URL and is not a chrome:// page etc.
    if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
      // Inject the content script using the V2 API: chrome.tabs.executeScript
      // Note: The callback is optional but good for checking errors.
      chrome.tabs.executeScript(tab.id, {
        file: 'content.js'
      }, function() {
        if (chrome.runtime.lastError) {
          console.error("Failed to inject script: " + chrome.runtime.lastError.message);
        } else {
          console.log("Copy That (V2) script injected.");
        }
      });
    } else {
       console.log("Cannot inject script into this page (e.g., chrome:// pages).");
    }
  });
  
  // Listen for messages from the content script containing text to copy
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.textToCopy) {
      copyTextToClipboard(request.textToCopy);
      // You could send a response back if needed: sendResponse({ success: true });
    }
    // Return true if you intend to send a response asynchronously (not needed here)
    // return true;
  });
  
  // Function to copy text using the background page's document context
  function copyTextToClipboard(text) {
    // Create a temporary textarea element within the background page's DOM
    var textArea = document.createElement("textarea");
  
    // --- Style to prevent visual disturbance ---
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px'; // Position it off-screen
    textArea.style.left = '-9999px';
    textArea.style.width = '1px'; // Minimize size
    textArea.style.height = '1px';
    textArea.style.opacity = 0; // Make it invisible
    // --- End Style ---
  
    textArea.value = text; // Set its value
    document.body.appendChild(textArea); // Add it to the DOM
    textArea.focus(); // Focus needs to be on the element
    textArea.select(); // Select the text
  
    try {
      var successful = document.execCommand('copy'); // Execute the copy command
      var msg = successful ? 'successful' : 'unsuccessful';
      console.log('Background: Copying text command was ' + msg + '. Text:', text);
    } catch (err) {
      console.error('Background: Oops, unable to copy using execCommand', err);
    }
  
    document.body.removeChild(textArea); // Clean up the temporary element
  }