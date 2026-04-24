import Database from 'better-sqlite3';
import type { Connection, QueryResult, ColumnInfo, IndexInfo } from './interface.js';

export class LocalConnection implements Connection {
	readonly mode = 'local' as const;
	readonly databaseName: string;
	private db: Database.Database;

	constructor(sqlitePath: string, databaseName: string) {
		this.databaseName = databaseName;
		this.db = new Database(sqlitePath, { readonly: false });
		this.db.pragma('journal_mode = WAL');
	}

	async execute(sql: string): Promise<QueryResult> {
		const start = performance.now();
		const trimmed = sql.trim();
		const isRead = /^(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(trimmed);

		if (isRead) {
			const stmt = this.db.prepare(trimmed);
			const rows = stmt.all() as Record<string, unknown>[];
			const duration = performance.now() - start;
			const columns = rows.length > 0 ? Object.keys(rows[0]) : stmt.columns().map((c) => c.name);
			return { columns, rows, rowCount: rows.length, changes: 0, duration };
		}

		const info = this.db.prepare(trimmed).run();
		const duration = performance.now() - start;
		return { columns: [], rows: [], rowCount: 0, changes: info.changes, duration };
	}

	async getTables(): Promise<string[]> {
		const rows = this.db
			.prepare(`SELECT name FROM sqlite_master
				WHERE type='table'
					AND name NOT LIKE '_cf_%'
					AND name NOT LIKE 'sqlite_%'
					AND name NOT IN (
						SELECT name || '_content' FROM sqlite_master WHERE type='table' AND sql LIKE '%fts%'
						UNION SELECT name || '_data' FROM sqlite_master WHERE type='table' AND sql LIKE '%fts%'
						UNION SELECT name || '_docsize' FROM sqlite_master WHERE type='table' AND sql LIKE '%fts%'
						UNION SELECT name || '_idx' FROM sqlite_master WHERE type='table' AND sql LIKE '%fts%'
						UNION SELECT name || '_config' FROM sqlite_master WHERE type='table' AND sql LIKE '%fts%'
					)
				ORDER BY name`)
			.all() as { name: string }[];
		return rows.map((r) => r.name);
	}

	async getColumns(table: string): Promise<ColumnInfo[]> {
		const rows = this.db.prepare(`PRAGMA table_info("${table}")`).all() as {
			name: string;
			type: string;
			notnull: number;
			dflt_value: string | null;
			pk: number;
		}[];
		return rows.map((r) => ({
			name: r.name,
			type: r.type,
			notnull: r.notnull === 1,
			dflt_value: r.dflt_value,
			pk: r.pk > 0,
		}));
	}

	async getIndexes(table?: string): Promise<IndexInfo[]> {
		const indexes: IndexInfo[] = [];

		if (table) {
			const idxList = this.db.prepare(`PRAGMA index_list("${table}")`).all() as {
				name: string;
				unique: number;
			}[];
			for (const idx of idxList) {
				const cols = this.db.prepare(`PRAGMA index_info("${idx.name}")`).all() as { name: string }[];
				indexes.push({
					name: idx.name,
					table,
					unique: idx.unique === 1,
					columns: cols.map((c) => c.name),
				});
			}
		} else {
			const tables = await this.getTables();
			for (const t of tables) {
				const tableIndexes = await this.getIndexes(t);
				indexes.push(...tableIndexes);
			}
		}

		return indexes;
	}

	async close(): Promise<void> {
		this.db.close();
	}
}
