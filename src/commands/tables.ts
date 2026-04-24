import chalk from 'chalk';
import type { CommandContext } from './registry.js';
import { formatResult } from '../output/formatter.js';

export async function handleTables(ctx: CommandContext): Promise<string> {
	const tables = await ctx.conn.getTables();
	if (tables.length === 0) return chalk.gray('No tables found.');

	const result = {
		columns: ['table_name'],
		rows: tables.map((t) => ({ table_name: t })),
		rowCount: tables.length,
		changes: 0,
		duration: 0,
	};
	return formatResult(result, ctx.format);
}
