import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const HISTORY_PATH = join(homedir(), '.config', 'd1cli', 'history');
const MAX_HISTORY = 1000;

export function loadHistory(): string[] {
	if (!existsSync(HISTORY_PATH)) return [];
	try {
		const content = readFileSync(HISTORY_PATH, 'utf-8');
		return content.split('\n').filter(Boolean).slice(-MAX_HISTORY);
	} catch {
		return [];
	}
}

export function appendHistory(entry: string): void {
	const dir = dirname(HISTORY_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	try {
		appendFileSync(HISTORY_PATH, entry.replace(/\n/g, ' ') + '\n');
	} catch {
		// ignore write errors
	}
}
