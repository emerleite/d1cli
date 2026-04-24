import type { QueryResult } from '../connection/interface.js';

export function formatJson(result: QueryResult): string {
	if (result.columns.length === 0) {
		return JSON.stringify({ changes: result.changes }, null, 2);
	}
	return JSON.stringify(result.rows, null, 2);
}
