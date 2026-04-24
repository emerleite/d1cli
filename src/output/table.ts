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

/**
 * For large result sets, render a simple aligned format row-by-row
 * instead of cli-table3 which blows the stack on 100k+ rows.
 */
function formatLargeTable(result: QueryResult): string {
	// Calculate column widths
	const colWidths = result.columns.map((col) => col.length);
	for (const row of result.rows) {
		for (let i = 0; i < result.columns.length; i++) {
			const val = row[result.columns[i]];
			const len = val === null ? 4 : Math.min(String(val).length, MAX_COL_WIDTH);
			if (len > colWidths[i]) colWidths[i] = len;
		}
	}

	const lines: string[] = [];

	// Header
	const header = result.columns.map((col, i) => chalk.bold.cyan(col.padEnd(colWidths[i]))).join(' | ');
	const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-');
	lines.push(header);
	lines.push(separator);

	// Rows
	for (const row of result.rows) {
		const vals = result.columns.map((col, i) => {
			const val = row[col];
			if (val === null) return chalk.gray('NULL'.padEnd(colWidths[i]));
			const str = String(val);
			const truncated = str.length > MAX_COL_WIDTH ? str.slice(0, MAX_COL_WIDTH - 3) + '...' : str;
			return truncated.padEnd(colWidths[i]);
		});
		lines.push(vals.join(' | '));
	}

	lines.push(chalk.gray(`(${result.rowCount} row${result.rowCount !== 1 ? 's' : ''})`));
	return lines.join('\n');
}

// Threshold for switching to streaming format
const LARGE_RESULT_THRESHOLD = 1000;

export function formatTable(result: QueryResult): string {
	if (result.columns.length === 0) {
		if (result.changes > 0) return chalk.green(`${result.changes} row(s) changed`);
		return chalk.green('OK');
	}

	// Use simple format for large results to avoid stack overflow
	if (result.rowCount > LARGE_RESULT_THRESHOLD) {
		return formatLargeTable(result);
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
