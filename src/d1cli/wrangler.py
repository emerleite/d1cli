"""Parse wrangler.toml and read wrangler login OAuth token."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib


@dataclass
class D1Binding:
    binding: str
    database_name: str
    database_id: str


@dataclass
class WranglerAuth:
    oauth_token: str
    expiration_time: str


def find_wrangler_config(config_path: str | None = None) -> Path | None:
    if config_path:
        p = Path(config_path)
        return p if p.exists() else None

    for name in ("wrangler.toml", "wrangler.jsonc", "wrangler.json"):
        p = Path.cwd() / name
        if p.exists():
            return p
    return None


def parse_d1_bindings(config_path: Path) -> list[D1Binding]:
    content = config_path.read_text()

    if config_path.suffix in (".json", ".jsonc"):
        import json
        import re

        cleaned = re.sub(r"//.*$", "", content, flags=re.MULTILINE)
        cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.DOTALL)
        config = json.loads(cleaned)
    else:
        config = tomllib.loads(content)

    databases = config.get("d1_databases", [])
    return [
        D1Binding(
            binding=db.get("binding", "DB"),
            database_name=db.get("database_name", ""),
            database_id=db.get("database_id", ""),
        )
        for db in databases
    ]


def read_wrangler_auth() -> WranglerAuth | None:
    """Read OAuth token from wrangler login config."""
    candidates = [
        Path.home() / "Library" / "Preferences" / ".wrangler" / "config" / "default.toml",
        Path.home() / ".config" / ".wrangler" / "config" / "default.toml",
        Path.home() / ".wrangler" / "config" / "default.toml",
    ]

    for path in candidates:
        if not path.exists():
            continue
        try:
            config = tomllib.loads(path.read_text())
            token = config.get("oauth_token")
            if token:
                return WranglerAuth(
                    oauth_token=token,
                    expiration_time=config.get("expiration_time", ""),
                )
        except Exception:
            continue
    return None
