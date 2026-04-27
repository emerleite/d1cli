"""Config file support — ~/.config/d1cli/config.toml."""

from __future__ import annotations

import json
import os
import stat
import sys
from dataclasses import dataclass
from pathlib import Path

import tomli_w

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib

CONFIG_DIR = Path.home() / ".config" / "d1cli"
CONFIG_PATH = CONFIG_DIR / "config.toml"
OLD_CONFIG_PATH = CONFIG_DIR / "config.json"

DEFAULTS = {
    # Completion
    "smart_completion": True,
    "keyword_casing": "auto",       # auto, upper, lower

    # Input
    "multi_line": True,
    "vi": False,

    # Output
    "table_format": "table",
    "expanded": False,
    "auto_expand": True,
    "null_string": "<null>",
    "max_column_width": 500,

    # Query limits
    "row_limit": 1000,

    # Timing
    "timing": False,

    # Pager
    "pager": "less",
    "pager_enabled": True,

    # Safety
    "destructive_warning": True,
    "on_error": "STOP",

    # Appearance
    "syntax_style": "native",
    "wider_completion_menu": False,
    "prompt": "\\d> ",
    "less_chatty": False,

    # Errors
    "verbose_errors": False,

    # Startup
    "startup_commands": [],
}


@dataclass
class ConnectionProfile:
    name: str
    mode: str  # "local" or "remote"
    db: str | None = None
    database_id: str | None = None
    account_id: str | None = None
    api_token: str | None = None
    persist_to: str | None = None


def load_config() -> dict:
    """Load config from TOML. Migrates from JSON if needed."""
    config = dict(DEFAULTS)

    # Migrate old JSON config
    if OLD_CONFIG_PATH.exists() and not CONFIG_PATH.exists():
        _migrate_json_to_toml()

    if CONFIG_PATH.exists():
        try:
            raw = tomllib.loads(CONFIG_PATH.read_text())
            # Settings are under [settings]
            settings = raw.get("settings", {})
            config.update(settings)
            # Store raw connections for get_connections()
            config["_connections_raw"] = raw.get("connections", {})
        except Exception:
            pass
    else:
        _generate_default_config()

    return config


def save_config(config: dict) -> None:
    """Save changed settings. Preserves the original file if nothing changed."""
    if not CONFIG_PATH.exists():
        return

    # Collect settings that differ from defaults
    changed = {}
    for k, v in config.items():
        if k.startswith("_"):
            continue
        if k in DEFAULTS and v != DEFAULTS.get(k):
            changed[k] = v

    if not changed:
        # Nothing changed from defaults — don't touch the file
        return

    # Read existing file to preserve connections and structure
    try:
        existing = tomllib.loads(CONFIG_PATH.read_text())
    except Exception:
        existing = {}

    existing_settings = existing.get("settings", {})

    # Only write if settings actually differ from what's on disk
    if changed == existing_settings:
        return

    existing["settings"] = changed
    CONFIG_PATH.write_text(tomli_w.dumps(existing))

    try:
        CONFIG_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def get_connections(config: dict) -> dict[str, ConnectionProfile]:
    """Get connection profiles from config."""
    raw = config.get("_connections_raw", {})
    profiles = {}
    for name, vals in raw.items():
        profiles[name] = ConnectionProfile(
            name=name,
            mode=vals.get("mode", "remote"),
            db=vals.get("db"),
            database_id=vals.get("database_id"),
            account_id=vals.get("account_id"),
            api_token=vals.get("api_token"),
            persist_to=vals.get("persist_to"),
        )
    return profiles


def get_connection_names(config: dict) -> list[str]:
    """Get list of connection profile names."""
    raw = config.get("_connections_raw", {})
    return list(raw.keys())


def _migrate_json_to_toml() -> None:
    """Migrate old config.json to config.toml."""
    try:
        content = OLD_CONFIG_PATH.read_text()
        # Strip // comments
        lines = [l for l in content.split("\n") if not l.strip().startswith("//")]
        cleaned = "\n".join(lines)
        if cleaned.strip():
            data = json.loads(cleaned)
        else:
            data = {}

        doc = {"settings": data}
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(tomli_w.dumps(doc))
        OLD_CONFIG_PATH.rename(OLD_CONFIG_PATH.with_suffix(".json.bak"))
    except Exception:
        pass


