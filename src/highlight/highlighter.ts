import chalk from 'chalk';

const SQL_KEYWORDS = new Set([
	'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
	'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
	'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
	'ON', 'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
	'UNION', 'ALL', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
	'IF', 'EXISTS', 'NULL', 'DEFAULT', 'PRIMARY', 'KEY', 'UNIQUE',
	'FOREIGN', 'REFERENCES', 'AUTOINCREMENT', 'INTEGER', 'TEXT', 'REAL',
	'BLOB', 'BOOLEAN', 'TIMESTAMP', 'PRAGMA', 'EXPLAIN', 'WITH', 'RECURSIVE',
	'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'IS', 'ASC', 'DESC',
	'REPLACE', 'CONFLICT', 'ABORT', 'ROLLBACK', 'IGNORE', 'BEGIN',
	'COMMIT', 'TRANSACTION', 'VACUUM',
]);

export function highlightSql(sql: string): string {
	try {
		return sql
			.replace(/\b(\w+)\b/g, (match) => {
				if (SQL_KEYWORDS.has(match.toUpperCase())) return chalk.bold.blue(match);
				return match;
			})
			.replace(/'[^']*'/g, (match) => chalk.green(match))
			.replace(/\b(\d+(?:\.\d+)?)\b/g, (match) => chalk.yellow(match));
	} catch {
		return sql;
	}
}
