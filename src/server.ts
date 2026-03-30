import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as vscode from 'vscode';
import { LogStore } from './logStore';

export class ConsoleKitServer {
  private _wss: WebSocketServer | null = null;
  private _httpServer: http.Server | null = null;
  private _clients: Set<WebSocket> = new Set();
  private _isRunning = false;

  private readonly _onDidConnect = new vscode.EventEmitter<void>();
  private readonly _onDidDisconnect = new vscode.EventEmitter<void>();
  public readonly onDidConnect = this._onDidConnect.event;
  public readonly onDidDisconnect = this._onDidDisconnect.event;

  constructor(private readonly logStore: LogStore) { }

  get isRunning(): boolean {
    return this._isRunning;
  }

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._isRunning) {
        resolve();
        return;
      }

      this._httpServer = http.createServer();
      this._wss = new WebSocketServer({ server: this._httpServer });

      this._wss.on('connection', (ws: WebSocket) => {
        this._clients.add(ws);
        this._onDidConnect.fire();

        ws.on('message', (raw: Buffer | string) => {
          try {
            const data = JSON.parse(raw.toString());
            this._handleMessage(data);
          } catch {
            // Ignore malformed messages
          }
        });

        ws.on('close', () => {
          this._clients.delete(ws);
          if (this._clients.size === 0) {
            this._onDidDisconnect.fire();
          }
        });

        ws.on('error', () => {
          this._clients.delete(ws);
        });
      });

      this._httpServer.listen(port, '127.0.0.1', () => {
        this._isRunning = true;
        resolve();
      });

      this._httpServer.on('error', (err: any) => {
        this._isRunning = false;
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use by another process.`));
        } else {
          reject(err);
        }
        this.stop(); // Ensure cleanup
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this._isRunning) {
        resolve();
        return;
      }

      for (const client of this._clients) {
        client.terminate();
      }
      this._clients.clear();

      this._wss?.close(() => {
        this._httpServer?.close(() => {
          this._isRunning = false;
          this._wss = null;
          this._httpServer = null;
          this._onDidDisconnect.fire();
          resolve();
        });
      });
    });
  }

  get clientCount(): number {
    return this._clients.size;
  }

  dispose(): void {
    this.stop();
    this._onDidConnect.dispose();
    this._onDidDisconnect.dispose();
  }

  private _handleMessage(data: Record<string, unknown>): void {
    if (data.type !== 'log') return;

    // Normalize the file path from the runtime
    const rawFile = (data.file as string) ?? '';
    const file = this._normalizePath(rawFile);

    this.logStore.addLog({
      level: (data.level as LogStore['_logs'][0]['level']) ?? 'log',
      file,
      line: Number(data.line ?? 0),
      col: Number(data.col ?? 0),
      args: (data.args as unknown[]) ?? [],
      timestamp: Number(data.timestamp ?? Date.now()),
      stack: data.stack as string | undefined,
    });
  }

  private _normalizePath(filePath: string): string {
    if (!filePath) return '';
    // Handle file:// URIs (RFC 8089)
    if (filePath.startsWith('file://')) {
      try {
        const url = new URL(filePath);
        // On Windows, url.pathname might be /C:/foo, on Unix it's /foo
        filePath = decodeURIComponent(url.pathname);
      } catch {
        filePath = decodeURIComponent(filePath.replace(/^file:\/\/\/?/, '/'));
      }
    }
    return filePath;
  }
}
