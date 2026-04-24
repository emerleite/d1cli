import { createHash, createHmac } from 'crypto';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

/**
 * Replicates miniflare's durable object namespace ID computation.
 * This is how miniflare maps a D1 database_id to a SQLite filename.
 */
function durableObjectNamespaceId(uniqueKey: string, name: string): string {
	const key = createHash('sha256').update(uniqueKey).digest();
	const nameHmac = createHmac('sha256', key).update(name).digest().subarray(0, 16);
	const hmac = createHmac('sha256', key).update(nameHmac).digest().subarray(0, 16);
	return Buffer.concat([nameHmac, hmac]).toString('hex');
}

/**
 * Resolves a D1 database_id to its local SQLite file path.
 *
 * Miniflare stores D1 databases at:
 *   {persistTo}/v3/d1/miniflare-D1DatabaseObject/{hash}.sqlite
 */
export function resolveLocalD1Path(databaseId: string, persistTo?: string): string | null {
	const baseDir = persistTo || join(process.cwd(), '.wrangler', 'state');
	const d1Dir = join(baseDir, 'v3', 'd1', 'miniflare-D1DatabaseObject');

	// Try the computed hash first
	const hash = durableObjectNamespaceId('miniflare-D1DatabaseObject', databaseId);
	const computed = join(d1Dir, `${hash}.sqlite`);
	if (existsSync(computed)) return computed;

	// Fallback: look for any .sqlite file in the directory
	if (!existsSync(d1Dir)) return null;

	const sqliteFiles = readdirSync(d1Dir).filter((f) => f.endsWith('.sqlite'));
	if (sqliteFiles.length === 1) return join(d1Dir, sqliteFiles[0]);
	if (sqliteFiles.length === 0) return null;

	// Multiple files — cannot auto-resolve
	console.error(`Found ${sqliteFiles.length} SQLite files in ${d1Dir}. Use --database-id to specify.`);
	return null;
}
