import { describe, it, expect } from 'vitest';
import { formatJson } from '../../src/output/json.js';
import type { QueryResult } from '../../src/connection/interface.js';

function makeResult(columns: string[], rows: Record<string, unknown>[], changes = 0): QueryResult {
	return { columns, rows, rowCount: rows.length, changes, duration: 0 };
}

describe('formatJson', () => {
	it('formats rows as JSON array', () => {
		const result = makeResult(['id', 'name'], [{ id: 1, name: 'Alice' }]);
		const parsed = JSON.parse(formatJson(result));
		expect(parsed).toEqual([{ id: 1, name: 'Alice' }]);
	});

	it('formats write-only result with changes count', () => {
		const result = makeResult([], [], 5);
		const parsed = JSON.parse(formatJson(result));
		expect(parsed).toEqual({ changes: 5 });
	});

	it('handles null values', () => {
		const result = makeResult(['a'], [{ a: null }]);
		const parsed = JSON.parse(formatJson(result));
		expect(parsed).toEqual([{ a: null }]);
	});

	it('formats empty result set as empty array', () => {
		const result = makeResult(['id'], []);
		const parsed = JSON.parse(formatJson(result));
		expect(parsed).toEqual([]);
	});

	it('outputs pretty-printed JSON', () => {
		const result = makeResult(['id'], [{ id: 1 }]);
		const output = formatJson(result);
		expect(output).toContain('\n');
		expect(output).toContain('  ');
	});
});
