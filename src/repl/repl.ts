import chalk from 'chalk';
import type { Connection } from '../connection/interface.js';
import type { OutputFormat } from '../output/formatter.js';
import { formatResult } from '../output/formatter.js';
import { handleCommand, type CommandContext } from '../commands/registry.js';
import { InputAccumulator } from './input.js';
import { makePrompt, makeContinuationPrompt } from './prompt.js';
import { loadHistory, appendHistory } from './history.js';
import { createCompleter } from '../completion/completer.js';
import { SchemaCache } from '../completion/schema-cache.js';
import { LineEditor } from './line-editor.js';
import { outputWithPager } from '../output/pager.js';

export interface ReplOptions {
	conn: Connection;
	format: OutputFormat;
}

export async function startRepl(opts: ReplOptions): Promise<void> {
	const { conn } = opts;
	let format: OutputFormat = opts.format;
	let timing = false;
	let expanded = false;

	const schemaCache = new SchemaCache();
	await schemaCache.ensureLoaded(conn).catch(() => {});

	const history = loadHistory();
	const completer = createCompleter(schemaCache);
	const input = new InputAccumulator();

	const prompt = makePrompt(conn);
	const continuationPrompt = makeContinuationPrompt(conn);

	const editor = new LineEditor({
		prompt,
		completer,
		history,
	});

	// Welcome banner
	console.log(chalk.bold(`d1cli v0.1.0`));
	console.log(`Connected to ${chalk.bold(conn.databaseName)} (${conn.mode})`);
	console.log(chalk.gray('Type \\? for help, \\q to quit.\n'));

	editor.on('line', async (line: string) => {
		const trimmed = line.trim();

		// Empty line
		if (!trimmed && !input.isAccumulating()) {
			editor.promptLine();
			return;
		}

		// Backslash commands (only when not accumulating multi-line)
		if (trimmed.startsWith('\\') && !input.isAccumulating()) {
			const ctx: CommandContext = {
				conn,
				format,
				timing,
				expanded,
				setFormat: (f) => { format = f; },
				setTiming: (t) => { timing = t; },
				setExpanded: (e) => { expanded = e; },
			};
			try {
				const result = await handleCommand(trimmed, ctx);
				if (result.quit) {
					editor.close();
					return;
				}
				if (result.output) console.log(result.output);
			} catch (err) {
				console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
			}
			editor.promptLine();
			return;
		}

		// exit/quit without backslash
		if ((trimmed === 'exit' || trimmed === 'quit') && !input.isAccumulating()) {
			editor.close();
			return;
		}

		// Accumulate SQL
		const sql = input.append(line);
		if (sql === null) {
			editor.setPrompt(continuationPrompt);
			editor.promptLine();
			return;
		}

		// Execute SQL
		editor.setPrompt(prompt);
		appendHistory(sql);

		try {
			if (/^\s*(CREATE|ALTER|DROP)\b/i.test(sql)) {
				schemaCache.invalidate();
			}

			const result = await conn.execute(sql);
			const effectiveFormat = expanded ? 'vertical' as OutputFormat : format;
			const output = formatResult(result, effectiveFormat);

			if (timing) {
				outputWithPager(output + '\n' + chalk.gray(`Time: ${result.duration.toFixed(2)}ms`));
			} else {
				outputWithPager(output);
			}

			if (/^\s*(CREATE|ALTER|DROP)\b/i.test(sql)) {
				await schemaCache.refresh(conn).catch(() => {});
			}
		} catch (err) {
			console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
		}

		editor.promptLine();
	});

	editor.on('close', async () => {
		console.log(chalk.gray('\nBye!'));
		await conn.close();
		process.exit(0);
	});

	editor.on('SIGINT', () => {
		if (input.isAccumulating()) {
			input.reset();
			process.stdout.write('\n');
			editor.setPrompt(prompt);
			editor.promptLine();
		} else {
			editor.close();
		}
	});

	editor.start();
}
