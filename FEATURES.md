# d1cli Feature Tracker

Status: `[x]` done, `[ ]` not started, `[~]` partial

## Auto-Completion
- [x] Context-sensitive (FROM→tables, SELECT→columns)
- [x] Fuzzy matching
- [x] Case-insensitive matching
- [x] SQL keyword completion
- [x] SQLite function completion (80+)
- [x] Table/column completion from schema
- [x] Dot notation (table.column)
- [x] Named query completion (\n)
- [x] Format argument completion (\T)
- [x] Pager argument completion
- [x] Auto-complete while typing
- [x] Tab to force completion
- [x] Smart completion toggle (F2)
- [x] Keyword casing (auto/upper/lower)
- [x] Wider completion menu (config)

## Syntax Highlighting
- [x] SQL highlighting via Pygments SqlLexer
- [x] Color theme (configurable)
- [x] Multiple themes (native, monokai, solarized-dark, etc.)

## Key Bindings
- [x] Tab: force completion
- [x] Enter: smart submit (submit on ; or command, newline otherwise)
- [x] Enter: accept completion when menu open
- [x] F2: toggle smart completion
- [x] F3: toggle multiline mode
- [x] F4: toggle vi/emacs mode
- [x] Ctrl+Space: force completion (alternative to Tab)

## Output Formatting
- [x] Table (ASCII)
- [x] CSV
- [x] JSON
- [x] Vertical/expanded
- [x] Row limit with truncation warning
- [x] Auto-expand (vertical when result is too wide)
- [x] Max column width config
- [x] NULL string representation config (`<null>` default)

## Pager
- [x] Auto-pager for large output
- [x] Custom pager command (\pager)
- [x] Enable/disable pager
- [x] PAGER env var fallback
- [x] Auto-configure LESS=-SRXF

## History
- [x] File-based persistent history
- [x] Arrow key navigation
- [x] Auto-suggest from history (ghost text)
- [x] Ctrl+R incremental search (prompt_toolkit built-in)

## Config File (~/.config/d1cli/config.json)
- [x] Config file support (load/save)
- [x] smart_completion setting
- [x] multi_line setting
- [x] destructive_warning setting
- [x] keyword_casing setting (auto/upper/lower)
- [x] syntax_style setting (native, monokai, etc.)
- [x] table_format setting
- [x] pager setting
- [x] vi mode setting
- [x] timing setting
- [x] row_limit setting
- [x] prompt format setting (\d=database, \m=mode)
- [x] less_chatty setting
- [x] on_error setting (STOP/RESUME)
- [x] auto_expand setting
- [x] max_column_width setting
- [x] null_string setting
- [x] wider_completion_menu setting

## Special Commands
- [x] \dt — list tables
- [x] \d [table] — list/describe tables
- [x] \di [table] — list indexes
- [x] \dv — list views
- [x] \schema <table> — show CREATE statement
- [x] \T <format> — change output format
- [x] \x — toggle expanded output
- [x] \timing — toggle query timing
- [x] \pager [cmd] — set pager
- [x] \o [file] — output to file
- [x] \e — edit in $EDITOR
- [x] \i <file> — execute from file
- [x] \! <cmd> — shell command
- [x] \n / \ns / \nd — named queries
- [x] \# / \refresh — refresh completions
- [x] \conninfo — show connection details
- [x] \watch <sec> — re-execute query every N seconds
- [x] \? / \help — show help
- [x] \q / exit — quit

## Connection
- [x] Local D1 (sqlite3 + miniflare path)
- [x] Remote D1 (httpx + CF API)
- [x] Wrangler login auth (OAuth token)
- [x] CF_API_TOKEN / CF_ACCOUNT_ID env vars
- [x] Auto-detect account ID
- [x] Database selection by name (--db)
- [x] Database selection by ID (--database-id)
- [x] Wrangler.toml parsing

## CLI Flags
- [x] --local / --remote
- [x] --persist-to
- [x] --db
- [x] --database-id
- [x] -e / --execute
- [x] -f / --file
- [x] --format
- [x] --row-limit
- [x] --vi / --emacs
- [x] --less-chatty
- [x] --version

## Safety
- [x] Destructive query warning (DROP/DELETE/TRUNCATE)

## REPL
- [x] Multi-line input
- [x] Continuation prompt
- [x] Bottom toolbar
- [x] Welcome banner
- [x] Vi/Emacs mode toggle (F4 + --vi flag)
- [x] Custom prompt format (\d=database, \m=mode)

## Named Queries
- [x] Save (\ns)
- [x] List (\n)
- [x] Execute (\n <name>)
- [x] Delete (\nd)
- [x] Tab completion for names

## Error Handling
- [x] Colored error messages
- [x] Destructive warning before DROP/DELETE/TRUNCATE
- [x] Continue on error mode (on_error config)
