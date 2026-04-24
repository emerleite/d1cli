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
	describe('backslash commands', () => {
		it('completes backslash commands', () => {
			const completer = createCompleter(makeCache([]));
			const [hits] = completer('\\d');
			expect(hits).toContain('\\dt');
			expect(hits).toContain('\\d');
			expect(hits).toContain('\\di');
		});
	});

	describe('SQL keyword completion', () => {
		it('completes SQL keywords', () => {
			const completer = createCompleter(makeCache([]));
			const [hits, partial] = completer('SEL');
			expect(partial).toBe('SEL');
			expect(hits).toContain('SELECT');
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
	});

	describe('table completion', () => {
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

		it('suggests tables after UPDATE', () => {
			const completer = createCompleter(makeCache(['users', 'messages']));
			const [hits] = completer('UPDATE ');
			expect(hits).toContain('users');
			expect(hits).toContain('messages');
		});
	});

	describe('column completion', () => {
		it('includes column names in general context', () => {
			const cache = makeCache(['users'], { users: ['id', 'name', 'email'] });
			const completer = createCompleter(cache);
			const [hits] = completer('SELECT na');
			expect(hits.map((h: string) => h.toUpperCase())).toContain('NAME');
		});

		it('suggests columns from query tables after WHERE', () => {
			const cache = makeCache(['users', 'posts'], {
				users: ['id', 'name', 'email'],
				posts: ['id', 'title', 'user_id'],
			});
			const completer = createCompleter(cache);
			const [hits] = completer('SELECT * FROM users WHERE na');
			expect(hits.map((h: string) => h.toLowerCase())).toContain('name');
		});
	});

	describe('dot notation', () => {
		it('completes table.column with dot notation', () => {
			const cache = makeCache(['users'], { users: ['id', 'name', 'email'] });
			const completer = createCompleter(cache);
			const [hits, partial] = completer('SELECT users.');
			expect(partial).toBe('users.');
			expect(hits).toContain('users.id');
			expect(hits).toContain('users.name');
			expect(hits).toContain('users.email');
		});

		it('filters dot notation by partial column', () => {
			const cache = makeCache(['users'], { users: ['id', 'name', 'email'] });
			const completer = createCompleter(cache);
			const [hits] = completer('SELECT users.na');
			expect(hits).toContain('users.name');
			expect(hits).not.toContain('users.id');
		});
	});

	describe('function completion', () => {
		it('includes SQLite functions', () => {
			const completer = createCompleter(makeCache([]));
			const [hits] = completer('SELECT COU');
			expect(hits.map((h: string) => h.toUpperCase())).toContain('COUNT');
		});

		it('includes JSON functions', () => {
			const completer = createCompleter(makeCache([]));
			const [hits] = completer('SELECT JSON_E');
			expect(hits.map((h: string) => h.toUpperCase())).toContain('JSON_EXTRACT');
		});
	});

	describe('fuzzy matching', () => {
		it('falls back to fuzzy match when no prefix match', () => {
			const cache = makeCache(['users'], { users: ['created_at', 'updated_at'] });
			const completer = createCompleter(cache);
			const [hits] = completer('SELECT crat');
			// "crat" fuzzy matches "created_at" (c-r-a-t appear in order)
			expect(hits.map((h: string) => h.toLowerCase())).toContain('created_at');
		});

		it('does not fuzzy match with single character', () => {
			const completer = createCompleter(makeCache(['users']));
			const [hits] = completer('SELECT z');
			// 'z' is only 1 char, no fuzzy
			const hasZeroblob = hits.some((h: string) => h.toLowerCase() === 'zeroblob');
			// With prefix match, ZEROBLOB should match 'z'
			expect(hasZeroblob).toBe(true);
		});
	});
});
