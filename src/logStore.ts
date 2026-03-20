import * as vscode from 'vscode';

export interface LogEntry {
  id: string;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug' | 'trace';
  file: string;
  line: number;
  col: number;
  args: unknown[];
  timestamp: number;
  stack?: string;
  // Serialized string representation of the args for display
  display: string;
}

export class LogStore {
  private _logs: LogEntry[] = [];
  private _byLocation: Map<string, LogEntry[]> = new Map();
  private _outputChannel: vscode.OutputChannel;

  private readonly _onDidUpdateLogs = new vscode.EventEmitter<void>();
  public readonly onDidUpdateLogs = this._onDidUpdateLogs.event;

  constructor() {
    this._outputChannel = vscode.window.createOutputChannel('ConsoleKit Logs');
  }

  addLog(entry: Omit<LogEntry, 'id' | 'display'>): void {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const display = this._buildDisplay(entry.args);
    const fullEntry: LogEntry = { ...entry, id, display };

    this._logs.push(fullEntry);

    const normalizedPath = this._normalize(entry.file);
    const key = `${normalizedPath}::${entry.line}`;
    
    this._outputChannel.appendLine(`[LogStore] Adding log: ${entry.level} at ${entry.file}:${entry.line} (Normalized: ${normalizedPath})`);

    const existing = this._byLocation.get(key) ?? [];
    existing.push(fullEntry);
    this._byLocation.set(key, existing);

    this._onDidUpdateLogs.fire();
  }

  getLogs(): LogEntry[] {
    return this._logs;
  }

  private _normalize(file: string): string {
    if (!file) return '';
    let normalized = file.replace(/\\/g, '/');
    
    // Decipher encoded paths (common in browser environments)
    if (normalized.includes('%')) {
      try { normalized = decodeURIComponent(normalized); } catch {}
    }

    // Strip file:// prefix if somehow it reached here
    normalized = normalized.replace(/^file:\/\/\/?/, '/');

    // On Windows, paths might be /c:/foo or c:/foo. Standardize to c:/foo
    if (/^\/[a-zA-Z]:/.test(normalized)) {
      normalized = normalized.slice(1);
    }

    return normalized.toLowerCase();
  }

  getLogsForLine(file: string, line: number): LogEntry[] {
    const key = `${this._normalize(file)}::${line}`;
    return this._byLocation.get(key) ?? [];
  }

  getLogsForFile(file: string): LogEntry[] {
    const normalized = this._normalize(file);
    return this._logs.filter((l) => this._normalize(l.file) === normalized);
  }

  clear(): void {
    this._logs = [];
    this._byLocation.clear();
    this._onDidUpdateLogs.fire();
  }

  get count(): number {
    return this._logs.length;
  }

  dispose(): void {
    this._onDidUpdateLogs.dispose();
  }

  private _buildDisplay(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');
  }
}
