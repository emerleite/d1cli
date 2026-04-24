import { describe, it, expect } from 'vitest';
import { formatCsv } from '../../src/output/csv.js';
import type { QueryResult } from '../../src/connection/interface.js';

function makeResult(columns: string[], rows: Record<string, unknown>[]): QueryResult {
	return { columns, rows, rowCount: rows.length, changes: 0, duration: 0 };
}

describe('formatCsv', () => {
	it('formats basic rows with header', () => {
		const result = makeResult(['id', 'name'], [
			{ id: 1, name: 'Alice' },
			{ id: 2, name: 'Bob' },
		]);
		expect(formatCsv(result)).toBe('id,name\n1,Alice\n2,Bob');
	});

	it('escapes values containing commas', () => {
		const result = makeResult(['name'], [{ name: 'Doe, John' }]);
		expect(formatCsv(result)).toBe('name\n"Doe, John"');
	});

	it('escapes values containing double quotes', () => {
		const result = makeResult(['name'], [{ name: 'say "hello"' }]);
		expect(formatCsv(result)).toBe('name\n"say ""hello"""');
	});

	it('escapes values containing newlines', () => {
		const result = makeResult(['text'], [{ text: 'line1\nline2' }]);
		expect(formatCsv(result)).toBe('text\n"line1\nline2"');
	});

	it('handles null and undefined as empty strings', () => {
		const result = makeResult(['a', 'b'], [{ a: null, b: undefined }]);
		expect(formatCsv(result)).toBe('a,b\n,');
	});

	it('returns empty string for no columns', () => {
		const result = makeResult([], []);
		expect(formatCsv(result)).toBe('');
	});

	it('returns header only for no rows', () => {
		const result = makeResult(['id', 'name'], []);
		expect(formatCsv(result)).toBe('id,name');
	});
});
