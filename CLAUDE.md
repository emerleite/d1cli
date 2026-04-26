# CLAUDE.md

## Project Overview

d1cli is a pgcli/mycli-inspired interactive SQL REPL for Cloudflare D1 databases. Built with Python + prompt_toolkit, same stack as pgcli/mycli.

## Commands

```bash
# Development
uv pip install -e .              # Install in editable mode
uv run pytest                    # Run tests
uv run pytest -v                 # Verbose test output

# Run locally
cd ~/dev/betechai/bibliafala
~/dev/d1cli-py/.venv/bin/d1cli --local --persist-to ./db/data/
~/dev/d1cli-py/.venv/bin/d1cli --remote --db bibliafala
~/dev/d1cli-py/.venv/bin/d1cli --local --persist-to ./db/data/ -e "SELECT 1;"

# Build
uv build                         # Build wheel/sdist
```

## Architecture

Modeled on pgcli (https://github.com/dbcli/pgcli). Always reference pgcli's implementation when building features.

| Module | Purpose | pgcli equivalent |
|--------|---------|-----------------|
| `main.py` | CLI entry + REPL loop (PromptSession) | `pgcli/main.py` |
| `completer.py` | Context-aware SQL completer | `pgcli/pgcompleter.py` + `pgcli/packages/sqlcompletion.py` |
| `connection.py` | Local (sqlite3) + Remote (httpx) connections | `pgcli/pgexecute.py` |
| `commands.py` | Backslash commands (\dt, \d, \schema, etc.) | `pgspecial` package |
| `formatter.py` | Output formatting via cli_helpers | `pgcli/packages/formatter/` |
| `wrangler.py` | Parse wrangler.toml, read OAuth token | N/A (D1-specific) |
| `style.py` | Prompt styling | `pgcli/pgstyle.py` |

## Key Design Decisions

- **prompt_toolkit** handles REPL: highlighting, completion menus, history, multi-line. Do NOT build custom terminal handling.
- **cli_helpers** for output formatting (same as pgcli). Handles large result sets natively.
- **click** for CLI args and pager (`click.echo_via_pager`).
- **sqlite3 stdlib** for local D1 (no native addon). Connects directly to miniflare SQLite files.
- **httpx** for remote D1 via Cloudflare REST API.
- **Wrangler auth**: reads OAuth token from `wrangler login` config — no API token env var needed.

## Reference Implementation: pgcli

**Always check pgcli's implementation before building or changing features.** Key files to reference:

- **Completion**: `pgcli/pgcompleter.py` — how completions are yielded, metadata labels, fuzzy matching
- **SQL context**: `pgcli/packages/sqlcompletion.py` — `suggest_type()` for context detection
- **REPL setup**: `pgcli/main.py` lines ~1060-1100 — PromptSession configuration
- **Key bindings**: `pgcli/key_bindings.py` — Enter/Tab/F-key behavior
- **Pager**: `pgcli/main.py` — `click.echo_via_pager()` with height/width threshold
- **Tests**: `tests/test_sqlcompletion.py` — completion test patterns

pgcli repo: https://github.com/dbcli/pgcli
mycli repo: https://github.com/dbcli/mycli

## Testing

Tests use pytest with mock connections (no real database needed).

```python
# Pattern for completer tests (from tests/test_completer.py)
def make_completer(**tables):
    conn = MockConnection(tables)
    c = D1Completer(conn)
    c.refresh()
    return c

c = make_completer(users=["id", "name"], orders=["id", "total"])
texts = get_texts(c, "SELECT * FROM ")
assert "users" in texts
```

## Code Style

- Type hints on all function signatures
- `from __future__ import annotations` in every module
- Dataclasses for data structures (ColumnInfo, IndexInfo, QueryResult, etc.)

## D1-Specific Details

### Local Mode
Miniflare stores D1 as SQLite at: `{persist_to}/v3/d1/miniflare-D1DatabaseObject/{hash}.sqlite`
Hash computed via HMAC-SHA256 of database_id (see `connection.py:_miniflare_hash`).

### Remote Mode
Cloudflare D1 REST API: `POST /client/v4/accounts/{account_id}/d1/database/{database_id}/query`
Auth: OAuth token from `~/Library/Preferences/.wrangler/config/default.toml` or `CF_API_TOKEN` env var.

### Table Filtering
`getTables()` excludes: `_cf_%`, `sqlite_%`, and FTS shadow tables (`*_content`, `*_data`, `*_docsize`, `*_idx`, `*_config`).
