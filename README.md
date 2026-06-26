# SheynEQ

SheynEQ is a Chrome Manifest V3 extension built with React, TypeScript, Vite, and the Web Audio API.

## Privacy

- No telemetry
- No analytics
- No user tracking
- No remote code execution
- No `eval`
- No `Function` constructor

All settings are stored locally with `chrome.storage.local`.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

Load the generated `dist` directory in Chrome at `chrome://extensions` with Developer Mode enabled.

## First Alpha Usage

1. Build with `npm run build`.
2. Load `dist` as an unpacked extension.
3. Open a page with an HTML5 `<audio>` or `<video>` element.
4. Press play, open SheynEQ, enable processing, then adjust EQ/effects.

For a local development target, open `public/demo.html` in Chrome. If using a `file://` URL, enable "Allow access to file URLs" for SheynEQ in `chrome://extensions`.
