"""Database connection abstraction for local and remote D1."""

from __future__ import annotations

import hashlib
import hmac
import sqlite3
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path

import httpx


@dataclass
class ColumnInfo:
    name: str
    type: str
    notnull: bool
    default: str | None
    pk: bool


@dataclass
class IndexInfo:
    name: str
    table: str
    unique: bool
    columns: list[str] = field(default_factory=list)


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[dict]
    row_count: int
    changes: int
    duration: float  # milliseconds
    truncated: bool = False
    status_message: str = ""  # e.g. "SELECT 5", "INSERT 0 1", "UPDATE 3"


TABLES_SQL = """
SELECT name FROM sqlite_master
WHERE type='table'
    AND name NOT LIKE '_cf_%%'
    AND name NOT LIKE 'sqlite_%%'
    AND name NOT IN (
        SELECT name || '_content' FROM sqlite_master WHERE type='table' AND sql LIKE '%%fts%%'
        UNION SELECT name || '_data' FROM sqlite_master WHERE type='table' AND sql LIKE '%%fts%%'
        UNION SELECT name || '_docsize' FROM sqlite_master WHERE type='table' AND sql LIKE '%%fts%%'
        UNION SELECT name || '_idx' FROM sqlite_master WHERE type='table' AND sql LIKE '%%fts%%'
        UNION SELECT name || '_config' FROM sqlite_master WHERE type='table' AND sql LIKE '%%fts%%'
    )
ORDER BY name
"""


class Connection(ABC):
    name: str
    mode: str

    @abstractmethod
    def execute(self, sql: str) -> QueryResult: ...

    @abstractmethod
    def get_tables(self) -> list[str]: ...

    @abstractmethod
    def get_columns(self, table: str) -> list[ColumnInfo]: ...

    @abstractmethod
    def get_indexes(self, table: str | None = None) -> list[IndexInfo]: ...

    @abstractmethod
    def close(self) -> None: ...


class LocalConnection(Connection):
    def __init__(self, sqlite_path: str, database_name: str):
        self.name = database_name
        self.mode = "local"
        self._db = sqlite3.connect(sqlite_path)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA journal_mode=WAL")

    def execute(self, sql: str, row_limit: int = 0) -> QueryResult:
        start = time.perf_counter()
        cursor = self._db.execute(sql)
        stmt_type = sql.strip().split()[0].upper() if sql.strip() else ""
        is_read = stmt_type in ("SELECT", "PRAGMA", "EXPLAIN", "WITH")

        if is_read:
            if row_limit > 0:
                rows_raw = cursor.fetchmany(row_limit + 1)
                truncated = len(rows_raw) > row_limit
                if truncated:
                    rows_raw = rows_raw[:row_limit]
            else:
                rows_raw = cursor.fetchall()
                truncated = False
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            rows = [dict(r) for r in rows_raw]
            duration = (time.perf_counter() - start) * 1000
            status = f"SELECT {len(rows)}"
            result = QueryResult(
                columns=columns, rows=rows, row_count=len(rows),
                changes=0, duration=duration, status_message=status,
            )
            result.truncated = truncated
            return result

        self._db.commit()
        duration = (time.perf_counter() - start) * 1000
        changes = cursor.rowcount
        status = f"{stmt_type} {changes}" if changes >= 0 else stmt_type
        return QueryResult(
            columns=[], rows=[], row_count=0,
            changes=changes, duration=duration, status_message=status,
        )

    def get_tables(self) -> list[str]:
        cursor = self._db.execute(TABLES_SQL)
        return [row[0] for row in cursor.fetchall()]

    def get_columns(self, table: str) -> list[ColumnInfo]:
        cursor = self._db.execute(f'PRAGMA table_info("{table}")')
        return [
            ColumnInfo(
                name=row[1], type=row[2] or "ANY",
                notnull=bool(row[3]), default=row[4], pk=bool(row[5]),
            )
            for row in cursor.fetchall()
        ]

    def get_indexes(self, table: str | None = None) -> list[IndexInfo]:
        indexes = []
        tables = [table] if table else self.get_tables()
        for t in tables:
            cursor = self._db.execute(f'PRAGMA index_list("{t}")')
            for row in cursor.fetchall():
                idx_name = row[1]
                cols_cursor = self._db.execute(f'PRAGMA index_info("{idx_name}")')
                columns = [c[2] for c in cols_cursor.fetchall()]
                indexes.append(IndexInfo(name=idx_name, table=t, unique=bool(row[2]), columns=columns))
        return indexes

    def close(self) -> None:
        self._db.close()


