"""Context-aware SQL completer for D1."""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING

from prompt_toolkit.completion import Completer, Completion

if TYPE_CHECKING:
    from prompt_toolkit.document import Document
    from prompt_toolkit.completion import CompleteEvent
    from .connection import Connection

SQL_KEYWORDS = [
    "ABORT", "ACTION", "ADD", "AFTER", "ALL", "ALTER", "AND", "AS", "ASC",
    "AUTOINCREMENT", "BEFORE", "BEGIN", "BETWEEN", "BY", "CASCADE", "CASE",
    "CAST", "CHECK", "COLLATE", "COLUMN", "COMMIT", "CONFLICT", "CONSTRAINT",
    "CREATE", "CROSS", "CURRENT_DATE", "CURRENT_TIME", "CURRENT_TIMESTAMP",
    "DATABASE", "DEFAULT", "DELETE", "DESC", "DISTINCT", "DROP", "EACH",
    "ELSE", "END", "ESCAPE", "EXCEPT", "EXISTS", "EXPLAIN", "FOREIGN",
    "FROM", "FULL", "GLOB", "GROUP", "HAVING", "IF", "IGNORE", "IN",
    "INDEX", "INNER", "INSERT", "INTEGER", "INTERSECT", "INTO", "IS",
    "JOIN", "KEY", "LEFT", "LIKE", "LIMIT", "NOT", "NULL", "OFFSET",
    "ON", "OR", "ORDER", "OUTER", "PRAGMA", "PRIMARY", "REAL", "RECURSIVE",
    "REFERENCES", "REPLACE", "RESTRICT", "RIGHT", "ROLLBACK", "ROW",
    "SELECT", "SET", "TABLE", "TEXT", "THEN", "TRANSACTION", "TRIGGER",
    "UNION", "UNIQUE", "UPDATE", "USING", "VACUUM", "VALUES", "VIEW",
    "VIRTUAL", "WHEN", "WHERE", "WITH",
]

SQLITE_FUNCTIONS = [
    "AVG", "COUNT", "GROUP_CONCAT", "MAX", "MIN", "SUM", "TOTAL",
    "ABS", "CHANGES", "CHAR", "COALESCE", "HEX", "IFNULL", "IIF",
    "INSTR", "LAST_INSERT_ROWID", "LENGTH", "LOWER", "LTRIM", "NULLIF",
    "PRINTF", "QUOTE", "RANDOM", "RANDOMBLOB", "REPLACE", "ROUND",
    "RTRIM", "SIGN", "SOUNDEX", "SUBSTR", "SUBSTRING", "TOTAL_CHANGES",
    "TRIM", "TYPEOF", "UNICODE", "UPPER", "ZEROBLOB",
    "DATE", "TIME", "DATETIME", "JULIANDAY", "STRFTIME", "UNIXEPOCH",
    "JSON", "JSON_ARRAY", "JSON_ARRAY_LENGTH", "JSON_EXTRACT",
    "JSON_INSERT", "JSON_OBJECT", "JSON_PATCH", "JSON_REMOVE",
    "JSON_REPLACE", "JSON_SET", "JSON_TYPE", "JSON_VALID",
    "JSON_GROUP_ARRAY", "JSON_GROUP_OBJECT", "JSON_EACH", "JSON_TREE",
]

BACKSLASH_COMMANDS = {
    "\\dt": "List tables",
    "\\d": "List or describe tables",
    "\\di": "List indexes",
    "\\dv": "List views",
    "\\schema": "Show CREATE statement",
    "\\T": "Change output format",
    "\\x": "Toggle expanded output",
    "\\timing": "Toggle query timing",
    "\\pager": "Set PAGER",
    "\\o": "Send output to file",
    "\\e": "Edit query with external editor",
    "\\i": "Execute commands from file",
    "\\!": "Execute shell command",
    "\\n": "List or execute named queries",
    "\\ns": "Save a named query",
    "\\nd": "Delete a named query",
    "\\v": "Toggle verbose errors",
    "\\c": "Switch database",
    "\\conninfo": "Show connection details",
    "\\watch": "Re-execute query every N seconds",
    "\\#": "Refresh auto-completions",
    "\\refresh": "Refresh auto-completions",
    "\\?": "Show commands",
    "\\q": "Quit d1cli",
    # SQLite dot-commands (litecli compatibility)
    ".tables": "List tables",
    ".schema": "Show CREATE statements",
    ".indexes": "List indexes",
    ".databases": "List attached databases",
    ".views": "List views",
    ".help": "Show help",
    ".quit": "Quit",
}

