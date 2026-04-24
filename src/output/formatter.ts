import type { QueryResult } from '../connection/interface.js';
import { formatTable } from './table.js';
import { formatJson } from './json.js';
import { formatCsv } from './csv.js';
import { formatVertical } from './vertical.js';

export type OutputFormat = 'table' | 'json' | 'csv' | 'vertical';

export function formatResult(result: QueryResult, format: OutputFormat): string {
	switch (format) {
		case 'table':
			return formatTable(result);
		case 'json':
			return formatJson(result);
		case 'csv':
			return formatCsv(result);
		case 'vertical':
			return formatVertical(result);
	}
}
