import { SQL_KEYWORDS, SQLITE_FUNCTIONS, COMMANDS, OUTPUT_FORMATS } from './keywords.js';
import type { SchemaCache } from './schema-cache.js';

export type CompletionType = 'keyword' | 'table' | 'column' | 'function' | 'command';

export interface CompletionItem {
	text: string;
	type: CompletionType;
	description?: string;
}

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

function applyCase(text: string, isLower: boolean): string {
	return isLower ? text.toLowerCase() : text;
}

export function createCompleter(schemaCache: SchemaCache) {
	/**
	 * Returns [completionTexts, partial] for readline compatibility,
	 * plus stores metadata for rich display via getLastCompletions().
	 */
	let lastCompletions: CompletionItem[] = [];

	function completeBackslash(line: string): [string[], string] {
		const parts = line.split(/\s+/);
		const cmd = parts[0];
		const hasArg = parts.length > 1;
		const argPartial = hasArg ? parts.slice(1).join(' ') : '';

		// If we have a complete command and a space, suggest arguments
		if (hasArg) {
			const cmdInfo = COMMANDS.find((c) => c.name === cmd);
			if (cmdInfo) {
				let items: CompletionItem[] = [];

				if (cmdInfo.args === 'table') {
					const tables = schemaCache.getTableNames();
					const partial = argPartial.toLowerCase();
					const filtered = partial ? tables.filter((t) => t.toLowerCase().startsWith(partial)) : tables;
					items = filtered.map((t) => ({ text: t, type: 'table' as CompletionType }));
				} else if (cmdInfo.args === 'format') {
					const partial = argPartial.toLowerCase();
					const filtered = partial ? OUTPUT_FORMATS.filter((f) => f.startsWith(partial)) : OUTPUT_FORMATS;
					items = filtered.map((f) => ({ text: f, type: 'keyword' as CompletionType }));
				}

				lastCompletions = items;
				return [items.map((i) => i.text), argPartial];
			}
		}

		// Complete the command itself, with descriptions
		const partial = line;
		const hits = COMMANDS.filter((c) => c.name.startsWith(partial));
		const commands = hits.length ? hits : COMMANDS;
		const items = commands.map((c) => ({ text: c.name, type: 'command' as CompletionType, description: c.description }));
		lastCompletions = items;
		return [items.map((i) => i.text), partial];
	}

	function completer(line: string): [string[], string] {
		const context = getContext(line);

		if (context === 'backslash') {
			return completeBackslash(line);
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
			const items = hits.map((h) => ({ text: `${tablePart}.${applyCase(h, isLower)}`, type: 'column' as CompletionType }));
			lastCompletions = items;
			return [items.map((i) => i.text), lastWord];
		}

		const partial = lastWord;
		const partialUpper = partial.toUpperCase();
		const isLower = partial === partial.toLowerCase();

		let candidates: CompletionItem[];
		const queryTables = extractTablesFromQuery(line);

		if (context === 'table') {
			candidates = schemaCache.getTableNames().map((t) => ({ text: t, type: 'table' as CompletionType }));
		} else if (context === 'column') {
			// After SELECT/WHERE/etc: columns, tables, functions — no keywords
			const items: CompletionItem[] = [];
			if (queryTables.length > 0) {
				const seen = new Set<string>();
				for (const t of queryTables) {
					for (const c of schemaCache.getColumnNames(t)) {
						if (!seen.has(c)) {
							seen.add(c);
							items.push({ text: c, type: 'column' });
						}
					}
				}
			} else {
				for (const c of schemaCache.getColumnNames()) {
					items.push({ text: c, type: 'column' });
				}
			}
			for (const t of schemaCache.getTableNames()) items.push({ text: t, type: 'table' });
			for (const f of SQLITE_FUNCTIONS) items.push({ text: f, type: 'function' });
			candidates = items;
		} else {
			candidates = [
				...SQL_KEYWORDS.map((k) => ({ text: k, type: 'keyword' as CompletionType })),
				...SQLITE_FUNCTIONS.map((f) => ({ text: f, type: 'function' as CompletionType })),
				...schemaCache.getTableNames().map((t) => ({ text: t, type: 'table' as CompletionType })),
				...schemaCache.getColumnNames().map((c) => ({ text: c, type: 'column' as CompletionType })),
			];
		}

		// Deduplicate by text
		const seen = new Set<string>();
		candidates = candidates.filter((c) => {
			const key = c.text.toUpperCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});

		// Prefix match first
		let hits = candidates.filter((c) => c.text.toUpperCase().startsWith(partialUpper));

		// Fuzzy fallback
		if (hits.length === 0 && partial.length >= 2) {
			hits = candidates
				.filter((c) => fuzzyMatch(partial, c.text))
				.sort((a, b) => fuzzyScore(partial, a.text) - fuzzyScore(partial, b.text));
		}

		// Apply case
		const results = hits.map((h) => ({ ...h, text: applyCase(h.text, isLower) }));
		lastCompletions = results;

		return [results.map((r) => r.text), partial];
	}

	completer.getLastCompletions = (): CompletionItem[] => lastCompletions;

	return completer;
}
