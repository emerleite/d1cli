# d1cli

A [pgcli](https://github.com/dbcli/pgcli)-style interactive SQL REPL for [Cloudflare D1](https://developers.cloudflare.com/d1/) databases.

Built with [prompt_toolkit](https://github.com/prompt-toolkit/python-prompt-toolkit) — the same foundation as pgcli and mycli.

## Features

- **Auto-completion** — context-aware: tables after `FROM`, columns after `SELECT`, dot notation (`table.column`), fuzzy matching, SQLite functions
- **Syntax highlighting** — live SQL highlighting as you type via Pygments
- **Local & remote** — connect to local miniflare SQLite files or remote D1 via Cloudflare API
- **Wrangler integration** — reads `wrangler.toml` for database config and `wrangler login` for auth
- **Output formats** — table, JSON, CSV, vertical (like `\G` in MySQL)
- **Auto-pager** — large results pipe through `less` automatically
- **Multi-line queries** — write SQL across multiple lines, submit with `;`
- **History** — persistent, with Ctrl+R search and auto-suggestions
- **Named queries** — save, list, and re-execute favorite queries
- **Vi/Emacs modes** — toggle with F4
- **Destructive warnings** — confirms before `DROP`, `DELETE`, `TRUNCATE`
- **Config file** — all settings persist in `~/.config/d1cli/config.json`

## Install

```bash
pip install d1cli
```

Or with [uv](https://github.com/astral-sh/uv):

```bash
uv pip install d1cli
```

Or with Homebrew:

```bash
brew tap emerleite/tap
brew install d1cli
```

## Quick Start

### Local mode

Connect to a local D1 database from any project that uses `wrangler dev`:

```bash
# Auto-detect from wrangler.toml (default persist path)
d1cli --local

# Custom persist path
d1cli --local --persist-to ./db/data/

# Specify database by name (when wrangler.toml has multiple D1 bindings)
d1cli --local --db my-database
```

### Remote mode

Connect to a D1 database on Cloudflare's network:

```bash
# Uses wrangler login auth (recommended — no tokens needed)
d1cli --remote

# Specify database by name
d1cli --remote --db my-database

# Or by ID (no wrangler.toml needed)
d1cli --remote --database-id ec49c416-f1ee-4ccb-ac4a-4311d704ae9b
```

If you haven't run `wrangler login`, set environment variables instead:

```bash
export CF_API_TOKEN="your-api-token"
export CF_ACCOUNT_ID="your-account-id"
d1cli --remote --db my-database
```

### Non-interactive mode

```bash
# Execute a query and exit
d1cli --local -e "SELECT * FROM users LIMIT 10;"

# Execute a SQL file
d1cli --local -f schema.sql

# JSON output
d1cli --local -e "SELECT * FROM users;" --format json

# CSV output (pipe-friendly)
d1cli --local -e "SELECT * FROM users;" --format csv
```

## Usage

```
$ d1cli --local --persist-to ./db/data/
d1cli v0.1.0
Connected to bibliafala (local)
Type \? for help, \q to quit.
F2: Smart Completion | F3: Multiline | F4: Vi/Emacs

bibliafala(local)> SELECT * FROM messages LIMIT 3;
+-----+---------------+------+---------------------+
| id  | whatsapp      | type | created_at          |
+-----+---------------+------+---------------------+
| 133 | 5521999999999 | text | 2024-10-30 17:21:23 |
| 134 | 5521999999999 | text | 2024-10-30 17:21:59 |
| 135 | 5521999999999 | text | 2024-10-30 17:44:00 |
+-----+---------------+------+---------------------+
(3 rows)
```

## Commands

| Command | Description |
|---------|-------------|
| `\dt` | List tables |
| `\d [table]` | List or describe tables |
| `\di [table]` | List indexes |
| `\dv` | List views |
| `\schema <table>` | Show CREATE statement |
| `\conninfo` | Show connection details |
| `\T <format>` | Change output format (table, json, csv, vertical) |
| `\x` | Toggle expanded (vertical) output |
| `\timing` | Toggle query timing |
| `\pager [cmd]` | Set pager. `\pager off` to disable |
| `\o [file]` | Send output to file. `\o` to stop |
| `\watch <sec>` | Re-execute last query every N seconds |
| `\e` | Edit last query in `$EDITOR` |
| `\i <file>` | Execute SQL from file |
| `\! <cmd>` | Execute shell command |
| `\n [name]` | List or execute named queries |
| `\ns <name>` | Save last query as named query |
| `\nd <name>` | Delete named query |
| `\#` / `\refresh` | Refresh auto-completions |
| `\?` / `\help` | Show help |
| `\q` / `exit` | Quit |

## Key Bindings

| Key | Action |
|-----|--------|
| Tab | Force auto-completion |
| Ctrl+Space | Force auto-completion (alternative) |
| F2 | Toggle smart completion |
| F3 | Toggle multiline mode |
| F4 | Toggle Vi/Emacs editing mode |
| Ctrl+R | Search history |
| Up/Down | Navigate history |

## Output Formats

### table (default)

```
+----+---------------+------+
| id | whatsapp      | type |
+----+---------------+------+
| 1  | 5521999999999 | text |
+----+---------------+------+
(1 row)
```

### vertical (`\x` or `--format vertical`)

```
-[ RECORD 1 ]-----------
id       | 1
whatsapp | 5521999999999
type     | text
(1 row)
```

### json (`--format json`)

```json
[{"id": 1, "whatsapp": "5521999999999", "type": "text"}]
```

### csv (`--format csv`)

```
id,whatsapp,type
1,5521999999999,text
```

## Row Limit

By default, d1cli limits query results to **1000 rows** to prevent freezing on large tables. This works differently for local and remote:

- **Local mode**: Uses `fetchmany()` — only reads 1000 rows from SQLite, fast even on million-row tables
- **Remote mode**: Appends `LIMIT 1001` to your SQL — prevents the D1 API from serializing huge responses over HTTP

When results are truncated, you'll see:
```
Results limited to 1000 rows. Add LIMIT to your query or use --row-limit 0 for all rows.
```

Your own `LIMIT` always takes priority — `SELECT * FROM users LIMIT 10;` returns exactly 10 rows regardless of row_limit.

```bash
# Change the default
d1cli --row-limit 5000     # higher limit
d1cli --row-limit 0        # no limit (careful with large tables)
```

Or set it permanently in `~/.config/d1cli/config.json`:
```json
{ "row_limit": 5000 }
```

### Cloudflare D1 Limits

For reference, D1 has these limits:
- Max query duration: **30 seconds**
- Max SQL size: **100 KB**
- Max row/value size: **2 MB**
- Max database size: **10 GB** (paid) / **500 MB** (free)

## Configuration

A config file is auto-generated at `~/.config/d1cli/config.json` on first run with commented defaults. Settings persist across sessions.

| Setting | Default | Description |
|---------|---------|-------------|
| `smart_completion` | `true` | Context-aware completion (F2 to toggle) |
| `keyword_casing` | `"auto"` | Keyword case: `auto`, `upper`, `lower` |
| `table_format` | `"table"` | Default output format |
| `expanded` | `false` | Expanded (vertical) output |
| `auto_expand` | `true` | Auto-switch to vertical when result is too wide |
| `timing` | `false` | Show query timing |
| `row_limit` | `1000` | Max rows per query (0 = no limit) |
| `max_column_width` | `500` | Truncate wide columns (0 = no limit) |
| `null_string` | `"<null>"` | How NULL values are displayed |
| `vi` | `false` | Vi editing mode (F4 to toggle) |
| `destructive_warning` | `true` | Warn before DROP/DELETE/TRUNCATE |
| `pager` | `"less"` | Pager command |
| `syntax_style` | `"native"` | Pygments color theme |
| `prompt` | `"\\d> "` | Prompt format (`\d`=database, `\m`=mode) |
| `less_chatty` | `false` | Suppress welcome banner |
| `on_error` | `"STOP"` | Error handling: `STOP` or `RESUME` |
| `verbose_errors` | `false` | Show full traceback on errors |
| `startup_commands` | `[]` | Commands to run on connect |

## CLI Options

```
Usage: d1cli [OPTIONS]

Options:
  --local / --remote          Connect to local or remote D1
  --persist-to TEXT           Local persistence directory
  --db TEXT                   Database name from wrangler.toml
  --database-id TEXT          D1 database ID
  -e, --execute TEXT          Execute SQL and exit
  -f, --file TEXT             Execute SQL file and exit
  --format [table|json|csv|vertical]
  --row-limit INTEGER         Max rows (0=no limit, default 1000)
  --vi / --emacs              Editing mode
  --less-chatty               Suppress banner
  --version                   Show version
  --help                      Show help
```

## How It Works

### Local Mode

d1cli reads your `wrangler.toml` to find D1 database bindings, then connects directly to the SQLite file that miniflare creates when you run `wrangler dev`. No wrangler process needed.

Default path: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`

With `--persist-to`: `<persist-to>/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`

### Remote Mode

Uses the Cloudflare D1 REST API. Authentication is automatic if you've run `wrangler login` — d1cli reads the OAuth token from wrangler's config. No API token environment variable needed.

## Development

```bash
# Clone and setup
git clone https://github.com/emerleite/d1cli.git
cd d1cli
uv sync --dev

# Run locally
uv run d1cli --local --persist-to ./db/data/

# Run tests
uv run pytest -v

# Install in editable mode
uv pip install -e .
```

## Inspired By

- [pgcli](https://github.com/dbcli/pgcli) — PostgreSQL CLI with auto-completion and syntax highlighting
- [mycli](https://github.com/dbcli/mycli) — MySQL CLI with auto-completion and syntax highlighting
- [litecli](https://github.com/dbcli/litecli) — SQLite CLI from the dbcli project

## License

MIT
