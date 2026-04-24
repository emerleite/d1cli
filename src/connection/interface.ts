export interface ColumnInfo {
	name: string;
	type: string;
	notnull: boolean;
	dflt_value: string | null;
	pk: boolean;
}

export interface IndexInfo {
	name: string;
	table: string;
	unique: boolean;
	columns: string[];
}

export interface QueryResult {
	columns: string[];
	rows: Record<string, unknown>[];
	rowCount: number;
	changes: number;
	duration: number;
	meta?: {
		rows_read?: number;
		rows_written?: number;
		size_after?: number;
	};
}

export interface Connection {
	readonly mode: 'local' | 'remote';
	readonly databaseName: string;

	execute(sql: string): Promise<QueryResult>;
	getTables(): Promise<string[]>;
	getColumns(table: string): Promise<ColumnInfo[]>;
	getIndexes(table?: string): Promise<IndexInfo[]>;
	close(): Promise<void>;
}
