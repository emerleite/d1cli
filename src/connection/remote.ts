import type { Connection, QueryResult, ColumnInfo, IndexInfo } from './interface.js';

interface D1ApiResponse {
	success: boolean;
	errors: { message: string }[];
	result: {
		results: Record<string, unknown>[];
		meta: {
			changes: number;
			rows_read: number;
			rows_written: number;
			size_after: number;
			duration: number;
		};
	}[];
}

export class RemoteConnection implements Connection {
	readonly mode = 'remote' as const;
	readonly databaseName: string;
	private accountId: string;
	private databaseId: string;
	private apiToken: string;

	constructor(accountId: string, databaseId: string, apiToken: string, databaseName: string) {
		this.accountId = accountId;
		this.databaseId = databaseId;
		this.apiToken = apiToken;
		this.databaseName = databaseName;
	}

	private async query(sql: string): Promise<D1ApiResponse> {
		const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ sql }),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`D1 API error (${response.status}): ${text}`);
		}

		return response.json() as Promise<D1ApiResponse>;
	}

	async execute(sql: string): Promise<QueryResult> {
		const start = performance.now();
		const response = await this.query(sql);

		if (!response.success) {
			throw new Error(`D1 query failed: ${response.errors.map((e) => e.message).join(', ')}`);
		}

		const result = response.result[0];
		const rows = result.results || [];
		const duration = performance.now() - start;
		const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

		return {
			columns,
			rows,
			rowCount: rows.length,
			changes: result.meta?.changes || 0,
			duration,
			meta: {
				rows_read: result.meta?.rows_read,
				rows_written: result.meta?.rows_written,
				size_after: result.meta?.size_after,
			},
		};
	}

	async getTables(): Promise<string[]> {
		const result = await this.execute(
			`SELECT name FROM sqlite_master
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
			ORDER BY name`
		);
		return result.rows.map((r) => r.name as string);
	}

	async getColumns(table: string): Promise<ColumnInfo[]> {
		const result = await this.execute(`PRAGMA table_info("${table}")`);
		return result.rows.map((r) => ({
			name: r.name as string,
			type: r.type as string,
			notnull: r.notnull === 1,
			dflt_value: r.dflt_value as string | null,
			pk: (r.pk as number) > 0,
		}));
	}

	async getIndexes(table?: string): Promise<IndexInfo[]> {
		const indexes: IndexInfo[] = [];

		if (table) {
			const idxResult = await this.execute(`PRAGMA index_list("${table}")`);
			for (const idx of idxResult.rows) {
				const colResult = await this.execute(`PRAGMA index_info("${idx.name}")`);
				indexes.push({
					name: idx.name as string,
					table,
					unique: idx.unique === 1,
					columns: colResult.rows.map((c) => c.name as string),
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
		// No persistent connection to close
	}
}
