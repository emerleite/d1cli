import Table from 'cli-table3';
import chalk from 'chalk';
import type { QueryResult } from '../connection/interface.js';

const MAX_COL_WIDTH = 60;

function truncate(val: unknown): string {
	if (val === null) return chalk.gray('NULL');
	if (val === undefined) return '';
	const str = String(val);
	if (str.length > MAX_COL_WIDTH) return str.slice(0, MAX_COL_WIDTH - 3) + '...';
	return str;
}

export function formatTable(result: QueryResult): string {
	if (result.columns.length === 0) {
		if (result.changes > 0) return chalk.green(`${result.changes} row(s) changed`);
		return chalk.green('OK');
	}

	const table = new Table({
		head: result.columns.map((c) => chalk.bold.cyan(c)),
		style: { head: [], border: [] },
	});

	for (const row of result.rows) {
		table.push(result.columns.map((col) => truncate(row[col])));
	}

	const footer = chalk.gray(`(${result.rowCount} row${result.rowCount !== 1 ? 's' : ''})`);
	return table.toString() + '\n' + footer;
}
