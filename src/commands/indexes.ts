import chalk from 'chalk';
import type { CommandContext } from './registry.js';
import { formatResult } from '../output/formatter.js';

export async function handleIndexes(table: string | undefined, ctx: CommandContext): Promise<string> {
	const indexes = await ctx.conn.getIndexes(table);
	if (indexes.length === 0) return chalk.gray('No indexes found.');

	const result = {
		columns: ['index_name', 'table', 'unique', 'columns'],
		rows: indexes.map((idx) => ({
			index_name: idx.name,
			table: idx.table,
			unique: idx.unique ? 'YES' : 'NO',
			columns: idx.columns.join(', '),
		})),
		rowCount: indexes.length,
		changes: 0,
		duration: 0,
	};
	return formatResult(result, ctx.format);
}
