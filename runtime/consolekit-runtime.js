/**
 * ConsoleKit Runtime Injector
 * ───────────────────────────
 * Add this script to your app to send console output to ConsoleKit in VS Code.
 *
 * Browser (HTML):
 *   <script src="/path/to/consolekit-runtime.js"></script>
 *
 * Node.js / CommonJS:
 *   require('./consolekit-runtime');
 *
 * ES Module (Vite, React, etc.) — add to top of main.ts / main.jsx:
 *   import './consolekit-runtime';
 */

(function (global) {
  'use strict';

  const CONSOLEKIT_PORT = 44225;
  const RECONNECT_DELAY = 3000;
  const MAX_DEPTH = 4;

  let ws = null;
  let queue = [];
  let connected = false;

  // ── Serializer ──────────────────────────────────────────────────────────────

  function serialize(value, depth) {
    if (depth === undefined) depth = 0;
    if (depth > MAX_DEPTH) return '"[MaxDepth]"';

    if (value === null) return 'null';
    if (value === undefined) return '"undefined"';

    const type = typeof value;

    if (type === 'string') return JSON.stringify(value);
    if (type === 'number') return isFinite(value) ? String(value) : '"' + String(value) + '"';
    if (type === 'boolean') return String(value);
    if (type === 'function') return '"[Function: ' + (value.name || 'anonymous') + ']"';
    if (type === 'symbol') return '"' + String(value) + '"';
    if (type === 'bigint') return '"' + String(value) + 'n"';

    if (value instanceof Error) {
      return JSON.stringify({ __type: 'Error', name: value.name, message: value.message, stack: value.stack });
    }

    if (Array.isArray(value)) {
      const items = value.slice(0, 50).map(function (v) { return serialize(v, depth + 1); });
      return '[' + items.join(',') + (value.length > 50 ? ',"…"' : '') + ']';
    }

    if (type === 'object') {
      try {
        const keys = Object.keys(value).slice(0, 30);
        const pairs = keys.map(function (k) {
          return JSON.stringify(k) + ':' + serialize(value[k], depth + 1);
        });
        return '{' + pairs.join(',') + (Object.keys(value).length > 30 ? ',"…":"…"' : '') + '}';
      } catch (e) {
        return '"[Object]"';
      }
    }

    try { return JSON.stringify(value); } catch (e) { return '"[Unserializable]"'; }
  }

  function serializeArgs(args) {
    return Array.from(args).map(function (a) {
      try { return JSON.parse(serialize(a)); } catch (e) { return String(a); }
    });
  }

  // ── Stack trace parser ───────────────────────────────────────────────────────

  function getCallerInfo() {
    var err = new Error();
    var stack = (err.stack || '').split('\n');
    // Skip only the "Error" header line. The filter in the loop will handle the rest.
    var frames = stack.slice(1);
    var info = { file: '', line: 0, col: 0, stack: frames.join('\n') };

    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i].trim();
      // Chrome/Node: "    at foo (file.js:10:5)" or "    at file.js:10:5"
      var atMatch = frame.match(/at\s+(?:.+\s+\()?(.+):(\d+):(\d+)\)?/);
      if (atMatch) {
        var filePath = atMatch[1];
        // Skip internal / runtime frames
        if (filePath.indexOf('consolekit-runtime') !== -1) continue;
        if (filePath === '<anonymous>') continue;
        info.file = filePath;
        info.line = parseInt(atMatch[2], 10);
        info.col = parseInt(atMatch[3], 10);
        break;
      }
    }

    return info;
  }

  // ── WebSocket connection ─────────────────────────────────────────────────────

  function connect() {
    try {
      var WebSocketClass = null;

      if (typeof WebSocket !== 'undefined') {
        WebSocketClass = WebSocket;
      } else {
        try {
          WebSocketClass = require('ws');
        } catch (e) {
          if (!global.__consolekit_warned) {
             console.warn('[ConsoleKit] WebSocket implementation (ws) not found. Zero-config logs disabled for this process.');
             global.__consolekit_warned = true;
          }
          return;
        }
      }

      if (!WebSocketClass) return;

      ws = new WebSocketClass('ws://127.0.0.1:' + CONSOLEKIT_PORT);

      ws.onopen = function () {
        connected = true;
        // Flush queued messages
        queue.forEach(function (msg) {
          try { ws.send(msg); } catch (e) { }
        });
        queue = [];
      };

      ws.onclose = function () {
        connected = false;
        ws = null;
        setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = function () {
        // Silently ignore — onclose will handle reconnect
      };
    } catch (e) {
      setTimeout(connect, RECONNECT_DELAY);
    }
  }

  function send(payload) {
    var msg = JSON.stringify(payload);
    if (connected && ws && ws.readyState === 1 /* OPEN */) {
      try { ws.send(msg); } catch (e) { queue.push(msg); }
    } else {
      // Cap queue to avoid memory leaks
      if (queue.length < 500) queue.push(msg);
    }
  }

  // ── Console patching ─────────────────────────────────────────────────────────

  var originalConsole = {};
  var levels = ['log', 'warn', 'error', 'info', 'debug', 'trace'];

  levels.forEach(function (level) {
    originalConsole[level] = (console[level] || console.log).bind(console);

    console[level] = function () {
      // Call original first
      originalConsole[level].apply(console, arguments);

      // Capture caller info
      var caller = getCallerInfo();

      var payload = {
        type: 'log',
        level: level,
        file: caller.file,
        line: caller.line,
        col: caller.col,
        args: serializeArgs(arguments),
        timestamp: Date.now(),
        stack: caller.stack,
      };

      send(payload);
    };
  });

  // ── Global error handler ─────────────────────────────────────────────────────

  function handleError(message, source, lineno, colno, error) {
    var payload = {
      type: 'log',
      level: 'error',
      file: source || '',
      line: lineno || 0,
      col: colno || 0,
      args: [{ __type: 'Error', message: String(message), stack: error ? error.stack : '' }],
      timestamp: Date.now(),
      stack: error ? error.stack : '',
    };
    send(payload);
  }

  if (typeof window !== 'undefined') {
    var prevOnerror = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      handleError(message, source, lineno, colno, error);
      if (prevOnerror) return prevOnerror.apply(this, arguments);
      return false;
    };

    window.addEventListener('unhandledrejection', function (e) {
      var reason = e.reason;
      var payload = {
        type: 'log',
        level: 'error',
        file: '',
        line: 0,
        col: 0,
        args: [{ __type: 'UnhandledRejection', message: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack : '' }],
        timestamp: Date.now(),
        stack: reason instanceof Error ? reason.stack : '',
      };
      send(payload);
    });
  }

  // Node.js uncaught exceptions
  if (typeof process !== 'undefined' && process.on) {
    process.on('uncaughtException', function (err) {
      var payload = {
        type: 'log',
        level: 'error',
        file: '',
        line: 0,
        col: 0,
        args: [{ __type: 'UncaughtException', message: err.message, stack: err.stack }],
        timestamp: Date.now(),
        stack: err.stack,
      };
      send(payload);
    });
  }

  // ── Start ────────────────────────────────────────────────────────────────────

  connect();

  console.log('[ConsoleKit] Runtime injected. Connecting to ws://127.0.0.1:' + CONSOLEKIT_PORT + '…');

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
