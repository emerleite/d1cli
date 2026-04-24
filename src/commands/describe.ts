import chalk from 'chalk';
import type { CommandContext } from './registry.js';
import { formatResult } from '../output/formatter.js';

export async function handleDescribe(table: string, ctx: CommandContext): Promise<string> {
	const columns = await ctx.conn.getColumns(table);
	if (columns.length === 0) return chalk.red(`Table "${table}" not found.`);

	const lines: string[] = [];

	// Column info
	const colResult = {
		columns: ['column', 'type', 'notnull', 'default', 'pk'],
		rows: columns.map((c) => ({
			column: c.name,
			type: c.type || 'ANY',
			notnull: c.notnull ? 'YES' : 'NO',
			default: c.dflt_value ?? '',
			pk: c.pk ? 'YES' : '',
		})),
		rowCount: columns.length,
		changes: 0,
		duration: 0,
	};
	lines.push(chalk.bold(`Table: ${table}`));
	lines.push(formatResult(colResult, ctx.format));

	// Indexes
	const indexes = await ctx.conn.getIndexes(table);
	if (indexes.length > 0) {
		lines.push('');
		lines.push(chalk.bold('Indexes:'));
		const idxResult = {
			columns: ['index_name', 'unique', 'columns'],
			rows: indexes.map((idx) => ({
				index_name: idx.name,
				unique: idx.unique ? 'YES' : 'NO',
				columns: idx.columns.join(', '),
			})),
			rowCount: indexes.length,
			changes: 0,
			duration: 0,
		};
		lines.push(formatResult(idxResult, ctx.format));
	}

	return lines.join('\n');
}