OUTPUT_FORMATS = ["table", "csv", "json", "vertical"]


def _extract_tables(sql: str) -> list[str]:
    tables = []
    for pattern in (r"\bFROM\s+(\w+)", r"\bJOIN\s+(\w+)", r"\bUPDATE\s+(\w+)", r"\bINTO\s+(\w+)"):
        tables.extend(m.group(1) for m in re.finditer(pattern, sql, re.IGNORECASE))
    return tables


def _get_context(text: str) -> str:
    if text.lstrip().startswith("\\") or text.lstrip().startswith("."):
        return "backslash"

    words = text.split()
    if not words:
        return "general"

    last_word = words[-1]
    # Dot notation (table.column) — but not dot-commands
    if "." in last_word and not text.endswith(" ") and not last_word.startswith("."):
        return "dot"

    prev_words = words[:-1] if not text.endswith(" ") else words
    for w in reversed(prev_words):
        upper = w.upper()
        if upper in ("FROM", "JOIN", "INTO", "TABLE", "UPDATE"):
            return "table"
        if upper in ("SELECT", "WHERE", "SET", "ON", "AND", "OR", "BY", "HAVING"):
            return "column"
        if upper in ("FROM", "WHERE", "SELECT", "ORDER", "GROUP", "LIMIT"):
            break

    return "general"


def _fuzzy_match(partial: str, candidate: str) -> bool:
    p = partial.lower()
    c = candidate.lower()
    pi = 0
    for ch in c:
        if pi < len(p) and ch == p[pi]:
            pi += 1
    return pi == len(p)


