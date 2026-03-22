import * as vscode from 'vscode';
import { LogStore } from './logStore';
import { ConsoleKitServer } from './server';

export class StatusBarManager {
  private _item: vscode.StatusBarItem;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly logStore: LogStore,
    private readonly server: ConsoleKitServer
  ) {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this._item.tooltip = 'ConsoleKit';

    this._update();
    this._item.show();

    this._disposables.push(
      logStore.onDidUpdateLogs(() => this._update()),
      server.onDidConnect(() => this._update()),
      server.onDidDisconnect(() => this._update())
    );
  }

  private _update(): void {
    const count = this.logStore.count;
    const connected = this.server.clientCount > 0;
    const running = this.server.isRunning;

    if (!running) {
      this._item.text = '$(debug-stop) ConsoleKit: Off';
      this._item.backgroundColor = undefined;
    } else if (connected) {
      this._item.text = `$(console) ConsoleKit: ${count} log${count !== 1 ? 's' : ''}`;
      this._item.backgroundColor = undefined;
    } else {
      this._item.text = '$(loading~spin) ConsoleKit: Waiting…';
      this._item.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this._item.dispose();
    for (const d of this._disposables) d.dispose();
  }
}
