import * as vscode from 'vscode';
import { LogStore } from './logStore';

export class HoverProvider implements vscode.HoverProvider {
  constructor(private readonly logStore: LogStore) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | null {
    const filePath = document.uri.fsPath;
    // VS Code lines are 0-indexed, our store uses 1-indexed line numbers
    const line = position.line + 1;

    const logs = this.logStore.getLogsForLine(filePath, line);
    if (logs.length === 0) return null;

    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown(`### ConsoleKit — ${logs.length} log${logs.length > 1 ? 's' : ''} on line ${line}\n\n`);
    md.appendMarkdown('---\n\n');

    for (const log of logs) {
      const icon = levelIcon(log.level);
      const time = new Date(log.timestamp).toLocaleTimeString();
      const levelLabel = log.level.toUpperCase();

      md.appendMarkdown(`**${icon} ${levelLabel}** &nbsp;&nbsp; \`${time}\`\n\n`);

      // Pretty-print arguments
      for (const arg of log.args) {
        if (typeof arg === 'string') {
          md.appendMarkdown(`> ${escapeMarkdown(arg)}\n\n`);
        } else {
          try {
            const json = JSON.stringify(arg, null, 2);
            md.appendCodeblock(json, 'json');
          } catch {
            md.appendMarkdown(`> ${String(arg)}\n\n`);
          }
        }
      }

      // Stack trace
      if (log.stack) {
        const stackLines = log.stack
          .split('\n')
          .slice(1, 6) // Show top 5 frames
          .map((l) => l.trim())
          .join('\n');
        md.appendMarkdown('\n**Stack Trace:**\n\n');
        md.appendCodeblock(stackLines, 'text');
      }

      md.appendMarkdown('\n---\n\n');
    }

    return new vscode.Hover(md);
  }
}

function levelIcon(level: string): string {
  switch (level) {
    case 'error': return '🔴';
    case 'warn': return '🟡';
    case 'info': return '🔵';
    case 'debug': return '⚫';
    default: return '🟢';
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[`*_[\]()#<>]/g, '\\$&');
}
