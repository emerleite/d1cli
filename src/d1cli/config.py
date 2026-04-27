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
    """Save settings to TOML (preserves connections section)."""
    # Build settings dict (only changed values)
    settings = {}
    for k, v in config.items():
        if k.startswith("_"):
            continue
        if k == "connections":
            continue
        if k in DEFAULTS and v != DEFAULTS.get(k):
            settings[k] = v

    # Load existing to preserve connections
    existing = {}
    if CONFIG_PATH.exists():
        try:
            existing = tomllib.loads(CONFIG_PATH.read_text())
        except Exception:
            pass

    doc = {}
    if settings:
        doc["settings"] = settings
    if "connections" in existing:
        doc["connections"] = existing["connections"]
    elif "_connections_raw" in config and config["_connections_raw"]:
        doc["connections"] = config["_connections_raw"]

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(tomli_w.dumps(doc))

    # Secure the file (may contain tokens)
    try:
        CONFIG_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 600
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
# d1cli configuration
# https://github.com/emerleite/d1cli
#
# Edit to customize. Only changed values need to be present.
# Delete this file to reset to defaults.

[settings]
# smart_completion = true     # Context-aware (F2 to toggle)
# keyword_casing = "auto"     # auto, upper, lower
# table_format = "table"      # table, csv, json, vertical
# auto_expand = true          # Vertical when result is too wide
# null_string = "<null>"      # NULL display string
# max_column_width = 500      # Truncate wide columns (0 = off)
# row_limit = 1000            # Max rows per query (0 = no limit)
# destructive_warning = true  # Confirm DROP/DELETE/TRUNCATE
# prompt = "\\\\d> "          # \\d=database, \\m=mode
# syntax_style = "native"     # native, monokai, solarized-dark
# startup_commands = ["PRAGMA foreign_keys = ON"]

# Connection profiles
# Use: d1cli -c <name>  or  \\c <name> in REPL
#
# [connections.prod]
# mode = "remote"
# db = "my-database"
# # account_id = "..."       # optional, auto-detected from wrangler login
# # api_token = "..."        # optional, falls back to wrangler login
#
# [connections.local]
# mode = "local"
# db = "my-database"
# persist_to = "./db/data/"
""")
    try:
        CONFIG_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
