import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseD1Bindings, findWranglerConfig } from '../../src/config/wrangler.js';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';

describe('parseD1Bindings', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'd1cli-test-'));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it('parses TOML config with D1 bindings', () => {
		const tomlPath = path.join(tempDir, 'wrangler.toml');
		writeFileSync(
			tomlPath,
			`
[[d1_databases]]
binding = "DB"
database_name = "mydb"
database_id = "abc-123"

[[d1_databases]]
binding = "DB2"
database_name = "mydb2"
database_id = "def-456"
`
		);

		const bindings = parseD1Bindings(tomlPath);
		expect(bindings).toHaveLength(2);
		expect(bindings[0]).toEqual({ binding: 'DB', database_name: 'mydb', database_id: 'abc-123' });
		expect(bindings[1]).toEqual({ binding: 'DB2', database_name: 'mydb2', database_id: 'def-456' });
	});

	it('parses JSON config', () => {
		const jsonPath = path.join(tempDir, 'wrangler.json');
		writeFileSync(
			jsonPath,
			JSON.stringify({
				d1_databases: [{ binding: 'DB', database_name: 'mydb', database_id: 'abc-123' }],
			})
		);

		const bindings = parseD1Bindings(jsonPath);
		expect(bindings).toHaveLength(1);
		expect(bindings[0].database_name).toBe('mydb');
	});

	it('parses JSONC config with comments', () => {
		const jsoncPath = path.join(tempDir, 'wrangler.jsonc');
		writeFileSync(
			jsoncPath,
			`{
  // This is a comment
  "d1_databases": [
    /* block comment */
    { "binding": "DB", "database_name": "mydb", "database_id": "abc-123" }
  ]
}`
		);

		const bindings = parseD1Bindings(jsoncPath);
		expect(bindings).toHaveLength(1);
		expect(bindings[0].database_name).toBe('mydb');
	});

	it('returns empty array when d1_databases is missing', () => {
		const tomlPath = path.join(tempDir, 'wrangler.toml');
		writeFileSync(tomlPath, 'name = "my-worker"');

		const bindings = parseD1Bindings(tomlPath);
		expect(bindings).toEqual([]);
	});
});

describe('findWranglerConfig', () => {
	it('returns explicit config path if it exists', () => {
		const tempDir = mkdtempSync(path.join(tmpdir(), 'd1cli-test-'));
		const configPath = path.join(tempDir, 'wrangler.toml');
		writeFileSync(configPath, '');

		expect(findWranglerConfig(configPath)).toBe(configPath);
		rmSync(tempDir, { recursive: true, force: true });
	});

	it('returns null for non-existent explicit path', () => {
		expect(findWranglerConfig('/nonexistent/wrangler.toml')).toBeNull();
	});
});
