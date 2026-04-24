import chalk from 'chalk';

export function handleHelp(): string {
	return [
		chalk.bold('d1cli commands:'),
		'',
		`  ${chalk.cyan('\\dt')}              List tables`,
		`  ${chalk.cyan('\\d <table>')}       Describe table (columns, indexes)`,
		`  ${chalk.cyan('\\di [table]')}      List indexes`,
		`  ${chalk.cyan('\\T <format>')}      Set output format (table, json, csv, vertical)`,
		`  ${chalk.cyan('\\timing')}          Toggle query timing`,
		`  ${chalk.cyan('\\?')} or ${chalk.cyan('\\help')}      Show this help`,
		`  ${chalk.cyan('\\q')} or ${chalk.cyan('exit')}       Quit`,
		'',
		chalk.gray('Queries end with ; for execution. Multi-line input is supported.'),
	].join('\n');
}
