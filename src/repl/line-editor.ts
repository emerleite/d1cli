import * as readline from 'readline';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import ansiEscapes from 'ansi-escapes';
import chalk from 'chalk';
import { highlightSql } from '../highlight/highlighter.js';
import type { CompletionItem, CompletionType } from '../completion/completer.js';

export interface LineEditorOptions {
	prompt: string;
	completer?: ((line: string) => [string[], string]) & { getLastCompletions?: () => CompletionItem[] };
	history?: string[];
}

const TYPE_LABELS: Record<CompletionType, string> = {
	table: chalk.green('table'),
	column: chalk.cyan('column'),
	keyword: chalk.blue('keyword'),
	function: chalk.magenta('func'),
	command: chalk.yellow('cmd'),
};

export class LineEditor {
	private line = '';
	private cursor = 0;
	private prompt: string;
	private completer?: (line: string) => [string[], string];
	private history: string[];
	private historyIndex = -1;
	private historyStash = '';
	private closed = false;

	private onLine?: (line: string) => void;
	private onClose?: () => void;
	private onSigint?: () => void;

	constructor(opts: LineEditorOptions) {
		this.prompt = opts.prompt;
		this.completer = opts.completer;
		this.history = [...(opts.history || [])];
		this.historyIndex = -1;
	}

