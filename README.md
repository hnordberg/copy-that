# Copy That

A Firefox / Chrome extension that allows you to copy text or HTML from any element on a webpage by clicking on it.

## Features

- **Element Selection**: Click the extension icon to activate, then hover over any element to see it highlighted
- **Plain Text Copy**: Click an element to copy its `innerText` (plain text content)
- **HTML Copy Mode**: Hold `Shift` while clicking to copy the element's `innerHTML` as rich HTML (with plain text fallback)
- **MS Equation Support**: Math equations (MathML, KaTeX, MathJax, Wikipedia) are automatically converted to MS Office Math (OMML) format for native rendering in Word, OneNote, and PowerPoint. This solves the problem of copying contents with equations from a webpage to a word document and other office applications.
- **Visual Feedback**: 
  - Red outline for normal mode
  - Blue outline for HTML mode (Shift held)
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
4. Click an element to copy its text content
   - **Normal click**: Copies plain text (`innerText`)
   - **Shift + Click**: Copies HTML content (`innerHTML`) with formatting preserved
5. Press `Escape` to exit selection mode

## Requirements

- Firefox, Chrome, Edge, etc. browser

## Technical Details

- **Manifest Version**: 3
- **Content Script**: Injected on-demand when the extension icon is clicked
- **Background Script**: Handles extension icon clicks and script injection
- **Clipboard API**: Uses `clipboardData.setData` in HTML mode (to preserve OMML markup) and `navigator.clipboard` for plain text
- **MS Equation (OMML)**: Detects MathML from KaTeX (`.katex-mathml`), MathJax v3 (`mjx-container`), native `<math>` elements, and Wikipedia math images (`img.mwe-math-fallback-image-*`), converting them to Office Math Markup Language wrapped in `<!--[if gte msEquation 12]>` conditional comments

## Browser Compatibility

This extension is designed for Firefox, Chrome and other Chromium-based browsers that support Manifest V3.

## License

MIT License

## Author

Henrik Nordberg | https://hnordberg.github.io


