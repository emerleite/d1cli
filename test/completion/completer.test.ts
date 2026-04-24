import { describe, it, expect } from 'vitest';
import { createCompleter } from '../../src/completion/completer.js';
import type { SchemaCache } from '../../src/completion/schema-cache.js';

function makeCache(tables: string[], columnsByTable: Record<string, string[]> = {}): SchemaCache {
	return {
		getTableNames: () => tables,
		getColumnNames: (table?: string) => {
			if (table) return columnsByTable[table] || [];
			const all = new Set<string>();
			for (const cols of Object.values(columnsByTable)) {
				for (const c of cols) all.add(c);
			}
			return Array.from(all);
		},
	} as SchemaCache;
}

describe('createCompleter', () => {
	it('completes backslash commands', () => {
		const completer = createCompleter(makeCache([]));
		const [hits] = completer('\\d');
		expect(hits).toContain('\\dt');
		expect(hits).toContain('\\d');
		expect(hits).toContain('\\di');
	});

	it('completes SQL keywords', () => {
		const completer = createCompleter(makeCache([]));
		const [hits, partial] = completer('SEL');
		expect(partial).toBe('SEL');
		expect(hits).toContain('SELECT');
	});

	it('suggests tables after FROM', () => {
		const completer = createCompleter(makeCache(['users', 'messages']));
		const [hits] = completer('SELECT * FROM ');
		expect(hits).toContain('users');
		expect(hits).toContain('messages');
	});

	it('suggests tables after JOIN', () => {
		const completer = createCompleter(makeCache(['users', 'messages']));
		const [hits] = completer('SELECT * FROM users JOIN ');
		expect(hits).toContain('messages');
	});

	it('filters table suggestions by partial input', () => {
		const completer = createCompleter(makeCache(['users', 'messages']));
		const [hits] = completer('SELECT * FROM us');
		expect(hits).toContain('users');
		expect(hits).not.toContain('messages');
	});

	it('preserves lowercase when user types lowercase', () => {
		const completer = createCompleter(makeCache([]));
		const [hits] = completer('sel');
		expect(hits).toContain('select');
		expect(hits).not.toContain('SELECT');
	});

	it('preserves uppercase when user types uppercase', () => {
		const completer = createCompleter(makeCache([]));
		const [hits] = completer('SEL');
		expect(hits).toContain('SELECT');
	});

	it('includes column names in general context', () => {
		const cache = makeCache(['users'], { users: ['id', 'name', 'email'] });
		const completer = createCompleter(cache);
		const [hits] = completer('SELECT na');
		expect(hits.map((h: string) => h.toUpperCase())).toContain('NAME');
	});
});