def _generate_default_config() -> None:
    """Write default config.toml with comments."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text("""\
# ============================================================================
# d1cli configuration
# https://github.com/emerleite/d1cli
#
# This file is auto-generated on first run.
# Uncomment and edit values to customize. Delete this file to reset.
# ============================================================================

[settings]

# ---------- Completion ----------
# smart_completion = true          # Context-aware suggestions (F2 to toggle)
# keyword_casing = "auto"          # "auto" matches your input case
#                                  # "upper" always UPPERCASE
#                                  # "lower" always lowercase

# ---------- Input ----------
# multi_line = true                # Enter = newline, ; = submit (F3 to toggle)
# vi = false                       # Vi editing mode (F4 to toggle)

# ---------- Output ----------
# table_format = "table"           # "table", "csv", "json", "vertical"
# expanded = false                 # Vertical output (\\x to toggle)
# auto_expand = true               # Auto vertical when result is too wide
# null_string = "<null>"           # How NULL values are displayed
# max_column_width = 500           # Truncate columns wider than this (0 = off)

# ---------- Query ----------
# row_limit = 1000                 # Max rows fetched per query (0 = no limit)
#                                  # Local: uses fetchmany() — fast on huge tables
#                                  # Remote: appends LIMIT to SQL
#                                  # Your own LIMIT always takes priority
# timing = false                   # Show query duration (\\timing to toggle)

# ---------- Pager ----------
# pager = "less"                   # Pager command (LESS=-SRXF auto-configured)
# pager_enabled = true             # Auto-page when output > terminal height

# ---------- Safety ----------
# destructive_warning = true       # Confirm before DROP, DELETE, TRUNCATE
# on_error = "STOP"                # "STOP" = return to prompt on error
#                                  # "RESUME" = continue next statement

# ---------- Appearance ----------
# syntax_style = "native"          # Pygments theme: native, monokai,
#                                  # solarized-dark, solarized-light, vim
# prompt = "\\\\d> "               # \\d = database name, \\m = mode (local/remote)
# less_chatty = false              # Suppress welcome banner and goodbye

# ---------- Errors ----------
# verbose_errors = false           # Show full traceback + failing SQL (\\v to toggle)

# ---------- Startup ----------
# Run these commands automatically when d1cli connects.
# startup_commands = [
#     "PRAGMA foreign_keys = ON",
#     "\\timing",
# ]


# ============================================================================
# Connection Profiles
# ============================================================================
#
# Define named connections to quickly switch between databases.
#
# Usage:
#   d1cli -c prod              # connect from command line
#   d1cli -c local-dev         # connect to local
#   \\c staging                 # switch mid-session
#   \\c                         # list available profiles
#
# Authentication:
#   - api_token is optional — falls back to `wrangler login` auth
#   - account_id is optional — auto-detected from API
#   - Config file is chmod 600 for security
#
# ---------- Remote connection example ----------
#
# [connections.prod]
# mode = "remote"                  # "remote" = Cloudflare D1 API
# db = "my-database"               # Database name from wrangler.toml
# # database_id = "abc-123..."     # Or specify by UUID (no wrangler.toml needed)
# # account_id = "ef862e..."       # Optional — auto-detected from wrangler login
# # api_token = "your-token"       # Optional — falls back to wrangler login
#
# ---------- Another remote (with explicit credentials) ----------
#
# [connections.staging]
# mode = "remote"
# database_id = "def-456-ghi"
# account_id = "ef862e42c5cf2d39a50def7dc2ff3534"
# api_token = "your-staging-api-token"
#
# ---------- Local connection example ----------
#
# [connections.local-dev]
# mode = "local"                   # "local" = direct SQLite file access
# db = "my-database"               # Database name from wrangler.toml
# persist_to = "./db/data/"        # Where wrangler dev stores the SQLite file
""")
    try:
        CONFIG_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
