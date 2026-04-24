import { describe, it, expect } from 'vitest';
import { formatVertical } from '../../src/output/vertical.js';
import type { QueryResult } from '../../src/connection/interface.js';

function makeResult(columns: string[], rows: Record<string, unknown>[], changes = 0): QueryResult {
	return { columns, rows, rowCount: rows.length, changes, duration: 0 };
}

function stripAnsi(str: string): string {
	return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatVertical', () => {
	it('renders a single row with aligned keys', () => {
		const result = makeResult(['id', 'name'], [{ id: 1, name: 'Alice' }]);
		const output = stripAnsi(formatVertical(result));
		expect(output).toContain('1. row');
		expect(output).toContain('id: 1');
		expect(output).toContain('name: Alice');
		expect(output).toContain('(1 row)');
	});

	it('renders multiple rows with separators', () => {
		const result = makeResult(['id'], [{ id: 1 }, { id: 2 }]);
		const output = stripAnsi(formatVertical(result));
		expect(output).toContain('1. row');
		expect(output).toContain('2. row');
		expect(output).toContain('(2 rows)');
	});

	it('shows NULL for null values', () => {
		const result = makeResult(['a'], [{ a: null }]);
		const output = stripAnsi(formatVertical(result));
		expect(output).toContain('NULL');
	});

	it('right-aligns keys to longest column name', () => {
		const result = makeResult(['id', 'long_name'], [{ id: 1, long_name: 'test' }]);
		const output = stripAnsi(formatVertical(result));
		// 'id' should be padded to match 'long_name' length
		expect(output).toContain('       id: 1');
		expect(output).toContain('long_name: test');
	});

	it('shows changes for write operations', () => {
		const result = makeResult([], [], 5);
		const output = stripAnsi(formatVertical(result));
		expect(output).toContain('5 row(s) changed');
	});
});
