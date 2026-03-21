# ConsoleKit

> See `console.log` output and runtime errors **directly in your editor**, inline next to your code.

ConsoleKit is a VS Code extension inspired by Console Ninja Pro. It patches your app's `console.*` methods at runtime, sends log data to a local WebSocket server, and displays the values inline in your source files — no more tab-switching.

---

## Features

- **Inline log values** — colored ghost text next to each logged line (green=log, yellow=warn, red=error)
- **Hover tooltips** — hover a decorated line to see full values, timestamps, and stack traces
- **Click to navigate** — click any log entry (if applicable) or use hover to see source location
- **Auto-reconnect** — the runtime automatically reconnects if the extension restarts
- **Auto-start** — starts automatically on VS Code startup

---

## Quick Start

### 1. Add the Runtime to Your App

**Browser / HTML:**
```html
<script src="/path/to/consolekit-runtime.js"></script>
```

**Node.js (CommonJS):**
```js
require('./runtime/consolekit-runtime');
```

**Vite / React / ES Modules — add to top of `main.ts`:**
```ts
import '/path/to/consolekit-runtime.js';
```

> 💡 Run `ConsoleKit: Copy Runtime Script Path` from the Command Palette to copy the full path.

### 2. Start Your Dev Server

ConsoleKit auto-starts its WebSocket server (port `44225`) when VS Code opens. Just run your app — logs will appear inline immediately.

### 3. Write Some Logs

```js
console.log("Hello ConsoleKit!", { user: "world" });
console.warn("This is a warning");
console.error("Something went wrong");
```

Decorations appear inline in your editor next to these lines. ✅

---

## Commands

| Command | Description |
|---|---|
| `ConsoleKit: Start` | Start the WebSocket server |
| `ConsoleKit: Stop` | Stop the server |
| `ConsoleKit: Clear Logs` | Clear all stored logs |
| `ConsoleKit: Copy Runtime Script Path` | Copy path to the runtime JS file |

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `consolekit.port` | `44225` | WebSocket server port |
| `consolekit.enabled` | `true` | Auto-start on launch |
| `consolekit.showInlineValues` | `true` | Show inline ghost text |
| `consolekit.maxInlineLength` | `60` | Max chars for inline display |

---

## How It Works

```
Your App (browser / Node.js)
  └─ consolekit-runtime.js  ← patches console.*
        └─ WebSocket → ws://localhost:44225
                           └─ ConsoleKit Extension
                                 ├─ Inline Decorations
                                 └─ Hover Provider
```

---

## Dev — Running Locally

```bash
cd /path/to/consoleKit
npm install
npm run compile
# Then press F5 in VS Code to open the Extension Development Host
```
