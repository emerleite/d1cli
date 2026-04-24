import chalk from 'chalk';

export function handleHelp(): string {
	return [
		chalk.bold('d1cli commands:'),
		'',
		`  ${chalk.cyan('\\dt')}                List tables`,
		`  ${chalk.cyan('\\d <table>')}         Describe table (columns, indexes)`,
		`  ${chalk.cyan('\\di [table]')}        List indexes`,
		`  ${chalk.cyan('\\schema <table>')}    Show CREATE statement`,
		`  ${chalk.cyan('\\T <format>')}        Set output format (table, json, csv, vertical)`,
		`  ${chalk.cyan('\\x')}                 Toggle expanded (vertical) output`,
		`  ${chalk.cyan('\\timing')}            Toggle query timing`,
		`  ${chalk.cyan('\\?')} or ${chalk.cyan('\\help')}        Show this help`,
		`  ${chalk.cyan('\\q')} or ${chalk.cyan('exit')}         Quit`,
		'',
		chalk.gray('Queries end with ; for execution. Multi-line input is supported.'),
		chalk.gray('Tab completion works for commands, tables, columns, and formats.'),
	].join('\n');
}
