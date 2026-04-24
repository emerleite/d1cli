import { spawn } from 'child_process';

/**
 * Output text, piping through a pager if it exceeds the terminal height.
 * Mirrors pgcli/mycli behavior:
 *   - Uses `less -SRXF` by default (respects ANSI colors, exits if fits on screen)
 *   - Falls back to direct output if pager is unavailable or disabled
 *   - Respects PAGER env var
 */
export function outputWithPager(text: string, enabled: boolean = true): void {
	if (!enabled || !process.stdout.isTTY) {
		process.stdout.write(text + '\n');
		return;
	}

	const lines = text.split('\n');
	const termHeight = process.stdout.rows || 24;
	const termWidth = process.stdout.columns || 80;

	const isTooTall = lines.length >= termHeight - 4;
	const isTooWide = lines.some((line) => line.length > termWidth);

	if (!isTooTall && !isTooWide) {
		process.stdout.write(text + '\n');
		return;
	}

	const pagerCmd = process.env.PAGER || 'less';
	const pagerArgs = pagerCmd === 'less' ? ['-SRXF'] : [];

	try {
		const pager = spawn(pagerCmd, pagerArgs, {
			stdio: ['pipe', 'inherit', 'inherit'],
		});

		pager.stdin.on('error', () => {
			// User quit pager early — ignore EPIPE
		});

		pager.stdin.write(text + '\n');
		pager.stdin.end();

		// Wait synchronously for pager to exit before returning to REPL
		return new Promise<void>((resolve) => {
			pager.on('close', () => resolve());
		}) as unknown as void;
	} catch {
		process.stdout.write(text + '\n');
	}
}

/**
 * Async version for use in the REPL where we need to wait for pager exit.
 */
export async function outputWithPagerAsync(text: string, enabled: boolean = true): Promise<void> {
	if (!enabled || !process.stdout.isTTY) {
		process.stdout.write(text + '\n');
		return;
	}

	const lines = text.split('\n');
	const termHeight = process.stdout.rows || 24;
	const termWidth = process.stdout.columns || 80;

	const isTooTall = lines.length >= termHeight - 4;
	const isTooWide = lines.some((line) => line.length > termWidth);

	if (!isTooTall && !isTooWide) {
		process.stdout.write(text + '\n');
		return;
	}

	const pagerCmd = process.env.PAGER || 'less';
	const pagerArgs = pagerCmd === 'less' ? ['-SRXF'] : [];

	return new Promise<void>((resolve) => {
		try {
			const pager = spawn(pagerCmd, pagerArgs, {
				stdio: ['pipe', 'inherit', 'inherit'],
			});

			pager.stdin.on('error', () => {
				// User quit pager early — ignore EPIPE
			});

			pager.stdin.write(text + '\n');
			pager.stdin.end();

			pager.on('close', () => resolve());
			pager.on('error', () => {
				process.stdout.write(text + '\n');
				resolve();
			});
		} catch {
			process.stdout.write(text + '\n');
			resolve();
		}
	});
}
