# Copy That

A Firefox / Chrome extension that allows you to copy text or HTML from any element on a webpage by clicking on it.

## Features

- **Element Selection**: Click the extension icon to activate, then hover over any element to see it highlighted
- **Plain Text Copy**: Click an element to copy its `innerText` (plain text content)
- **HTML Copy Mode**: Hold `Shift` while clicking to copy the element's `innerHTML` as rich HTML (with plain text fallback)
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
2. Click the "Copy That (V2)" extension icon in your browser toolbar
3. Hover over elements on the page to see them highlighted
4. Click an element to copy its text content
   - **Normal click**: Copies plain text (`innerText`)
   - **Shift + Click**: Copies HTML content (`innerHTML`) with formatting preserved
5. Press `Escape` to exit selection mode

## Requirements

- Firefox browser (or compatible Chromium-based browser that still uses V2 extensions)
- Manifest V2 support (Note: This extension uses Manifest V2)

## Permissions

- `activeTab`: Required to inject the content script into the current tab
- `clipboardWrite`: Required to write text to the clipboard

## Technical Details

- **Manifest Version**: 2
- **Content Script**: Injected on-demand when the extension icon is clicked
- **Background Script**: Handles extension icon clicks and script injection
- **Clipboard API**: Uses the modern `navigator.clipboard` API for copying text

## Browser Compatibility

This extension is designed for Chrome and other Chromium-based browsers that support Manifest V2. Note that Manifest V2 is being phased out in favor of Manifest V3, so this extension may need to be updated in the future.

## License

This project is open source and available for use.

## Author

Henrik Nordberg | https://hnordberg.github.io


