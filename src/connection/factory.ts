import type { Connection } from './interface.js';
import type { CliOptions } from '../config/args.js';
import { LocalConnection } from './local.js';
import { RemoteConnection } from './remote.js';
import { resolveLocalD1Path } from './resolve-local-path.js';
import { findWranglerConfig, parseD1Bindings, type D1Binding } from '../config/wrangler.js';

function pickBinding(bindings: D1Binding[], dbName?: string, databaseId?: string): D1Binding {
	if (databaseId) {
		const found = bindings.find((b) => b.database_id === databaseId);
		if (found) return found;
		// Use the ID even if not in wrangler.toml
		return { binding: 'DB', database_name: databaseId.slice(0, 8), database_id: databaseId };
	}
	if (dbName) {
		const found = bindings.find((b) => b.database_name === dbName);
		if (!found) throw new Error(`Database "${dbName}" not found in wrangler.toml`);
		return found;
	}
	if (bindings.length === 1) return bindings[0];
	if (bindings.length === 0) throw new Error('No D1 databases found in wrangler.toml');
	throw new Error(
		`Multiple D1 databases found. Use --db to specify:\n${bindings.map((b) => `  - ${b.database_name}`).join('\n')}`
	);
}

export async function createConnection(opts: CliOptions): Promise<Connection> {
	const configPath = findWranglerConfig(opts.config);

	if (opts.remote) {
		const apiToken = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
		const accountId = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
		if (!apiToken) throw new Error('CF_API_TOKEN environment variable is required for remote mode');
		if (!accountId) throw new Error('CF_ACCOUNT_ID environment variable is required for remote mode');

		let binding: D1Binding;
		if (opts.databaseId) {
			binding = { binding: 'DB', database_name: opts.db || opts.databaseId.slice(0, 8), database_id: opts.databaseId };
		} else if (configPath) {
			const bindings = parseD1Bindings(configPath);
			binding = pickBinding(bindings, opts.db, opts.databaseId);
		} else {
			throw new Error('No wrangler.toml found and no --database-id specified');
		}

		return new RemoteConnection(accountId, binding.database_id, apiToken, binding.database_name);
	}

	// Local mode (default)
	let bindings: D1Binding[] = [];
	if (configPath) {
		bindings = parseD1Bindings(configPath);
	}

	const binding = bindings.length > 0 ? pickBinding(bindings, opts.db, opts.databaseId) : null;

	if (!binding && !opts.databaseId) {
		throw new Error('No wrangler.toml found and no --database-id specified. Cannot resolve local D1 database.');
	}

	const dbId = binding?.database_id || opts.databaseId!;
	const dbName = binding?.database_name || opts.db || dbId.slice(0, 8);
	const sqlitePath = resolveLocalD1Path(dbId, opts.persistTo);

	if (!sqlitePath) {
		throw new Error(
			`Could not find local D1 database file. Make sure you've run wrangler dev with --persist-to, or specify --persist-to.`
		);
	}

	return new LocalConnection(sqlitePath, dbName);
}
