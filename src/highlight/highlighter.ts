import chalk from 'chalk';

const KEYWORDS = new Set([
	'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
	'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
	'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
	'ON', 'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
	'UNION', 'ALL', 'DISTINCT', 'IF', 'EXISTS', 'DEFAULT', 'PRIMARY', 'KEY',
	'UNIQUE', 'FOREIGN', 'REFERENCES', 'AUTOINCREMENT', 'PRAGMA', 'EXPLAIN',
	'WITH', 'RECURSIVE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST',
	'IS', 'ASC', 'DESC', 'REPLACE', 'CONFLICT', 'ABORT', 'ROLLBACK',
	'IGNORE', 'BEGIN', 'COMMIT', 'TRANSACTION', 'VACUUM', 'CROSS',
	'USING', 'EACH', 'ROW', 'TRIGGER', 'VIEW', 'VIRTUAL',
]);

const TYPES = new Set([
	'INTEGER', 'TEXT', 'REAL', 'BLOB', 'BOOLEAN', 'TIMESTAMP', 'NULL',
]);

const FUNCTIONS = new Set([
	'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'TOTAL', 'GROUP_CONCAT',
	'ABS', 'CHAR', 'COALESCE', 'HEX', 'IFNULL', 'IIF', 'INSTR',
	'LENGTH', 'LOWER', 'LTRIM', 'NULLIF', 'PRINTF', 'QUOTE', 'RANDOM',
	'REPLACE', 'ROUND', 'RTRIM', 'SUBSTR', 'SUBSTRING', 'TRIM', 'TYPEOF',
	'UNICODE', 'UPPER', 'ZEROBLOB', 'DATE', 'TIME', 'DATETIME',
	'JULIANDAY', 'STRFTIME', 'UNIXEPOCH', 'JSON', 'JSON_EXTRACT',
	'JSON_ARRAY', 'JSON_OBJECT', 'JSON_TYPE', 'JSON_VALID',
	'LAST_INSERT_ROWID', 'CHANGES', 'TOTAL_CHANGES', 'SIGN',
]);

const OPERATORS = new Set(['=', '<>', '!=', '<', '>', '<=', '>=', '||', '+', '-', '*', '/', '%']);

interface Token {
	type: 'keyword' | 'type' | 'function' | 'string' | 'number' | 'comment' | 'operator' | 'punctuation' | 'identifier';
	value: string;
}

/**
 * Simple SQL tokenizer that produces typed tokens for highlighting.
 */
function tokenize(sql: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;

	while (i < sql.length) {
		// Whitespace — pass through as identifier
		if (/\s/.test(sql[i])) {
			let j = i;
			while (j < sql.length && /\s/.test(sql[j])) j++;
			tokens.push({ type: 'identifier', value: sql.slice(i, j) });
			i = j;
			continue;
		}

		// Single-line comment
		if (sql[i] === '-' && sql[i + 1] === '-') {
			let j = i + 2;
			while (j < sql.length && sql[j] !== '\n') j++;
			tokens.push({ type: 'comment', value: sql.slice(i, j) });
			i = j;
			continue;
		}

		// Block comment
		if (sql[i] === '/' && sql[i + 1] === '*') {
			let j = i + 2;
			while (j < sql.length - 1 && !(sql[j] === '*' && sql[j + 1] === '/')) j++;
			j += 2;
			tokens.push({ type: 'comment', value: sql.slice(i, j) });
			i = j;
			continue;
		}

		// Single-quoted string
		if (sql[i] === "'") {
			let j = i + 1;
			while (j < sql.length) {
				if (sql[j] === "'" && sql[j + 1] === "'") {
					j += 2; // escaped quote
				} else if (sql[j] === "'") {
					j++;
					break;
				} else {
					j++;
				}
			}
			tokens.push({ type: 'string', value: sql.slice(i, j) });
			i = j;
			continue;
		}

		// Number
		if (/\d/.test(sql[i]) || (sql[i] === '.' && /\d/.test(sql[i + 1] || ''))) {
			let j = i;
			while (j < sql.length && /[\d.]/.test(sql[j])) j++;
			tokens.push({ type: 'number', value: sql.slice(i, j) });
			i = j;
			continue;
		}

		// Word (keyword, function, type, or identifier)
		if (/\w/.test(sql[i])) {
			let j = i;
			while (j < sql.length && /\w/.test(sql[j])) j++;
			const word = sql.slice(i, j);
			const upper = word.toUpperCase();

			// Check if followed by ( → function
			let k = j;
			while (k < sql.length && sql[k] === ' ') k++;
			const followedByParen = sql[k] === '(';

			if (FUNCTIONS.has(upper) && followedByParen) {
				tokens.push({ type: 'function', value: word });
			} else if (TYPES.has(upper)) {
				tokens.push({ type: 'type', value: word });
			} else if (KEYWORDS.has(upper)) {
				tokens.push({ type: 'keyword', value: word });
			} else {
				tokens.push({ type: 'identifier', value: word });
			}
			i = j;
			continue;
		}

		// Operators
		if (sql[i] === '|' && sql[i + 1] === '|') {
			tokens.push({ type: 'operator', value: '||' });
			i += 2;
			continue;
		}
		if (sql[i] === '<' && sql[i + 1] === '>') {
			tokens.push({ type: 'operator', value: '<>' });
			i += 2;
			continue;
		}
		if (sql[i] === '!' && sql[i + 1] === '=') {
			tokens.push({ type: 'operator', value: '!=' });
			i += 2;
			continue;
		}
		if (sql[i] === '<' && sql[i + 1] === '=') {
			tokens.push({ type: 'operator', value: '<=' });
			i += 2;
			continue;
		}
		if (sql[i] === '>' && sql[i + 1] === '=') {
			tokens.push({ type: 'operator', value: '>=' });
			i += 2;
			continue;
		}
		if (OPERATORS.has(sql[i])) {
			tokens.push({ type: 'operator', value: sql[i] });
			i++;
			continue;
		}

		// Punctuation
		if ('(),;.'.includes(sql[i])) {
			tokens.push({ type: 'punctuation', value: sql[i] });
			i++;
			continue;
		}

		// Anything else
		tokens.push({ type: 'identifier', value: sql[i] });
		i++;
	}

	return tokens;
}

/**
 * Highlight SQL with token-based coloring.
 * Color scheme inspired by pgcli/mycli (Pygments "native" theme):
 *   Keywords:  bold green    (#6ebf26)
 *   Functions: bright blue   (#71adff)
 *   Types:     teal/cyan
 *   Strings:   yellow/orange (#ed9d13)
 *   Numbers:   cyan          (#51b2fd)
 *   Comments:  gray italic
 *   Operators: bold white
 */
export function highlightSql(sql: string): string {
	try {
		const tokens = tokenize(sql);
		return tokens
			.map((t) => {
				switch (t.type) {
					case 'keyword': return chalk.bold.green(t.value);
					case 'type': return chalk.cyan(t.value);
					case 'function': return chalk.blueBright(t.value);
					case 'string': return chalk.yellow(t.value);
					case 'number': return chalk.cyanBright(t.value);
					case 'comment': return chalk.italic.gray(t.value);
					case 'operator': return chalk.bold.white(t.value);
					default: return t.value;
				}
			})
			.join('');
	} catch {
		return sql;
	}
}