class RemoteConnection(Connection):
    def __init__(self, account_id: str, database_id: str, api_token: str, database_name: str):
        self.name = database_name
        self.mode = "remote"
        self._account_id = account_id
        self._database_id = database_id
        self._client = httpx.Client(
            base_url=f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}",
            headers={"Authorization": f"Bearer {api_token}"},
            timeout=30.0,
        )

    def _query(self, sql: str) -> dict:
        resp = self._client.post("/query", json={"sql": sql})
        resp.raise_for_status()
        return resp.json()

    def execute(self, sql: str) -> QueryResult:
        start = time.perf_counter()
        data = self._query(sql)

        if not data.get("success"):
            errors = ", ".join(e.get("message", "") for e in data.get("errors", []))
            raise RuntimeError(f"D1 query failed: {errors}")

        result = data["result"][0]
        rows = result.get("results", [])
        columns = list(rows[0].keys()) if rows else []
        duration = (time.perf_counter() - start) * 1000

        return QueryResult(
            columns=columns, rows=rows, row_count=len(rows),
            changes=result.get("meta", {}).get("changes", 0), duration=duration,
        )

    def get_tables(self) -> list[str]:
        result = self.execute(TABLES_SQL)
        return [r["name"] for r in result.rows]

    def get_columns(self, table: str) -> list[ColumnInfo]:
        result = self.execute(f'PRAGMA table_info("{table}")')
        return [
            ColumnInfo(name=r["name"], type=r["type"] or "ANY", notnull=bool(r["notnull"]), default=r["dflt_value"], pk=bool(r["pk"]))
            for r in result.rows
        ]

    def get_indexes(self, table: str | None = None) -> list[IndexInfo]:
        indexes = []
        tables = [table] if table else self.get_tables()
        for t in tables:
            result = self.execute(f'PRAGMA index_list("{t}")')
            for row in result.rows:
                cols_result = self.execute(f'PRAGMA index_info("{row["name"]}")')
                columns = [c["name"] for c in cols_result.rows]
                indexes.append(IndexInfo(name=row["name"], table=t, unique=bool(row["unique"]), columns=columns))
        return indexes

    def close(self) -> None:
        self._client.close()


def _miniflare_hash(unique_key: str, name: str) -> str:
    """Replicate miniflare's durable object namespace ID computation."""
    key = hashlib.sha256(unique_key.encode()).digest()
    name_hmac = hmac.new(key, name.encode(), hashlib.sha256).digest()[:16]
    full_hmac = hmac.new(key, name_hmac, hashlib.sha256).digest()[:16]
    return (name_hmac + full_hmac).hex()


def resolve_local_d1_path(database_id: str, persist_to: str | None = None) -> str | None:
    base_dir = Path(persist_to) if persist_to else Path.cwd() / ".wrangler" / "state"
    d1_dir = base_dir / "v3" / "d1" / "miniflare-D1DatabaseObject"

    # Try computed hash
    hash_name = _miniflare_hash("miniflare-D1DatabaseObject", database_id)
    computed = d1_dir / f"{hash_name}.sqlite"
    if computed.exists():
        return str(computed)

    # Fallback: single sqlite file
    if not d1_dir.exists():
        return None

    sqlite_files = [f for f in d1_dir.iterdir() if f.suffix == ".sqlite" and f.stem != "metadata"]
    if len(sqlite_files) == 1:
        return str(sqlite_files[0])
    return None
