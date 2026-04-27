# CLAUDE.md

## Project Overview

d1cli is a pgcli/litecli-inspired interactive SQL REPL for Cloudflare D1 databases. Built with Python + prompt_toolkit, same stack as pgcli/mycli. Published on PyPI as `cloudflare-d1cli`, Homebrew as `d1cli`.

## Commands

```bash
# Development
uv sync --dev                    # Install dependencies
uv pip install -e .              # Install in editable mode
uv run pytest -v                 # Run tests
uv run d1cli --help              # Run without installing

# Run
d1cli -c prod                    # Connect via profile
d1cli --local --persist-to ./db/data/
d1cli --remote --db bibliafala
d1cli -e "SELECT 1;"            # Non-interactive

# Build & publish
uv build                        # Build wheel/sdist
git tag v0.1.x && git push --tags  # Triggers CI: PyPI + Homebrew + binaries
```

## Architecture

Modeled on pgcli (https://github.com/dbcli/pgcli) and litecli (https://github.com/dbcli/litecli). **Always reference pgcli's implementation when building features.**

| Module | Purpose | pgcli equivalent |
|--------|---------|-----------------|
| `main.py` | CLI entry, REPL loop (PromptSession), multi-statement execution | `pgcli/main.py` |
| `completer.py` | Context-aware SQL completer with metadata labels | `pgcli/pgcompleter.py` |
| `connection.py` | Local (sqlite3) + Remote (httpx) with row_limit | `pgcli/pgexecute.py` |
| `commands.py` | Backslash + dot commands, \profile wizard | `pgspecial` package |
| `config.py` | TOML config, connection profiles, defaults | `pgcli/config.py` |
| `formatter.py` | Output formatting via cli_helpers, NULL handling | `pgcli/packages/formatter/` |
| `wrangler.py` | Parse wrangler.toml, read OAuth token | N/A (D1-specific) |
| `style.py` | Prompt styling, configurable themes | `pgcli/pgstyle.py` |

## Key Design Decisions

- **prompt_toolkit** handles REPL: highlighting, completion menus, history, multi-line. Do NOT build custom terminal handling.
- **cli_helpers** for output formatting (same as pgcli). Handles large result sets natively.
- **click** for CLI args and pager (`click.echo_via_pager`).
- **sqlite3 stdlib** for local D1 (no native addon). Connects directly to miniflare SQLite files.
- **httpx** for remote D1 via Cloudflare REST API.
- **TOML config** at `~/.config/d1cli/config.toml` — auto-generated with comments on first run.
- **Connection profiles** — named connections with optional per-profile credentials.
- **Wrangler auth**: reads OAuth token from `wrangler login` config — no API token env var needed.
- **Row limit**: default 1000. Local uses `fetchmany()`, remote appends `LIMIT` to SQL.

## Reference Implementation: pgcli

**Always check pgcli's implementation before building or changing features.** Key files:

- **Completion**: `pgcli/pgcompleter.py` — how completions are yielded, metadata labels, fuzzy matching
- **SQL context**: `pgcli/packages/sqlcompletion.py` — `suggest_type()` for context detection
- **REPL setup**: `pgcli/main.py` lines ~1060-1100 — PromptSession configuration
- **Key bindings**: `pgcli/key_bindings.py` — Enter/Tab/F-key behavior
- **Pager**: `pgcli/main.py` — `click.echo_via_pager()` with height/width threshold
- **Tests**: `tests/test_sqlcompletion.py` — completion test patterns

pgcli repo: https://github.com/dbcli/pgcli
litecli repo: https://github.com/dbcli/litecli

## Testing

```bash
uv run pytest -v                 # all tests
uv run pytest -v -k "table"     # filter by name
```

Tests use pytest with mock connections (no real database needed):

```python
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

## Config

TOML config at `~/.config/d1cli/config.toml`:
- `[settings]` — all preferences (row_limit, format, timing, etc.)
- `[connections.<name>]` — named connection profiles with optional credentials
- Auto-generated with full comments on first run
- `save_config()` only writes when settings actually changed — never overwrites comments
- File is `chmod 600` (may contain API tokens)

## D1-Specific Details

### Local Mode
Miniflare stores D1 as SQLite at: `{persist_to}/v3/d1/miniflare-D1DatabaseObject/{hash}.sqlite`
Hash computed via HMAC-SHA256 of database_id (see `connection.py:_miniflare_hash`).

### Remote Mode
Cloudflare D1 REST API: `POST /client/v4/accounts/{account_id}/d1/database/{database_id}/query`
Auth: OAuth token from `~/Library/Preferences/.wrangler/config/default.toml` or `CF_API_TOKEN` env var.
Row limit: appends `LIMIT` to SQL (only if query has no existing LIMIT clause).

### Table Filtering
`get_tables()` excludes: `_cf_%`, `sqlite_%`, and FTS shadow tables (`*_content`, `*_data`, `*_docsize`, `*_idx`, `*_config`).

## CI/CD

GitHub Actions (`ci.yml`):
- **test**: `uv sync + pytest` on every push/PR
- **publish-dev**: dev version to PyPI on push to main
- **publish-release**: stable to PyPI on tag `v*`
- **build-binaries**: PyInstaller for macOS-arm64 + Linux-x86_64
- **release**: GitHub release with binaries + wheels
- **update-homebrew**: auto-update `emerleite/homebrew-tap` formula

PyPI uses OIDC trusted publishing (no token needed).
Package name: `cloudflare-d1cli`. Binary name: `d1cli`. Homebrew: `d1cli`.
