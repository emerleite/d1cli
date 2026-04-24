import chalk from 'chalk';
import type { CommandContext } from './registry.js';
import { highlightSql } from '../highlight/highlighter.js';

export async function handleSchema(table: string, ctx: CommandContext): Promise<string> {
	const result = await ctx.conn.execute(
		`SELECT sql FROM sqlite_master WHERE name = '${table}' AND sql IS NOT NULL`
	);

	if (result.rows.length === 0) {
		return chalk.red(`Table "${table}" not found.`);
	}

	const lines: string[] = [];
	for (const row of result.rows) {
		const sql = row.sql as string;
		lines.push(highlightSql(sql) + ';');
	}

	// Also show indexes
	const idxResult = await ctx.conn.execute(
		`SELECT sql FROM sqlite_master WHERE tbl_name = '${table}' AND type = 'index' AND sql IS NOT NULL`
	);
	for (const row of idxResult.rows) {
		const sql = row.sql as string;
		lines.push(highlightSql(sql) + ';');
	}

	return lines.join('\n');
}
