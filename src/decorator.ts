import * as vscode from 'vscode';
import { LogStore, LogEntry } from './logStore';

const MAX_INLINE = 60;

// Decoration types per log level
const decorationTypes: Record<string, vscode.TextEditorDecorationType> = {};

function getDecorationType(level: string): vscode.TextEditorDecorationType {
  if (!decorationTypes[level]) {
    const color = levelColor(level);
    decorationTypes[level] = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 2em',
        color,
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
      isWholeLine: false,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
    });
  }
  return decorationTypes[level];
}

function levelColor(level: string): string {
  switch (level) {
    case 'error': return new vscode.ThemeColor('editorError.foreground').toString();
    case 'warn': return '#d4a017';
    case 'info': return '#569cd6';
    case 'debug': return '#9e9e9e';
    default: return '#4ec94e';
  }
}

function truncate(text: string, max: number = MAX_INLINE): string {
  return text.length > max ? text.slice(0, max) + ' …' : text;
}

function getLevelIcon(level: string): string {
  switch (level) {
    case 'error': return '✖';
    case 'warn': return '⚠';
    case 'info': return 'ℹ';
    case 'debug': return '⬡';
    default: return '●';
  }
}

export class Decorator {
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly logStore: LogStore) {
    this._disposables.push(
      logStore.onDidUpdateLogs(() => this._refresh()),
      vscode.window.onDidChangeActiveTextEditor(() => this._refresh()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (vscode.window.activeTextEditor?.document === e.document) {
          this._refresh();
        }
      })
    );
  }

  private _refresh(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const filePath = editor.document.uri.fsPath;
    const fileLogs = this.logStore.getLogsForFile(filePath);

    // Group logs by line, pick last one per level per line for display
    const byLine = new Map<number, LogEntry[]>();
    for (const log of fileLogs) {
      const existing = byLine.get(log.line) ?? [];
      existing.push(log);
      byLine.set(log.line, existing);
    }

    // Clear all decoration types first
    const levels = ['log', 'warn', 'error', 'info', 'debug', 'trace'];
    for (const level of levels) {
      const decType = getDecorationType(level);
      editor.setDecorations(decType, []);
    }

    if (!vscode.workspace.getConfiguration('consolekit').get('showInlineValues')) {
      return;
    }

    // Build decoration options grouped by level
    const decorationsPerLevel = new Map<string, vscode.DecorationOptions[]>();

    for (const [lineNum, logs] of byLine) {
      // Use 0-indexed line
      const docLine = lineNum - 1;
      if (docLine < 0 || docLine >= editor.document.lineCount) continue;

      const line = editor.document.lineAt(docLine);
      const endChar = line.range.end.character;
      const range = new vscode.Range(docLine, endChar, docLine, endChar);

      // Merge all logs on this line into a single display string
      const parts = logs.map((l) => `${getLevelIcon(l.level)} ${truncate(l.display)}`);
      const displayText = parts.join('  |  ');

      // Use the level of the last (most recent) log for coloring
      const dominantLevel = logs[logs.length - 1].level;

      const md = new vscode.MarkdownString(
        logs.map((l) => `**${l.level.toUpperCase()}** \`${new Date(l.timestamp).toLocaleTimeString()}\`\n\n\`\`\`\n${l.display}\n\`\`\``).join('\n\n---\n\n')
      );
      md.isTrusted = true;

      const opts = decorationsPerLevel.get(dominantLevel) ?? [];
      opts.push({
        range,
        renderOptions: {
          after: { contentText: displayText },
        },
        hoverMessage: md,
      });
      decorationsPerLevel.set(dominantLevel, opts);
    }

    for (const [level, opts] of decorationsPerLevel) {
      editor.setDecorations(getDecorationType(level), opts);
    }
  }

  dispose(): void {
    for (const d of this._disposables) d.dispose();
    for (const dt of Object.values(decorationTypes)) dt.dispose();
  }
}
