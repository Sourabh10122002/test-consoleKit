import * as vscode from 'vscode';
import { LogStore, LogEntry } from './logStore';

export class LogViewerPanel implements vscode.WebviewViewProvider {
  public static readonly viewId = 'consolekit.logViewer';
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logStore: LogStore
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    console.log('ConsoleKit: resolveWebviewView called');
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Push logs to webview whenever store updates
    this._disposables.push(
      this.logStore.onDidUpdateLogs(() => {
        this._pushLogs();
      })
    );

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      console.log('ConsoleKit: Message from webview:', msg.command);
      if (msg.command === 'ready') {
        this._pushLogs();
      } else if (msg.command === 'navigateTo') {
        const { file, line } = msg;
        if (!file) return;
        try {
          const uri = vscode.Uri.file(file);
          const doc = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(doc);
          const targetLine = Math.max(0, (line || 1) - 1);
          const pos = new vscode.Position(targetLine, 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        } catch {
          vscode.window.showWarningMessage(`ConsoleKit: Could not open file ${file}`);
        }
      } else if (msg.command === 'error') {
        vscode.window.showErrorMessage(`ConsoleKit Webview Error: ${msg.message}`);
      } else if (msg.command === 'clearLogs') {
        vscode.commands.executeCommand('consolekit.clearLogs');
      }
    }, undefined, this._disposables);
  }

  private _pushLogs(): void {
    if (!this._view) return;
    this._view.webview.postMessage({
      command: 'updateLogs',
      logs: this.logStore.getLogs(),
    });
  }

  private _getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ConsoleKit Log Viewer</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #1e1e2e);
      --surface: var(--vscode-editor-background, #181825);
      --border: var(--vscode-panel-border, #313244);
      --text: var(--vscode-foreground, #cdd6f4);
      --muted: var(--vscode-descriptionForeground, #9399b2);
      --accent: #89b4fa;
      --log: #a6e3a1;
      --warn: #f9e2af;
      --error: #f38ba8;
      --info: #89dceb;
      --radius: 6px;
      --font: 'Segoe UI', system-ui, -apple-system, sans-serif;
      --mono: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      font-size: 12px;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .search-box {
      flex: 1;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 12px;
      padding: 4px 8px;
      outline: none;
    }
    .search-box:focus { border-color: var(--accent); }

    .filters {
      display: flex;
      gap: 4px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      flex-shrink: 0;
      overflow-x: auto;
    }

    .filter-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 20px;
      color: var(--muted);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 10px;
    }
    .filter-btn.active { background: rgba(137,180,250,0.14); border-color: var(--accent); color: var(--text); }

    .log-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }

    .log-entry {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 5px 10px;
      cursor: pointer;
      border-left: 2px solid transparent;
      border-bottom: 1px solid rgba(255,255,255,0.03);
    }
    .log-entry:hover { background: rgba(255,255,255,0.03); }
    .level-log { border-left-color: var(--log); }
    .level-warn { border-left-color: var(--warn); }
    .level-error { border-left-color: var(--error); }
    .level-info { border-left-color: var(--info); }

    .log-body { flex: 1; min-width: 0; }
    .log-value { font-family: var(--mono); word-break: break-all; line-height: 1.4; }
    .log-meta { display: flex; gap: 8px; margin-top: 2px; color: var(--muted); font-size: 10px; }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--muted);
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <input class="search-box" id="searchBox" type="text" placeholder="Search logs…" />
    <button id="clearBtn" title="Clear Logs" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:14px;">🗑</button>
  </div>
  
  <div class="filters">
    <button class="filter-btn active" data-level="all">All</button>
    <button class="filter-btn" data-level="log">Log</button>
    <button class="filter-btn" data-level="warn">Warn</button>
    <button class="filter-btn" data-level="error">Error</button>
  </div>

  <div class="log-list" id="logList">
    <div class="empty-state">
      <div style="font-size: 24px; margin-bottom: 8px;">📡</div>
      <div>No logs yet</div>
      <div style="font-size: 10px; opacity: 0.6; margin-top: 4px;">Start your app to see logs here</div>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      let allLogs = [];
      let activeFilter = 'all';
      let searchQuery = '';

      const logList = document.getElementById('logList');
      const searchBox = document.getElementById('searchBox');
      const clearBtn = document.getElementById('clearBtn');

      function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function render() {
        const filtered = allLogs.filter(log => {
          if (activeFilter !== 'all' && log.level !== activeFilter) return false;
          if (searchQuery) {
            const text = (log.display + log.file).toLowerCase();
            if (!text.includes(searchQuery.toLowerCase())) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          logList.innerHTML = '<div class="empty-state">No logs match filters</div>';
          return;
        }

        logList.innerHTML = filtered.map(log => \`
          <div class="log-entry level-\${log.level}" data-file="\${log.file}" data-line="\${log.line}">
            <div class="log-body">
              <div class="log-value">\${escapeHtml(log.display)}</div>
              <div class="log-meta">
                <span>\${log.file.split('/').pop()}:\${log.line}</span>
                <span>\${new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        \`).join('');

        // Re-attach listeners
        logList.querySelectorAll('.log-entry').forEach(el => {
          el.onclick = () => {
            vscode.postMessage({
              command: 'navigateTo',
              file: el.dataset.file,
              line: parseInt(el.dataset.line)
            });
          };
        });
      }

      window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.command === 'updateLogs') {
          allLogs = msg.logs || [];
          render();
        }
      });

      searchBox.oninput = () => { searchQuery = searchBox.value; render(); };
      clearBtn.onclick = () => vscode.postMessage({ command: 'clearLogs' });
      
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeFilter = btn.dataset.level;
          render();
        };
      });

      // Signal ready
      vscode.postMessage({ command: 'ready' });
    })();
  </script>
</body>
</html>`;
  }

  dispose(): void {
    for (const d of this._disposables) d.dispose();
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
