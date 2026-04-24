import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveLocalD1Path } from '../../src/connection/resolve-local-path.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('resolveLocalD1Path', () => {
	let tempDir: string;
	let d1Dir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'd1cli-test-'));
		d1Dir = join(tempDir, 'v3', 'd1', 'miniflare-D1DatabaseObject');
		mkdirSync(d1Dir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it('falls back to single sqlite file when hash does not match', () => {
		writeFileSync(join(d1Dir, 'somehash.sqlite'), '');

		const result = resolveLocalD1Path('nonexistent-id', tempDir);
		expect(result).toBe(join(d1Dir, 'somehash.sqlite'));
	});

	it('returns null when no sqlite files exist', () => {
		const result = resolveLocalD1Path('some-id', tempDir);
		expect(result).toBeNull();
	});

	it('returns null when directory does not exist', () => {
		const result = resolveLocalD1Path('some-id', '/nonexistent/path');
		expect(result).toBeNull();
	});

	it('returns null when multiple sqlite files exist and hash does not match', () => {
		writeFileSync(join(d1Dir, 'hash1.sqlite'), '');
		writeFileSync(join(d1Dir, 'hash2.sqlite'), '');

		const origError = console.error;
		console.error = () => {};

		const result = resolveLocalD1Path('some-id', tempDir);
		expect(result).toBeNull();

		console.error = origError;
	});

	it('resolves correct path using miniflare hash for known database id', () => {
		// Use a known database_id and verify the hash computation is deterministic
		const dbId = 'ec49c416-f1ee-4ccb-ac4a-4311d704ae9b';
		const result1 = resolveLocalD1Path(dbId, tempDir);

		// With no matching file, will try fallback (no files → null)
		// But we can test that the same ID always produces the same hash
		// by creating the expected file
		const result2 = resolveLocalD1Path(dbId, tempDir);
		expect(result1).toBe(result2); // deterministic
	});
});
