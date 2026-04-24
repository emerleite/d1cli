# d1cli

Interactive SQL REPL for Cloudflare D1 databases. Inspired by [pgcli](https://github.com/dbcli/pgcli) and [mycli](https://github.com/dbcli/mycli).

Works with both **local** (miniflare SQLite files) and **remote** (Cloudflare API) D1 databases.

## Install

```bash
npm install -g d1cli
```

Or run directly with npx:

```bash
npx d1cli --local
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
# Set credentials
export CF_API_TOKEN="your-api-token"
export CF_ACCOUNT_ID="your-account-id"

# Auto-detect database from wrangler.toml
d1cli --remote

# Specify database by name
d1cli --remote --db my-database

# Specify database by ID (no wrangler.toml needed)
d1cli --remote --database-id ec49c416-f1ee-4ccb-ac4a-4311d704ae9b
```

**Getting your credentials:**

- **API Token**: Cloudflare Dashboard > My Profile > API Tokens > Create Token with **D1 Edit** permission
- **Account ID**: Visible in the Cloudflare Dashboard sidebar or URL

Also accepts `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as alternative env var names.

## Non-interactive mode

Execute a query and exit:

```bash
# Single query
d1cli --local -e "SELECT * FROM users LIMIT 10;"

# Execute a SQL file
d1cli --local --file schema.sql

# JSON output
d1cli --local -e "SELECT * FROM users;" --format json

# CSV output (pipe-friendly)
d1cli --local -e "SELECT * FROM users;" --format csv
```

## Interactive REPL

```
$ d1cli --local --persist-to ./db/data/
d1cli v0.1.0
Connected to bibliafala (local)
Type \? for help, \q to quit.

bibliafala(local)> SELECT COUNT(*) as total FROM messages;
┌───────┐
│ total │
├───────┤
│ 21    │
└───────┘
(1 row)

bibliafala(local)> \dt
┌──────────────┐
│ table_name   │
├──────────────┤
│ messages     │
├──────────────┤
│ sessions     │
└──────────────┘
(2 rows)
```

### Features

- **Auto-completion**: Tab-complete SQL keywords, table names, and column names
- **Multi-line queries**: Write queries across multiple lines, terminated by `;`
- **Query history**: Up/Down arrows to navigate, persisted across sessions
- **Syntax highlighting**: SQL keywords, strings, and numbers are color-coded
- **Multiple output formats**: table, json, csv, vertical

## Backslash Commands

| Command | Description |
|---------|-------------|
| `\dt` | List tables |
| `\d <table>` | Describe table (columns, types, indexes) |
| `\di [table]` | List indexes |
| `\T <format>` | Set output format: `table`, `json`, `csv`, `vertical` |
| `\timing` | Toggle query execution timing |
| `\?` or `\help` | Show help |
| `\q` or `exit` | Quit |

## Output Formats

### table (default)

```
┌────┬───────────────┬──────┐
│ id │ whatsapp      │ type │
├────┼───────────────┼──────┤
│ 1  │ 5521999999999 │ text │
└────┴───────────────┴──────┘
(1 row)
```

### vertical

```
*************************** 1. row ***************************
      id: 1
whatsapp: 5521999999999
    type: text
(1 row)
```

### json

```json
[
  {
    "id": 1,
    "whatsapp": "5521999999999",
    "type": "text"
  }
]
```

### csv

```
id,whatsapp,type
1,5521999999999,text
```

## CLI Options

```
Usage: d1cli [options]

Options:
  --local                 Connect to local D1 database (default)
  --remote                Connect to remote D1 via Cloudflare API
  --persist-to <path>     Local persistence directory (default: .wrangler/state)
  --db <name>             Database name from wrangler.toml
  --database-id <id>      D1 database ID
  -c, --config <path>     Path to wrangler.toml
  -e, --execute <sql>     Execute SQL and exit
  -f, --file <path>       Execute SQL file and exit
  --format <format>       Output format: table, json, csv, vertical (default: table)
  -V, --version           Output version number
  -h, --help              Display help
```

## How Local Mode Works

d1cli reads your `wrangler.toml` to find D1 database bindings, then locates the SQLite file that miniflare creates when you run `wrangler dev`. It connects directly using `better-sqlite3` — no wrangler process needed.

Default SQLite location: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`

With `--persist-to`: `<persist-to>/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`

## License

MIT
