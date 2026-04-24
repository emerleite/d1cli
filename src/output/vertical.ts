import chalk from 'chalk';
import type { QueryResult } from '../connection/interface.js';

export function formatVertical(result: QueryResult): string {
	if (result.columns.length === 0) {
		if (result.changes > 0) return chalk.green(`${result.changes} row(s) changed`);
		return chalk.green('OK');
	}

	const maxKeyLen = Math.max(...result.columns.map((c) => c.length));
	const lines: string[] = [];

	result.rows.forEach((row, i) => {
		lines.push(chalk.gray(`*************************** ${i + 1}. row ***************************`));
		for (const col of result.columns) {
			const key = col.padStart(maxKeyLen);
			const val = row[col] === null ? chalk.gray('NULL') : String(row[col]);
			lines.push(`${chalk.bold(key)}: ${val}`);
		}
	});

	lines.push(chalk.gray(`(${result.rowCount} row${result.rowCount !== 1 ? 's' : ''})`));
	return lines.join('\n');
}
