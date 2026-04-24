import { describe, it, expect } from 'vitest';
import { formatTable } from '../../src/output/table.js';
import type { QueryResult } from '../../src/connection/interface.js';

function makeResult(columns: string[], rows: Record<string, unknown>[], changes = 0): QueryResult {
	return { columns, rows, rowCount: rows.length, changes, duration: 0 };
}

// Strip ANSI codes for assertion
function stripAnsi(str: string): string {
	return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatTable', () => {
	it('renders a basic table with rows', () => {
		const result = makeResult(['id', 'name'], [{ id: 1, name: 'Alice' }]);
		const output = stripAnsi(formatTable(result));
		expect(output).toContain('id');
		expect(output).toContain('name');
		expect(output).toContain('1');
		expect(output).toContain('Alice');
		expect(output).toContain('(1 row)');
	});

	it('shows plural row count', () => {
		const result = makeResult(['id'], [{ id: 1 }, { id: 2 }]);
		const output = stripAnsi(formatTable(result));
		expect(output).toContain('(2 rows)');
	});

	it('shows NULL for null values', () => {
		const result = makeResult(['a'], [{ a: null }]);
		const output = stripAnsi(formatTable(result));
		expect(output).toContain('NULL');
	});

	it('truncates long values', () => {
		const longVal = 'x'.repeat(100);
		const result = makeResult(['a'], [{ a: longVal }]);
		const output = stripAnsi(formatTable(result));
		expect(output).toContain('...');
		expect(output).not.toContain(longVal);
	});

	it('shows changes message for write operations', () => {
		const result = makeResult([], [], 3);
		const output = stripAnsi(formatTable(result));
		expect(output).toContain('3 row(s) changed');
	});

	it('shows OK for write with 0 changes', () => {
		const result = makeResult([], [], 0);
		const output = stripAnsi(formatTable(result));
		expect(output).toContain('OK');
	});
});
