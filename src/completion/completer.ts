import { SQL_KEYWORDS, BACKSLASH_COMMANDS } from './keywords.js';
import type { SchemaCache } from './schema-cache.js';

export function createCompleter(schemaCache: SchemaCache) {
	return function completer(line: string): [string[], string] {
		// Backslash commands
		if (line.startsWith('\\')) {
			const hits = BACKSLASH_COMMANDS.filter((c) => c.startsWith(line));
			return [hits.length ? hits : BACKSLASH_COMMANDS, line];
		}

		// Get the last word being typed
		const words = line.split(/\s+/);
		const partial = words[words.length - 1] || '';
		const partialUpper = partial.toUpperCase();

		// Context: after FROM/JOIN/INTO/TABLE/UPDATE → suggest tables
		const prevWords = words.slice(0, -1).map((w) => w.toUpperCase());
		const lastKeyword = prevWords.reverse().find((w) =>
			['FROM', 'JOIN', 'INTO', 'TABLE', 'UPDATE', 'DESCRIBE'].includes(w)
		);

		let candidates: string[];

		if (lastKeyword && ['FROM', 'JOIN', 'INTO', 'TABLE', 'UPDATE'].includes(lastKeyword)) {
			candidates = schemaCache.getTableNames();
		} else {
			// Mix of keywords, tables, and columns
			candidates = [
				...SQL_KEYWORDS,
				...schemaCache.getTableNames(),
				...schemaCache.getColumnNames(),
			];
		}

		const hits = candidates.filter((c) => c.toUpperCase().startsWith(partialUpper));

		// Match case: if user types lowercase, return lowercase
		const isLower = partial === partial.toLowerCase();
		const results = hits.map((h) => (isLower ? h.toLowerCase() : h));

		return [results, partial];
	};
}
