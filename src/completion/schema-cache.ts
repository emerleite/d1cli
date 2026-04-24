import type { Connection } from '../connection/interface.js';

export class SchemaCache {
	private tables: string[] = [];
	private columnsByTable: Map<string, string[]> = new Map();
	private loaded = false;

	async refresh(conn: Connection): Promise<void> {
		this.tables = await conn.getTables();
		this.columnsByTable.clear();

		for (const table of this.tables) {
			const cols = await conn.getColumns(table);
			this.columnsByTable.set(table, cols.map((c) => c.name));
		}
		this.loaded = true;
	}

	async ensureLoaded(conn: Connection): Promise<void> {
		if (!this.loaded) await this.refresh(conn);
	}

	getTableNames(): string[] {
		return this.tables;
	}

	getColumnNames(table?: string): string[] {
		if (table) return this.columnsByTable.get(table) || [];
		const allCols = new Set<string>();
		for (const cols of this.columnsByTable.values()) {
			for (const c of cols) allCols.add(c);
		}
		return Array.from(allCols);
	}

	invalidate(): void {
		this.loaded = false;
		this.tables = [];
		this.columnsByTable.clear();
	}
}
