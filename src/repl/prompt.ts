import chalk from 'chalk';
import type { Connection } from '../connection/interface.js';

export function makePrompt(conn: Connection): string {
	const mode = conn.mode === 'local' ? chalk.green('local') : chalk.yellow('remote');
	return `${chalk.bold(conn.databaseName)}(${mode})> `;
}

export function makeContinuationPrompt(conn: Connection): string {
	// Align with the main prompt width (without ANSI codes)
	const plainLen = `${conn.databaseName}(${conn.mode})> `.length;
	return ' '.repeat(plainLen - 5) + '...> ';
}
