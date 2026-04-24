/**
 * Multi-line input accumulator.
 * Collects lines until a statement-terminating semicolon is found
 * (not inside a string literal).
 */
export class InputAccumulator {
	private buffer: string[] = [];

	/**
	 * Add a line to the buffer.
	 * Returns the complete SQL if a terminating ; was found, null otherwise.
	 */
	append(line: string): string | null {
		this.buffer.push(line);
		const combined = this.buffer.join('\n');

		if (this.isComplete(combined)) {
			this.buffer = [];
			return combined.trim();
		}

		return null;
	}

	isAccumulating(): boolean {
		return this.buffer.length > 0;
	}

	reset(): void {
		this.buffer = [];
	}

	private isComplete(sql: string): boolean {
		const trimmed = sql.trim();
		if (trimmed.length === 0) return false;

		// Check if the last non-whitespace character is ; (outside string literals)
		let inSingle = false;
		let inDouble = false;
		let lastNonSpace = '';

		for (const ch of trimmed) {
			if (ch === "'" && !inDouble) inSingle = !inSingle;
			if (ch === '"' && !inSingle) inDouble = !inDouble;
			if (!inSingle && !inDouble && ch.trim()) lastNonSpace = ch;
		}

		return lastNonSpace === ';' && !inSingle && !inDouble;
	}
}
