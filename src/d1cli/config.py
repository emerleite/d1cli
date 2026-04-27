"""Config file support — ~/.config/d1cli/config."""

from __future__ import annotations

import json
from pathlib import Path

CONFIG_PATH = Path.home() / ".config" / "d1cli" / "config.json"

DEFAULTS = {
    "smart_completion": True,
    "multi_line": True,
    "destructive_warning": True,
    "keyword_casing": "auto",  # auto, upper, lower
    "table_format": "table",
    "vi": False,
    "timing": False,
    "expanded": False,
    "auto_expand": False,  # auto-switch to vertical when result is wide
    "row_limit": 1000,
    "max_column_width": 0,  # 0 = no limit
    "null_string": "<null>",
    "pager": "less",
    "pager_enabled": True,
    "less_chatty": False,
    "on_error": "STOP",  # STOP or RESUME
    "syntax_style": "native",  # native, monokai, solarized-dark, solarized-light
    "wider_completion_menu": False,
    "prompt": "\\d(\\m)> ",  # \d=database, \m=mode
    "verbose_errors": False,
    "startup_commands": [],  # e.g. ["PRAGMA foreign_keys = ON", "\\timing"]
}


def load_config() -> dict:
    config = dict(DEFAULTS)
    if CONFIG_PATH.exists():
        try:
            user = json.loads(CONFIG_PATH.read_text())
            config.update(user)
        except Exception:
            pass
    return config


def save_config(config: dict) -> None:
    # Only save values that differ from defaults
    to_save = {k: v for k, v in config.items() if k in DEFAULTS and v != DEFAULTS.get(k)}
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(to_save, indent=2) + "\n")
