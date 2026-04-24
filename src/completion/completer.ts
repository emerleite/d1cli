import { SQL_KEYWORDS, BACKSLASH_COMMANDS, SQLITE_FUNCTIONS } from './keywords.js';
import type { SchemaCache } from './schema-cache.js';

/**
 * Extract table names from a partial SQL query (FROM/JOIN clauses).
 */
function extractTablesFromQuery(sql: string): string[] {
	const tables: string[] = [];

	const patterns = [
		/\bFROM\s+(\w+)/gi,
		/\bJOIN\s+(\w+)/gi,
		/\bUPDATE\s+(\w+)/gi,
		/\bINTO\s+(\w+)/gi,
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(sql)) !== null) {
			tables.push(match[1]);
		}
	}

	return tables;
}

/**
 * Determine completion context from the cursor position.
 */
function getContext(line: string): 'backslash' | 'table' | 'column' | 'dot' | 'general' {
	if (line.startsWith('\\')) return 'backslash';

	const words = line.trimEnd().split(/\s+/);
	const lastWord = words[words.length - 1] || '';

	if (lastWord.includes('.')) return 'dot';

	const prevWords = words.slice(0, -1);
	for (let i = prevWords.length - 1; i >= 0; i--) {
		const w = prevWords[i].toUpperCase();
		if (['FROM', 'JOIN', 'INTO', 'TABLE', 'UPDATE'].includes(w)) return 'table';
		if (['SELECT', 'WHERE', 'SET', 'ON', 'AND', 'OR', 'BY', 'HAVING'].includes(w)) return 'column';
		if (['FROM', 'WHERE', 'SELECT', 'ORDER', 'GROUP', 'LIMIT'].includes(w)) break;
	}

	return 'general';
}

/**
 * Fuzzy match: characters of partial appear in order within candidate.
 */
function fuzzyMatch(partial: string, candidate: string): boolean {
	const p = partial.toLowerCase();
	const c = candidate.toLowerCase();
	let pi = 0;
	for (let ci = 0; ci < c.length && pi < p.length; ci++) {
		if (c[ci] === p[pi]) pi++;
	}
	return pi === p.length;
}

/**
 * Score a fuzzy match: lower is better.
 */
function fuzzyScore(partial: string, candidate: string): number {
	const p = partial.toLowerCase();
	const c = candidate.toLowerCase();

	if (c.startsWith(p)) return 0;

	let score = 0;
	let pi = 0;
	let lastMatch = -1;
	for (let ci = 0; ci < c.length && pi < p.length; ci++) {
		if (c[ci] === p[pi]) {
			score += ci - lastMatch === 1 ? 0 : ci - lastMatch;
			lastMatch = ci;
			pi++;
		}
	}
	return score + 1;
}

export function createCompleter(schemaCache: SchemaCache) {
	return function completer(line: string): [string[], string] {
		const context = getContext(line);

		if (context === 'backslash') {
			const hits = BACKSLASH_COMMANDS.filter((c) => c.startsWith(line));
			return [hits.length ? hits : BACKSLASH_COMMANDS, line];
		}

		const words = line.split(/\s+/);
		const lastWord = words[words.length - 1] || '';

		// Dot notation: table.col
		if (context === 'dot') {
			const dotIdx = lastWord.lastIndexOf('.');
			const tablePart = lastWord.slice(0, dotIdx);
			const colPartial = lastWord.slice(dotIdx + 1);

			const columns = schemaCache.getColumnNames(tablePart);
			const partial = colPartial.toUpperCase();

			let hits: string[];
			if (partial.length === 0) {
				hits = columns;
			} else {
				hits = columns.filter((c) => c.toUpperCase().startsWith(partial));
				if (hits.length === 0) {
					hits = columns.filter((c) => fuzzyMatch(colPartial, c));
				}
			}

			const isLower = colPartial === colPartial.toLowerCase();
			const results = hits.map((h) => `${tablePart}.${isLower ? h.toLowerCase() : h}`);
			return [results, lastWord];
		}

		const partial = lastWord;
		const partialUpper = partial.toUpperCase();

		let candidates: string[];
		const queryTables = extractTablesFromQuery(line);

		if (context === 'table') {
			candidates = schemaCache.getTableNames();
		} else if (context === 'column') {
			if (queryTables.length > 0) {
				const queryCols = new Set<string>();
				for (const t of queryTables) {
					for (const c of schemaCache.getColumnNames(t)) {
						queryCols.add(c);
					}
				}
				candidates = [...queryCols, ...SQLITE_FUNCTIONS, ...SQL_KEYWORDS, ...schemaCache.getTableNames()];
			} else {
				candidates = [...schemaCache.getColumnNames(), ...SQLITE_FUNCTIONS, ...SQL_KEYWORDS, ...schemaCache.getTableNames()];
			}
		} else {
			candidates = [...SQL_KEYWORDS, ...SQLITE_FUNCTIONS, ...schemaCache.getTableNames(), ...schemaCache.getColumnNames()];
		}

		candidates = [...new Set(candidates)];

		let hits = candidates.filter((c) => c.toUpperCase().startsWith(partialUpper));

		if (hits.length === 0 && partial.length >= 2) {
			hits = candidates
				.filter((c) => fuzzyMatch(partial, c))
				.sort((a, b) => fuzzyScore(partial, a) - fuzzyScore(partial, b));
		}

		const isLower = partial === partial.toLowerCase();
		const results = hits.map((h) => (isLower ? h.toLowerCase() : h));

		return [results, partial];
	};
}
