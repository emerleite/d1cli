import * as readline from 'readline';
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

export interface ReplOptions {
	conn: Connection;
	format: OutputFormat;
}

export async function startRepl(opts: ReplOptions): Promise<void> {
	const { conn } = opts;
	let format: OutputFormat = opts.format;
	let timing = false;

	const schemaCache = new SchemaCache();
	await schemaCache.ensureLoaded(conn).catch(() => {});

	const history = loadHistory();
	const completer = createCompleter(schemaCache);
	const input = new InputAccumulator();

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		completer,
		terminal: true,
		history,
		historySize: 1000,
	});

	const prompt = makePrompt(conn);
	const continuationPrompt = makeContinuationPrompt(conn);

	// Welcome banner
	console.log(chalk.bold(`d1cli v0.1.0`));
	console.log(`Connected to ${chalk.bold(conn.databaseName)} (${conn.mode})`);
	console.log(chalk.gray('Type \\? for help, \\q to quit.\n'));

	rl.setPrompt(prompt);
	rl.prompt();

	rl.on('line', async (line: string) => {
		const trimmed = line.trim();

		// Empty line
		if (!trimmed && !input.isAccumulating()) {
			rl.prompt();
			return;
		}

		// Backslash commands (only when not accumulating multi-line)
		if (trimmed.startsWith('\\') && !input.isAccumulating()) {
			const ctx: CommandContext = {
				conn,
				format,
				timing,
				setFormat: (f) => { format = f; },
				setTiming: (t) => { timing = t; },
			};
			try {
				const result = await handleCommand(trimmed, ctx);
				if (result.quit) {
					rl.close();
					return;
				}
				if (result.output) console.log(result.output);
			} catch (err) {
				console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
			}
			rl.prompt();
			return;
		}

		// exit/quit without backslash
		if ((trimmed === 'exit' || trimmed === 'quit') && !input.isAccumulating()) {
			rl.close();
			return;
		}

		// Accumulate SQL
		const sql = input.append(line);
		if (sql === null) {
			rl.setPrompt(continuationPrompt);
			rl.prompt();
			return;
		}

		// Execute SQL
		rl.setPrompt(prompt);
		appendHistory(sql);

		try {
			// Refresh schema cache on DDL
			if (/^\s*(CREATE|ALTER|DROP)\b/i.test(sql)) {
				schemaCache.invalidate();
			}

			const result = await conn.execute(sql);
			const output = formatResult(result, format);
			console.log(output);

			if (timing) {
				console.log(chalk.gray(`Time: ${result.duration.toFixed(2)}ms`));
			}

			// Refresh schema after DDL
			if (/^\s*(CREATE|ALTER|DROP)\b/i.test(sql)) {
				await schemaCache.refresh(conn).catch(() => {});
			}
		} catch (err) {
			console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
		}

		rl.prompt();
	});

	rl.on('close', async () => {
		console.log(chalk.gray('\nBye!'));
		await conn.close();
		process.exit(0);
	});

	// Ctrl+C cancels current input
	rl.on('SIGINT', () => {
		if (input.isAccumulating()) {
			input.reset();
			console.log('');
			rl.setPrompt(prompt);
			rl.prompt();
		} else {
			rl.close();
		}
	});
}
