# Copy That

A Firefox / Chrome extension that allows you to copy text or HTML from any element on a webpage by clicking on it.

## Features

- **Element Selection**: Click the extension icon to activate, then hover over any element to see it highlighted
- **Plain Text Copy**: Choose "Copy Text" in the popup, then click an element to copy its `innerText` (plain text content)
- **HTML Copy**: Choose "Copy HTML" in the popup, then click an element to copy its `innerHTML` as rich HTML (with plain text fallback)
- **Math Output Modes**: Math equations (MathML, KaTeX, MathJax, Wikipedia) can be copied as MS Office Math Objects (OMML) or LaTeX plain text.
- **Visual Feedback**: 
  - Outline on hover while selecting an element
  - Dialog to choose **HTML** or **Text** before copying
  - Green outline after successful copy
- **Keyboard Support**: Press `Escape` to cancel selection mode

## Installation

### From Source

1. Clone or download this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" (or "This Nightly" for Nightly builds)
4. Click "Load Temporary Add-on..."
5. Select the `manifest.json` file from the extension directory

## Usage

1. Navigate to any webpage
2. Click the "Copy That" extension icon in your browser toolbar
3. Hover over elements on the page to see them highlighted
4. In the popup, choose **Copy HTML** or **Copy Text**, choose **Math mode** (**Office Math Objects** or **LaTeX**), then click **Copy**
5. Click an element on the page to copy its content (HTML or plain text, depending on your choice)
6. Press `Escape` to exit selection mode

## Requirements

- Firefox, Chrome, Edge, etc. browser

## Technical Details

- **Manifest Version**: 3
- **Content Script**: Injected when the user chooses "Copy HTML" or "Copy Text" in the popup
- **Background Script**: Handles extension icon and popup; script injection is triggered from the popup
- **Clipboard API**: Uses `clipboardData.setData` for HTML copy (to preserve OMML markup) and `navigator.clipboard` for plain text
- **Math detection**: Detects MathML from KaTeX (`.katex-mathml`), MathJax v3 (`mjx-container`), native `<math>` elements, and Wikipedia math images (`img.mwe-math-fallback-image-*`)
- **Office Math mode**: Converts detected math to Office Math Markup Language wrapped in `<!--[if gte msEquation 12]>` conditional comments
- **LaTeX mode**: Converts detected math to LaTeX (or reuses source LaTeX when available) and writes `text/plain` clipboard data
- **OneNote Graph API**: There is a bug in the OneNote Graph API that causes single-character equations to be rendered as plain text. This is fixed by the `fixSingleCharEquations` option. This has been [reported](https://feedbackportal.microsoft.com/feedback/idea/241e8184-ae0e-f111-83da-7c1e52ac2057) to Microsoft.
## Browser Compatibility

This extension is designed for Firefox, Chrome and other Chromium-based browsers that support Manifest V3.

## License

MIT License

## Author

Henrik Nordberg | https://hnordberg.github.io


