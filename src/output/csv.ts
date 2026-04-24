import type { QueryResult } from '../connection/interface.js';

function escapeCsv(val: unknown): string {
	if (val === null || val === undefined) return '';
	const str = String(val);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return '"' + str.replace(/"/g, '""') + '"';
	}
	return str;
}

export function formatCsv(result: QueryResult): string {
	if (result.columns.length === 0) return '';
	const lines: string[] = [];
	lines.push(result.columns.map(escapeCsv).join(','));
	for (const row of result.rows) {
		lines.push(result.columns.map((col) => escapeCsv(row[col])).join(','));
	}
	return lines.join('\n');
}
