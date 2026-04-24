export const SQL_KEYWORDS = [
	'ABORT', 'ACTION', 'ADD', 'AFTER', 'ALL', 'ALTER', 'AND', 'AS', 'ASC',
	'AUTOINCREMENT', 'BEFORE', 'BEGIN', 'BETWEEN', 'BLOB', 'BOOLEAN', 'BY',
	'CASCADE', 'CASE', 'CAST', 'CHECK', 'COLLATE', 'COLUMN', 'COMMIT',
	'CONFLICT', 'CONSTRAINT', 'CREATE', 'CROSS', 'CURRENT_DATE',
	'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'DATABASE', 'DEFAULT', 'DELETE',
	'DESC', 'DISTINCT', 'DROP', 'EACH', 'ELSE', 'END', 'ESCAPE', 'EXCEPT',
	'EXISTS', 'EXPLAIN', 'FOREIGN', 'FROM', 'FULL', 'GLOB', 'GROUP',
	'HAVING', 'IF', 'IGNORE', 'IN', 'INDEX', 'INNER', 'INSERT', 'INTEGER',
	'INTERSECT', 'INTO', 'IS', 'JOIN', 'KEY', 'LEFT', 'LIKE', 'LIMIT',
	'NOT', 'NULL', 'OFFSET', 'ON', 'OR', 'ORDER', 'OUTER', 'PRAGMA',
	'PRIMARY', 'REAL', 'RECURSIVE', 'REFERENCES', 'REPLACE', 'RESTRICT',
	'RIGHT', 'ROLLBACK', 'ROW', 'SELECT', 'SET', 'TABLE', 'TEXT', 'THEN',
	'TRANSACTION', 'TRIGGER', 'UNION', 'UNIQUE', 'UPDATE', 'USING',
	'VACUUM', 'VALUES', 'VIEW', 'VIRTUAL', 'WHEN', 'WHERE', 'WITH',
];

export const SQLITE_FUNCTIONS = [
	// Aggregate
	'AVG', 'COUNT', 'GROUP_CONCAT', 'MAX', 'MIN', 'SUM', 'TOTAL',
	// Scalar
	'ABS', 'CHANGES', 'CHAR', 'COALESCE', 'GLOB', 'HEX', 'IFNULL',
	'IIF', 'INSTR', 'LAST_INSERT_ROWID', 'LENGTH', 'LIKE', 'LIKELIHOOD',
	'LIKELY', 'LOWER', 'LTRIM', 'NULLIF', 'PRINTF', 'QUOTE', 'RANDOM',
	'RANDOMBLOB', 'REPLACE', 'ROUND', 'RTRIM', 'SIGN', 'SOUNDEX',
	'SUBSTR', 'SUBSTRING', 'TOTAL_CHANGES', 'TRIM', 'TYPEOF',
	'UNICODE', 'UNLIKELY', 'UPPER', 'ZEROBLOB',
	// Date/time
	'DATE', 'TIME', 'DATETIME', 'JULIANDAY', 'STRFTIME', 'UNIXEPOCH',
	// JSON
	'JSON', 'JSON_ARRAY', 'JSON_ARRAY_LENGTH', 'JSON_EXTRACT',
	'JSON_INSERT', 'JSON_OBJECT', 'JSON_PATCH', 'JSON_REMOVE',
	'JSON_REPLACE', 'JSON_SET', 'JSON_TYPE', 'JSON_VALID',
	'JSON_GROUP_ARRAY', 'JSON_GROUP_OBJECT', 'JSON_EACH', 'JSON_TREE',
];

export interface CommandInfo {
	name: string;
	description: string;
	args?: 'table' | 'index' | 'format' | 'none';
}

export const COMMANDS: CommandInfo[] = [
	{ name: '\\dt', description: 'List tables', args: 'none' },
	{ name: '\\d', description: 'Describe table', args: 'table' },
	{ name: '\\di', description: 'List indexes', args: 'table' },
	{ name: '\\schema', description: 'Show CREATE statement', args: 'table' },
	{ name: '\\T', description: 'Set output format', args: 'format' },
	{ name: '\\timing', description: 'Toggle query timing', args: 'none' },
	{ name: '\\x', description: 'Toggle expanded output', args: 'none' },
	{ name: '\\?', description: 'Show help', args: 'none' },
	{ name: '\\help', description: 'Show help', args: 'none' },
	{ name: '\\q', description: 'Quit', args: 'none' },
];

export const BACKSLASH_COMMANDS = COMMANDS.map((c) => c.name);

export const OUTPUT_FORMATS = ['table', 'json', 'csv', 'vertical'];
