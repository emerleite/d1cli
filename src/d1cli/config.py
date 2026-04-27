"""Config file support — ~/.config/d1cli/config.json."""

from __future__ import annotations

import json
from pathlib import Path

CONFIG_PATH = Path.home() / ".config" / "d1cli" / "config.json"

DEFAULTS = {
    # Completion
    "smart_completion": True,       # Context-aware suggestions (F2 to toggle)
    "keyword_casing": "auto",       # auto: match input case. Also: upper, lower

    # Input
    "multi_line": True,             # Enter inserts newline; ; submits. F3 to toggle
    "vi": False,                    # Vi editing mode (F4 to toggle). False = Emacs

    # Output
    "table_format": "table",        # Default: table. Also: csv, json, vertical
    "expanded": False,              # Vertical output (\x to toggle)
    "auto_expand": True,            # Auto-switch to vertical when result is too wide
    "null_string": "<null>",        # How NULL values are displayed
    "max_column_width": 500,        # Truncate columns wider than this (0 = no limit)

    # Query limits
    "row_limit": 1000,              # Max rows fetched (0 = no limit). Prevents
                                    # freezing on huge tables. For remote D1, this
                                    # appends LIMIT to your query. Use --row-limit
                                    # CLI flag or add your own LIMIT clause.

    # Timing
    "timing": False,                # Show query duration (\timing to toggle)

    # Pager
    "pager": "less",                # Pager command. Set LESS=-SRXF for best results
    "pager_enabled": True,          # Auto-page when output exceeds terminal height

    # Safety
    "destructive_warning": True,    # Confirm before DROP, DELETE, TRUNCATE
    "on_error": "STOP",             # STOP: return to prompt. RESUME: continue next stmt

    # Appearance
    "syntax_style": "native",       # Pygments theme: native, monokai, solarized-dark, etc.
    "wider_completion_menu": False,  # Wider completion dropdown
    "prompt": "\\d> ",              # Prompt format. \\d=database, \\m=mode
    "less_chatty": False,           # Suppress welcome banner and goodbye message

    # Errors
    "verbose_errors": False,        # Show full traceback + failing SQL on error

    # Startup
    "startup_commands": [],         # Commands to run on connect, e.g.:
                                    #   ["PRAGMA foreign_keys = ON", "\\timing"]
}

# Human-readable config with comments (written on first run)
_DEFAULT_CONFIG_CONTENT = """\
{
    // d1cli configuration — https://github.com/emerleite/d1cli
    //
    // This file is auto-generated on first run.
    // Edit to customize. Only changed values are saved on exit.
    // Delete this file to reset to defaults.

    // Completion
    // "smart_completion": true,     // Context-aware (F2 to toggle)
    // "keyword_casing": "auto",     // auto, upper, lower

    // Output
    // "table_format": "table",      // table, csv, json, vertical
    // "auto_expand": true,          // Vertical when result is too wide
    // "null_string": "<null>",      // NULL display string
    // "max_column_width": 500,      // Truncate wide columns (0 = off)

    // Query limits
    // "row_limit": 1000,            // Max rows per query (0 = no limit)
                                     // Remote D1: appends LIMIT to SQL
                                     // Local D1: uses fetchmany()

    // Safety
    // "destructive_warning": true,  // Confirm DROP/DELETE/TRUNCATE

    // Appearance
    // "prompt": "\\\\d> ",          // \\d=database, \\m=mode
    // "syntax_style": "native",     // native, monokai, solarized-dark

    // Startup commands (run on connect)
    // "startup_commands": ["PRAGMA foreign_keys = ON"]
}
"""


def load_config() -> dict:
    config = dict(DEFAULTS)
    if CONFIG_PATH.exists():
        try:
            # Strip comments (// style) before parsing JSON
            content = CONFIG_PATH.read_text()
            lines = [
                line for line in content.split("\n")
                if not line.strip().startswith("//")
            ]
            cleaned = "\n".join(lines)
            if cleaned.strip():
                user = json.loads(cleaned)
                config.update(user)
        except Exception:
            pass
    else:
        # Generate default config on first run
        _generate_default_config()
    return config


def save_config(config: dict) -> None:
    """Save only values that differ from defaults (non-internal keys)."""
    to_save = {}
    for k, v in config.items():
        if k.startswith("_"):
            continue  # skip internal state
        if k in DEFAULTS and v != DEFAULTS.get(k):
            to_save[k] = v
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(to_save, indent=2) + "\n")


def _generate_default_config() -> None:
    """Write a commented default config file."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(_DEFAULT_CONFIG_CONTENT)