	setPrompt(prompt: string): void {
		this.prompt = prompt;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	on(event: 'line' | 'close' | 'SIGINT', cb: (...args: any[]) => void): this {
		if (event === 'line') this.onLine = cb;
		else if (event === 'close') this.onClose = cb;
		else if (event === 'SIGINT') this.onSigint = cb;
		return this;
	}

	promptLine(): void {
		this.line = '';
		this.cursor = 0;
		this.render();
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		process.stdin.setRawMode?.(false);
		process.stdin.removeAllListeners('keypress');
		process.stdin.pause();
		this.onClose?.();
	}

	start(): void {
		if (!process.stdin.isTTY) {
			this.startReadline();
			return;
		}

		this.isTTY = true;
		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf-8');

		process.stdin.on('keypress', (_str: string | undefined, key: readline.Key) => {
			if (this.closed) return;
			this.handleKey(_str, key);
		});

		this.promptLine();
	}

	private isTTY = false;

	private startReadline(): void {
		// Fallback for piped/non-TTY input
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			completer: this.completer,
			terminal: false,
		});
		rl.on('line', (line) => this.onLine?.(line));
		rl.on('close', () => this.onClose?.());
	}

	private handleKey(str: string | undefined, key: readline.Key): void {
		if (!key) {
			if (str) this.insert(str);
			return;
		}

		// Ctrl+C
		if (key.ctrl && key.name === 'c') {
			this.onSigint?.();
			return;
		}

		// Ctrl+D — close on empty line
		if (key.ctrl && key.name === 'd') {
			if (this.line.length === 0) {
				process.stdout.write('\n');
				this.close();
			}
			return;
		}

		// Enter / Return
		if (key.name === 'return') {
			process.stdout.write('\n');
			const line = this.line;
			if (line.trim()) {
				this.history.unshift(line);
				this.historyIndex = -1;
			}
			this.onLine?.(line);
			return;
		}

		// Tab — completion
		if (key.name === 'tab') {
			this.handleTab();
			return;
		}

		// Backspace
		if (key.name === 'backspace') {
			if (this.cursor > 0) {
				this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
				this.cursor--;
				this.render();
			}
			return;
		}

		// Delete
		if (key.name === 'delete') {
			if (this.cursor < this.line.length) {
				this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1);
				this.render();
			}
			return;
		}

		// Arrow keys
		if (key.name === 'left') {
			if (key.ctrl) {
				this.cursor = this.wordBoundaryLeft();
			} else if (this.cursor > 0) {
				this.cursor--;
			}
			this.render();
			return;
		}
		if (key.name === 'right') {
			if (key.ctrl) {
				this.cursor = this.wordBoundaryRight();
			} else if (this.cursor < this.line.length) {
				this.cursor++;
			}
			this.render();
			return;
		}
		if (key.name === 'up') {
			this.historyPrev();
			return;
		}
		if (key.name === 'down') {
			this.historyNext();
			return;
		}

		// Home / Ctrl+A
		if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
			this.cursor = 0;
			this.render();
			return;
		}

		// End / Ctrl+E
		if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
			this.cursor = this.line.length;
			this.render();
			return;
		}

		// Ctrl+K — kill to end of line
		if (key.ctrl && key.name === 'k') {
			this.line = this.line.slice(0, this.cursor);
			this.render();
			return;
		}

		// Ctrl+U — kill to start of line
		if (key.ctrl && key.name === 'u') {
			this.line = this.line.slice(this.cursor);
			this.cursor = 0;
			this.render();
			return;
		}

		// Ctrl+W — delete word backward
		if (key.ctrl && key.name === 'w') {
			const newCursor = this.wordBoundaryLeft();
			this.line = this.line.slice(0, newCursor) + this.line.slice(this.cursor);
			this.cursor = newCursor;
			this.render();
			return;
		}

		// Ctrl+L — clear screen
		if (key.ctrl && key.name === 'l') {
			process.stdout.write(ansiEscapes.clearScreen + ansiEscapes.cursorTo(0, 0));
			this.render();
			return;
		}

		// Regular character
		if (str && !key.ctrl && !key.meta && str.length > 0 && str >= ' ') {
			this.insert(str);
		}
	}

	private insert(str: string): void {
		this.line = this.line.slice(0, this.cursor) + str + this.line.slice(this.cursor);
		this.cursor += str.length;
		this.render();
	}

	private render(): void {
		if (!this.isTTY) return;

		const highlighted = this.line.length > 0 ? highlightSql(this.line) : '';
		const promptWidth = stringWidth(stripAnsi(this.prompt));

		// Move to start of line, clear it, write prompt + highlighted text
		process.stdout.write(
			ansiEscapes.cursorTo(0) +
			ansiEscapes.eraseLine +
			this.prompt +
			highlighted +
			ansiEscapes.cursorTo(promptWidth + this.cursor)
		);
	}

	private handleTab(): void {
		if (!this.completer) return;

		const [completions, partial] = this.completer(this.line);
		if (completions.length === 0) return;

		if (completions.length === 1) {
			// Single match — insert it
			const completion = completions[0];
			const suffix = completion.slice(partial.length) + ' ';
			this.insert(suffix);
			return;
		}

		// Multiple matches — find common prefix
		const common = this.commonPrefix(completions);
		if (common.length > partial.length) {
			const suffix = common.slice(partial.length);
			this.insert(suffix);
			return;
		}

		// Show candidates with type labels
		process.stdout.write('\n');
		const meta: CompletionItem[] = (this.completer as any)?.getLastCompletions?.() || [];

		if (meta.length > 0) {
			const maxTextLen = Math.max(...meta.map((m: CompletionItem) => m.text.length));
			for (const item of meta) {
				const label = TYPE_LABELS[item.type] || item.type;
				process.stdout.write(`  ${item.text.padEnd(maxTextLen + 2)}${label}\n`);
			}
		} else {
			const cols = process.stdout.columns || 80;
			const maxLen = Math.max(...completions.map((c) => c.length)) + 2;
			const perRow = Math.max(1, Math.floor(cols / maxLen));
			for (let i = 0; i < completions.length; i++) {
				process.stdout.write(completions[i].padEnd(maxLen));
				if ((i + 1) % perRow === 0 || i === completions.length - 1) {
					process.stdout.write('\n');
				}
			}
		}

		this.render();
	}

	private commonPrefix(strings: string[]): string {
		if (strings.length === 0) return '';
		let prefix = strings[0];
		for (let i = 1; i < strings.length; i++) {
			while (!strings[i].toLowerCase().startsWith(prefix.toLowerCase())) {
				prefix = prefix.slice(0, -1);
			}
		}
		return prefix;
	}

	private historyPrev(): void {
		if (this.historyIndex < this.history.length - 1) {
			if (this.historyIndex === -1) this.historyStash = this.line;
			this.historyIndex++;
			this.line = this.history[this.historyIndex];
			this.cursor = this.line.length;
			this.render();
		}
	}

	private historyNext(): void {
		if (this.historyIndex > -1) {
			this.historyIndex--;
			this.line = this.historyIndex === -1 ? this.historyStash : this.history[this.historyIndex];
			this.cursor = this.line.length;
			this.render();
		}
	}

	private wordBoundaryLeft(): number {
		let i = this.cursor - 1;
		while (i > 0 && this.line[i - 1] === ' ') i--;
		while (i > 0 && this.line[i - 1] !== ' ') i--;
		return Math.max(0, i);
	}

	private wordBoundaryRight(): number {
		let i = this.cursor;
		while (i < this.line.length && this.line[i] === ' ') i++;
		while (i < this.line.length && this.line[i] !== ' ') i++;
		return i;
	}
}
