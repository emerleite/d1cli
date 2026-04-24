import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface CliOptions {
	local: boolean;
	remote: boolean;
	persistTo?: string;
	db?: string;
	databaseId?: string;
	config?: string;
	execute?: string;
	file?: string;
	format: 'table' | 'json' | 'csv' | 'vertical';
}

export function parseArgs(argv: string[]): CliOptions {
	const program = new Command();

	let version = '0.1.0';
	try {
		const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
		version = pkg.version;
	} catch {
		// ignore
	}

	program
		.name('d1cli')
		.description('Interactive SQL REPL for Cloudflare D1 databases')
		.version(version)
		.option('--local', 'connect to local D1 database', false)
		.option('--remote', 'connect to remote D1 via Cloudflare API', false)
		.option('--persist-to <path>', 'local persistence directory (default: .wrangler/state)')
		.option('--db <name>', 'database name from wrangler.toml')
		.option('--database-id <id>', 'D1 database ID')
		.option('-c, --config <path>', 'path to wrangler.toml')
		.option('-e, --execute <sql>', 'execute SQL and exit')
		.option('-f, --file <path>', 'execute SQL file and exit')
		.option('--format <format>', 'output format: table, json, csv, vertical', 'table');

	program.parse(argv);
	const opts = program.opts();

	return {
		local: opts.local,
		remote: opts.remote,
		persistTo: opts.persistTo,
		db: opts.db,
		databaseId: opts.databaseId,
		config: opts.config,
		execute: opts.execute,
		file: opts.file,
		format: opts.format as CliOptions['format'],
	};
}
