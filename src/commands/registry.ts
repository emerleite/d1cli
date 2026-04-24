import type { Connection } from '../connection/interface.js';
import type { OutputFormat } from '../output/formatter.js';
import { handleTables } from './tables.js';
import { handleDescribe } from './describe.js';
import { handleIndexes } from './indexes.js';
import { handleSchema } from './schema.js';
import { handleHelp } from './help.js';

export interface CommandContext {
	conn: Connection;
	format: OutputFormat;
	timing: boolean;
	expanded: boolean;
	setFormat: (f: OutputFormat) => void;
	setTiming: (t: boolean) => void;
	setExpanded: (e: boolean) => void;
}

export interface CommandResult {
	output?: string;
	quit?: boolean;
}

export async function handleCommand(input: string, ctx: CommandContext): Promise<CommandResult> {
	const trimmed = input.trim();
	const parts = trimmed.split(/\s+/);
	const cmd = parts[0].toLowerCase();
	const arg = parts.slice(1).join(' ');

	switch (cmd) {
		case '\\dt':
			return { output: await handleTables(ctx) };

		case '\\d':
			if (!arg) return { output: 'Usage: \\d <table_name>' };
			return { output: await handleDescribe(arg, ctx) };

		case '\\di':
			return { output: await handleIndexes(arg || undefined, ctx) };

		case '\\schema':
			if (!arg) return { output: 'Usage: \\schema <table_name>' };
			return { output: await handleSchema(arg, ctx) };

		case '\\t':
		case '\\T': {
			const validFormats: OutputFormat[] = ['table', 'json', 'csv', 'vertical'];
			if (!arg || !validFormats.includes(arg as OutputFormat)) {
				return { output: `Current format: ${ctx.format}\nAvailable: ${validFormats.join(', ')}` };
			}
			ctx.setFormat(arg as OutputFormat);
			return { output: `Output format set to: ${arg}` };
		}

		case '\\timing': {
			const newVal = !ctx.timing;
			ctx.setTiming(newVal);
			return { output: `Timing is ${newVal ? 'on' : 'off'}` };
		}

		case '\\x': {
			const newVal = !ctx.expanded;
			ctx.setExpanded(newVal);
			return { output: `Expanded display is ${newVal ? 'on' : 'off'}` };
		}

		case '\\?':
		case '\\help':
			return { output: handleHelp() };

		case '\\q':
		case 'exit':
		case 'quit':
			return { quit: true };

		default:
			return { output: `Unknown command: ${cmd}\nType \\? for help.` };
	}
}
