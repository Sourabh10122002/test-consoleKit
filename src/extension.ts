import * as vscode from 'vscode';
import * as path from 'path';
import { LogStore } from './logStore';
import { ConsoleKitServer } from './server';
import { Decorator } from './decorator';
import { HoverProvider } from './hoverProvider';
import { StatusBarManager } from './statusBar';

let serverInstance: ConsoleKitServer | null = null;
let statusBarInstance: StatusBarManager | null = null;
let decoratorInstance: Decorator | null = null;
let logStoreInstance: LogStore | null = null;

export function activate(context: vscode.ExtensionContext): void {
  console.log('ConsoleKit: Activating Zero-Config Mode...');
  const logStore = new LogStore();
  logStoreInstance = logStore;
  console.log('ConsoleKit: LogStore initialized');
  const server = new ConsoleKitServer(logStore);
  serverInstance = server;
  console.log('ConsoleKit: Server initialized');

  const decorator = new Decorator(logStore);
  decoratorInstance = decorator;
  console.log('ConsoleKit: Decorator initialized');

  const statusBar = new StatusBarManager(logStore, server);
  statusBarInstance = statusBar;

  // Injection Logic (Zero-Config)
  const runtimePath = path.join(context.extensionPath, 'runtime', 'consolekit-runtime.js');
  const env = context.environmentVariableCollection;

  // Use --require for automatic injection in Node process
  // We use prepend to ensure it's loaded first
  const nodeOptions = `--require ${runtimePath}`;
  env.prepend('NODE_OPTIONS', nodeOptions + ' ');

  console.log(`ConsoleKit: Injected NODE_OPTIONS: ${nodeOptions}`);


  // Register hover provider for all languages
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { pattern: '**/*.{js,ts,jsx,tsx,mjs,cjs,vue,svelte}' },
      new HoverProvider(logStore)
    )
  );

  // Helper to start the server
  async function startServer() {
    if (server.isRunning) return;

    const port = vscode.workspace.getConfiguration('consolekit').get<number>('port', 44225);
    try {
      console.log(`ConsoleKit: Starting server on port ${port}...`);
      await server.start(port);
      console.log(`ConsoleKit: Server started successfully`);
      vscode.window.showInformationMessage(`ConsoleKit started on ws://localhost:${port} 🚀`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`ConsoleKit: Failed to start: ${msg}`);
      vscode.window.showErrorMessage(`ConsoleKit failed to start: ${msg}`);
    }
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('consolekit.start', async () => {
      if (server.isRunning) {
        vscode.window.showInformationMessage('ConsoleKit is already running.');
        return;
      }
      await startServer();
    }),

    vscode.commands.registerCommand('consolekit.stop', async () => {
      await server.stop();
      vscode.window.showInformationMessage('ConsoleKit stopped.');
    }),

    vscode.commands.registerCommand('consolekit.clearLogs', () => {
      logStore.clear();
    }),


    vscode.commands.registerCommand('consolekit.copyRuntime', () => {
      const runtimePath = path.join(context.extensionPath, 'runtime', 'consolekit-runtime.js');
      vscode.env.clipboard.writeText(runtimePath);
      vscode.window.showInformationMessage(
        `Runtime path copied: ${runtimePath}`,
        'Open File'
      ).then((selection) => {
        if (selection === 'Open File') {
          vscode.window.showTextDocument(vscode.Uri.file(runtimePath));
        }
      });
    }),

    vscode.commands.registerCommand('consolekit.testConnection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const line = editor.selection.active.line + 1;
      const file = editor.document.uri.fsPath;

      logStore.addLog({
        level: 'info',
        file,
        line,
        col: 1,
        args: ['✨ ConsoleKit connection test successful!'],
        timestamp: Date.now()
      });

      vscode.window.showInformationMessage('Sent test log to current line!');
    })
  );

  // Auto-start if enabled
  const config = vscode.workspace.getConfiguration('consolekit');
  if (config.get<boolean>('enabled', true)) {
    startServer();
  }

  // Dispose everything on deactivation
  context.subscriptions.push(
    new vscode.Disposable(() => {
      server.dispose();
      decorator.dispose();
      statusBar.dispose();
      logStore.dispose();
    })
  );

  console.log('ConsoleKit: Activation complete! 🎉');
}

export function deactivate(): void {
  serverInstance?.dispose();
  decoratorInstance?.dispose();
  statusBarInstance?.dispose();
}
