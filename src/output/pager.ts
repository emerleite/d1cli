import { spawnSync } from 'child_process';

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
		spawnSync(pagerCmd, pagerArgs, {
			input: text + '\n',
			stdio: ['pipe', 'inherit', 'inherit'],
		});
	} catch {
		// Pager not available, fall back to direct output
		process.stdout.write(text + '\n');
	}
}
