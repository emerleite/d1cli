import chalk from 'chalk';
import { readFileSync } from 'fs';
import { parseArgs } from './config/args.js';
import { createConnection } from './connection/factory.js';
import { formatResult } from './output/formatter.js';
import { startRepl } from './repl/repl.js';

async function main() {
	const opts = parseArgs(process.argv);

	try {
		const conn = await createConnection(opts);

		// Non-interactive: execute and exit
		if (opts.execute) {
			const result = await conn.execute(opts.execute);
			console.log(formatResult(result, opts.format));
			await conn.close();
			process.exit(0);
		}

		if (opts.file) {
			const sql = readFileSync(opts.file, 'utf-8');
			const result = await conn.execute(sql);
			console.log(formatResult(result, opts.format));
			await conn.close();
			process.exit(0);
		}

		// Interactive REPL
		await startRepl({ conn, format: opts.format });
	} catch (err) {
		console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
		process.exit(1);
	}
}

main();
