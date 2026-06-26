# 🎵 SheynEQ

> **A modern Chrome audio enhancer built for people who love music.**

SheynEQ is a Chrome Manifest V3 extension built with **React**, **TypeScript**, **Vite**, and the **Web Audio API**.

This project started because I couldn't find an equalizer that looked good, felt modern, and actually provided the controls I wanted. So I decided to build one myself.

> ⚠️ **Beta**
>
> SheynEQ is currently in active development. Expect bugs, unfinished features, and frequent updates.

---

## ✨ Current Features

- 🎚️ 10-band Equalizer
- 🔊 Bass Boost
- 🌊 Reverb
- 🎵 Slowed + Reverb
- 📈 Live Output Meter
- 💾 Local settings persistence
- 🌙 Dark / Light theme

---

## 🚧 Planned Features

- Nightcore
- Speed Control
- Pitch Control
- Volume Boost
- Smart Bass Protection
- Adaptive Bass Compression
- Visual Audio Pulse
- More audio effects

---

## 🔒 Privacy

SheynEQ is designed to work completely locally.

- No telemetry
- No analytics
- No tracking
- No remote code execution
- No `eval`
- No `Function` constructor

All settings are stored using `chrome.storage.local`.

---

## 🛠 Development

```bash
npm install
npm run dev
```

---

## 📦 Build

```bash
npm run build
```

Load the generated `dist` folder in:

```
chrome://extensions
```

Enable **Developer Mode** → **Load unpacked** → select `dist`.

---

## 🚀 First Launch

1. Build the project.
2. Load `dist` into Chrome.
3. Open a page with HTML5 audio/video.
4. Play music.
5. Open SheynEQ.
6. Enable processing.
7. Enjoy.

---

## ❤️ About

**Made with ❤️ by Sheyn**

**SheynEQ Beta • Made for music lovers**
