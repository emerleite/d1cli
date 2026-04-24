import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parse } from 'smol-toml';

export interface D1Binding {
	binding: string;
	database_name: string;
	database_id: string;
}

export function findWranglerConfig(configPath?: string): string | null {
	if (configPath) {
		return existsSync(configPath) ? configPath : null;
	}

	const candidates = ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json'];
	for (const name of candidates) {
		const fullPath = join(process.cwd(), name);
		if (existsSync(fullPath)) return fullPath;
	}
	return null;
}

export function parseD1Bindings(configPath: string): D1Binding[] {
	const content = readFileSync(configPath, 'utf-8');

	if (configPath.endsWith('.json') || configPath.endsWith('.jsonc')) {
		const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
		const config = JSON.parse(cleaned);
		return (config.d1_databases || []).map((db: Record<string, string>) => ({
			binding: db.binding,
			database_name: db.database_name,
			database_id: db.database_id,
		}));
	}

	const config = parse(content) as Record<string, unknown>;
	const databases = (config.d1_databases || []) as Record<string, string>[];
	return databases.map((db) => ({
		binding: db.binding,
		database_name: db.database_name,
		database_id: db.database_id,
	}));
}

export interface WranglerAuth {
	oauthToken: string;
	expirationTime: string;
}

/**
 * Read wrangler's local OAuth token from `wrangler login`.
 * Wrangler stores it at:
 *   macOS:   ~/Library/Preferences/.wrangler/config/default.toml
 *   Linux:   ~/.config/.wrangler/config/default.toml
 *   Windows: %APPDATA%/.wrangler/config/default.toml
 */
export function readWranglerAuth(): WranglerAuth | null {
	const candidates = [
		join(homedir(), 'Library', 'Preferences', '.wrangler', 'config', 'default.toml'),
		join(homedir(), '.config', '.wrangler', 'config', 'default.toml'),
		join(homedir(), '.wrangler', 'config', 'default.toml'),
	];

	for (const path of candidates) {
		if (!existsSync(path)) continue;
		try {
			const content = readFileSync(path, 'utf-8');
			const config = parse(content) as Record<string, unknown>;
			const token = config.oauth_token as string | undefined;
			const expiry = config.expiration_time as string | undefined;
			if (token) {
				return { oauthToken: token, expirationTime: expiry || '' };
			}
		} catch {
			continue;
		}
	}
	return null;
}