class D1Completer(Completer):
    def __init__(self, conn: Connection, state: dict | None = None):
        self.conn = conn
        self.state = state or {}
        self.tables: list[str] = []
        self.columns_by_table: dict[str, list[str]] = {}
        self._loaded = False

    def refresh(self) -> None:
        try:
            self.tables = self.conn.get_tables()
            self.columns_by_table = {}
            for t in self.tables:
                cols = self.conn.get_columns(t)
                self.columns_by_table[t] = [c.name for c in cols]
            self._loaded = True
        except Exception:
            pass

    def _get_database_names(self) -> list[str]:
        try:
            from .wrangler import find_wrangler_config, parse_d1_bindings
            config = find_wrangler_config()
            if config:
                bindings = parse_d1_bindings(config)
                return [b.database_name for b in bindings]
        except Exception:
            pass
        return []

    def _get_named_query_names(self) -> list[str]:
        try:
            import json
            path = Path.home() / ".config" / "d1cli" / "named_queries.json"
            if path.exists():
                return list(json.loads(path.read_text()).keys())
        except Exception:
            pass
        return []

    def _apply_casing(self, keyword: str, word: str) -> str:
        """Apply keyword casing preference (pgcli keyword_casing)."""
        mode = self.state.get("keyword_casing", "auto")
        if mode == "upper":
            return keyword.upper()
        elif mode == "lower":
            return keyword.lower()
        else:  # auto — match user's input case
            if word and word == word.lower():
                return keyword.lower()
            elif word and word == word.upper():
                return keyword.upper()
            return keyword  # mixed or empty → keep original (uppercase)

    def _all_columns(self) -> list[str]:
        seen = set()
        result = []
        for cols in self.columns_by_table.values():
            for c in cols:
                if c not in seen:
                    seen.add(c)
                    result.append(c)
        return result

    def get_completions(self, document: Document, complete_event: CompleteEvent):
        if not self._loaded:
            self.refresh()

        text = document.text_before_cursor
        word = document.get_word_before_cursor()
        context = _get_context(text)

        if context == "backslash":
            yield from self._complete_backslash(text, word)
        elif context == "dot":
            yield from self._complete_dot(text)
        elif context == "table":
            yield from self._complete_tables(word)
        elif context == "column":
            yield from self._complete_columns(text, word)
        else:
            yield from self._complete_general(word)

    def _complete_backslash(self, text: str, word: str):
        parts = text.strip().split(None, 1)
        cmd = parts[0] if parts else ""

        if len(parts) > 1 or (len(parts) == 1 and text.endswith(" ")):
            # Completing argument
            arg_partial = parts[1] if len(parts) > 1 else ""
            cmd_name = parts[0]

            if cmd_name in ("\\d", "\\di", "\\schema"):
                for t in self.tables:
                    if t.lower().startswith(arg_partial.lower()):
                        yield Completion(t, -len(arg_partial), display_meta="table")
            elif cmd_name == "\\T":
                for f in OUTPUT_FORMATS:
                    if f.startswith(arg_partial.lower()):
                        yield Completion(f, -len(arg_partial), display_meta="format")
            elif cmd_name == "\\c":
                for name in self._get_database_names():
                    if name.lower().startswith(arg_partial.lower()):
                        yield Completion(name, -len(arg_partial), display_meta="database")
            elif cmd_name == "\\pager":
                for opt in ("on", "off", "less", "more"):
                    if opt.startswith(arg_partial.lower()):
                        yield Completion(opt, -len(arg_partial))
            elif cmd_name == "\\n":
                for name in self._get_named_query_names():
                    if name.lower().startswith(arg_partial.lower()):
                        yield Completion(name, -len(arg_partial), display_meta="query")
            elif cmd_name == "\\nd":
                for name in self._get_named_query_names():
                    if name.lower().startswith(arg_partial.lower()):
                        yield Completion(name, -len(arg_partial), display_meta="query")
        else:
            # Completing command name
            for name, desc in BACKSLASH_COMMANDS.items():
                if name.startswith(cmd):
                    yield Completion(name, -len(cmd), display_meta=desc)

    def _complete_dot(self, text: str):
        words = text.split()
        last = words[-1] if words else ""
        dot_idx = last.rfind(".")
        table_part = last[:dot_idx]
        col_partial = last[dot_idx + 1:]

        columns = self.columns_by_table.get(table_part, [])
        for c in columns:
            if not col_partial or c.lower().startswith(col_partial.lower()):
                yield Completion(c, -len(col_partial), display_meta="column")

    def _complete_tables(self, word: str):
        for t in self.tables:
            if not word or t.lower().startswith(word.lower()):
                yield Completion(t, -len(word), display_meta="table")
            elif len(word) >= 2 and _fuzzy_match(word, t):
                yield Completion(t, -len(word), display_meta="table")

    def _complete_columns(self, text: str, word: str):
        query_tables = _extract_tables(text)

        # Columns from query tables first
        if query_tables:
            seen = set()
            for t in query_tables:
                for c in self.columns_by_table.get(t, []):
                    if c not in seen:
                        seen.add(c)
                        if not word or c.lower().startswith(word.lower()):
                            yield Completion(c, -len(word), display_meta="column")
                        elif len(word) >= 2 and _fuzzy_match(word, c):
                            yield Completion(c, -len(word), display_meta="column")
        else:
            for c in self._all_columns():
                if not word or c.lower().startswith(word.lower()):
                    yield Completion(c, -len(word), display_meta="column")

        # Tables
        for t in self.tables:
            if not word or t.lower().startswith(word.lower()):
                yield Completion(t, -len(word), display_meta="table")

        # Functions only when typing
        if word:
            for f in SQLITE_FUNCTIONS:
                if f.lower().startswith(word.lower()):
                    yield Completion(self._apply_casing(f, word), -len(word), display_meta="function")

    def _complete_general(self, word: str):
        for kw in SQL_KEYWORDS:
            if not word or kw.lower().startswith(word.lower()):
                yield Completion(self._apply_casing(kw, word), -len(word), display_meta="keyword")
        for f in SQLITE_FUNCTIONS:
            if not word or f.lower().startswith(word.lower()):
                yield Completion(self._apply_casing(f, word), -len(word), display_meta="function")
        for t in self.tables:
            if not word or t.lower().startswith(word.lower()):
                yield Completion(t, -len(word), display_meta="table")
        for c in self._all_columns():
            if not word or c.lower().startswith(word.lower()):
                yield Completion(c, -len(word), display_meta="column")
