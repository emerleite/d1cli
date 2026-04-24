import { describe, it, expect, beforeEach } from 'vitest';
import { InputAccumulator } from '../../src/repl/input.js';

describe('InputAccumulator', () => {
	let acc: InputAccumulator;

	beforeEach(() => {
		acc = new InputAccumulator();
	});

	it('returns completed SQL for single-line with semicolon', () => {
		const result = acc.append('SELECT 1;');
		expect(result).toBe('SELECT 1;');
	});

	it('returns null for incomplete SQL (no semicolon)', () => {
		const result = acc.append('SELECT 1');
		expect(result).toBeNull();
		expect(acc.isAccumulating()).toBe(true);
	});

	it('accumulates multi-line SQL', () => {
		expect(acc.append('SELECT *')).toBeNull();
		expect(acc.append('FROM messages')).toBeNull();
		const result = acc.append('WHERE id = 1;');
		expect(result).toBe('SELECT *\nFROM messages\nWHERE id = 1;');
	});

	it('does not terminate on semicolon inside single-quoted string', () => {
		expect(acc.append("SELECT 'hello;world'")).toBeNull();
		const result = acc.append(';');
		expect(result).toBe("SELECT 'hello;world'\n;");
	});

	it('does not terminate on semicolon inside double-quoted identifier', () => {
		expect(acc.append('SELECT "col;name"')).toBeNull();
		const result = acc.append('FROM t;');
		expect(result).toBe('SELECT "col;name"\nFROM t;');
	});

	it('returns null for empty input', () => {
		const result = acc.append('');
		expect(result).toBeNull();
	});

	it('returns null for whitespace-only input', () => {
		const result = acc.append('   ');
		expect(result).toBeNull();
	});

	it('resets accumulated buffer', () => {
		acc.append('SELECT');
		expect(acc.isAccumulating()).toBe(true);
		acc.reset();
		expect(acc.isAccumulating()).toBe(false);
	});

	it('handles semicolon with trailing whitespace', () => {
		const result = acc.append('SELECT 1;  ');
		expect(result).toBe('SELECT 1;');
	});

	it('handles multiple statements (first semicolon completes)', () => {
		const result = acc.append('SELECT 1; SELECT 2;');
		expect(result).toBe('SELECT 1; SELECT 2;');
	});
});
