"""Tests for D1Completer — modeled on pgcli's test patterns."""

from __future__ import annotations

import pytest
from prompt_toolkit.document import Document

from d1cli.completer import D1Completer, _get_context
from d1cli.connection import Connection, QueryResult, ColumnInfo, IndexInfo


# --- Mock connection ---

class MockConnection(Connection):
    def __init__(self, tables: dict[str, list[str]]):
        self.name = "testdb"
        self.mode = "local"
        self._tables = tables

    def execute(self, sql: str) -> QueryResult:
        return QueryResult(columns=[], rows=[], row_count=0, changes=0, duration=0)

    def get_tables(self) -> list[str]:
        return list(self._tables.keys())

    def get_columns(self, table: str) -> list[ColumnInfo]:
        cols = self._tables.get(table, [])
        return [ColumnInfo(name=c, type="TEXT", notnull=False, default=None, pk=False) for c in cols]

    def get_indexes(self, table: str | None = None) -> list[IndexInfo]:
        return []

    def close(self) -> None:
        pass


# --- Helpers ---

def _meta_text(meta) -> str:
    """Extract plain text from display_meta (FormattedText or str)."""
    if meta is None:
        return ""
    try:
        # FormattedText is iterable as list of (style, text) tuples
        return "".join(text for _, text in meta)
    except TypeError:
        return str(meta)


def get_completions(completer: D1Completer, text: str) -> list[tuple[str, str]]:
    """Return list of (text, display_meta) from completions."""
    doc = Document(text, len(text))
    return [(c.text, _meta_text(c.display_meta)) for c in completer.get_completions(doc, None)]


def get_texts(completer: D1Completer, text: str) -> list[str]:
    """Return just the completion text values."""
    doc = Document(text, len(text))
    return [c.text for c in completer.get_completions(doc, None)]


def make_completer(**tables: list[str]) -> D1Completer:
    """Create a completer with mock schema."""
    conn = MockConnection(tables)
    c = D1Completer(conn)
    c.refresh()
    return c


# --- Context detection tests ---

class TestGetContext:
    def test_empty_input(self):
        assert _get_context("") == "general"

    def test_select_keyword(self):
        assert _get_context("SELECT ") == "column"

    def test_select_partial(self):
        assert _get_context("SELECT na") == "column"

    def test_from_keyword(self):
        assert _get_context("SELECT * FROM ") == "table"

    def test_from_partial(self):
        assert _get_context("SELECT * FROM us") == "table"

    def test_join_keyword(self):
        assert _get_context("SELECT * FROM users JOIN ") == "table"

    def test_where_keyword(self):
        assert _get_context("SELECT * FROM users WHERE ") == "column"

    def test_where_and(self):
        assert _get_context("SELECT * FROM users WHERE id = 1 AND ") == "column"

    def test_update_keyword(self):
        assert _get_context("UPDATE ") == "table"

    def test_insert_into(self):
        assert _get_context("INSERT INTO ") == "table"

    def test_backslash_command(self):
        assert _get_context("\\dt") == "backslash"

    def test_backslash_with_arg(self):
        assert _get_context("\\d ") == "backslash"

    def test_dot_notation(self):
        assert _get_context("SELECT users.") == "dot"

    def test_order_by(self):
        assert _get_context("SELECT * FROM users ORDER BY ") == "column"

    def test_group_by(self):
        assert _get_context("SELECT * FROM users GROUP BY ") == "column"

    def test_set_keyword(self):
        assert _get_context("UPDATE users SET ") == "column"

    def test_general_start(self):
        assert _get_context("CRE") == "general"


# --- Table completion tests ---

class TestTableCompletion:
    def test_tables_after_from(self):
        c = make_completer(users=["id", "name"], orders=["id", "total"])
        texts = get_texts(c, "SELECT * FROM ")
        assert "users" in texts
        assert "orders" in texts

    def test_tables_filtered_by_prefix(self):
        c = make_completer(users=["id"], orders=["id"], sessions=["id"])
        texts = get_texts(c, "SELECT * FROM us")
        assert "users" in texts
        assert "orders" not in texts
        assert "sessions" not in texts

    def test_tables_after_join(self):
        c = make_completer(users=["id"], orders=["id"])
        texts = get_texts(c, "SELECT * FROM users JOIN ")
        assert "orders" in texts

    def test_tables_after_update(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "UPDATE ")
        assert "users" in texts

    def test_tables_after_insert_into(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "INSERT INTO ")
        assert "users" in texts

    def test_fuzzy_match_tables(self):
        c = make_completer(user_accounts=["id"])
        texts = get_texts(c, "SELECT * FROM uacc")
        assert "user_accounts" in texts


# --- Column completion tests ---

class TestColumnCompletion:
    def test_columns_after_select(self):
        c = make_completer(users=["id", "name", "email"])
        texts = get_texts(c, "SELECT ")
        assert "id" in texts
        assert "name" in texts
        assert "email" in texts

    def test_no_keywords_after_select(self):
        c = make_completer(users=["id"])
        completions = get_completions(c, "SELECT ")
        metas = [meta for _, meta in completions]
        assert "keyword" not in metas

    def test_columns_from_query_tables(self):
        c = make_completer(users=["id", "name"], orders=["id", "total"])
        texts = get_texts(c, "SELECT * FROM users WHERE ")
        assert "id" in texts
        assert "name" in texts
        # orders columns should not appear (not in FROM)
        assert "total" not in texts

    def test_columns_filtered_by_prefix(self):
        c = make_completer(users=["id", "name", "email"])
        texts = get_texts(c, "SELECT na")
        assert "name" in texts
        assert "id" not in texts

    def test_tables_also_in_column_context(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "SELECT ")
        assert "users" in texts  # for table.column patterns

    def test_functions_only_when_typing(self):
        c = make_completer(users=["id"])
        # No partial → no functions
        completions = get_completions(c, "SELECT ")
        func_completions = [t for t, m in completions if m == "function"]
        assert len(func_completions) == 0

        # With partial → functions appear
        texts = get_texts(c, "SELECT COU")
        assert "COUNT" in texts


# --- Dot notation tests ---

class TestDotNotation:
    def test_dot_completes_columns(self):
        c = make_completer(users=["id", "name", "email"])
        texts = get_texts(c, "SELECT users.")
        assert "id" in texts
        assert "name" in texts
        assert "email" in texts

    def test_dot_filters_by_partial(self):
        c = make_completer(users=["id", "name", "email"])
        texts = get_texts(c, "SELECT users.na")
        assert "name" in texts
        assert "id" not in texts

    def test_dot_unknown_table(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "SELECT nonexistent.")
        assert texts == []


# --- Backslash command completion tests ---

class TestBackslashCompletion:
    def test_complete_command_names(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "\\")
        assert "\\dt" in texts
        assert "\\d" in texts
        assert "\\schema" in texts
        assert "\\T" in texts
        assert "\\q" in texts

    def test_complete_command_prefix(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "\\d")
        assert "\\dt" in texts
        assert "\\di" in texts
        assert "\\d" in texts

    def test_table_arg_after_describe(self):
        c = make_completer(users=["id"], orders=["id"])
        texts = get_texts(c, "\\d ")
        assert "users" in texts
        assert "orders" in texts

    def test_table_arg_filtered(self):
        c = make_completer(users=["id"], orders=["id"])
        texts = get_texts(c, "\\d us")
        assert "users" in texts
        assert "orders" not in texts

    def test_format_arg_after_T(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "\\T ")
        assert "table" in texts
        assert "json" in texts
        assert "csv" in texts
        assert "vertical" in texts

    def test_schema_suggests_tables(self):
        c = make_completer(users=["id"], messages=["id"])
        texts = get_texts(c, "\\schema ")
        assert "users" in texts
        assert "messages" in texts


# --- General context tests ---

class TestGeneralCompletion:
    def test_keywords_in_general(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "")
        assert "SELECT" in texts
        assert "INSERT" in texts
        assert "CREATE" in texts

    def test_keyword_prefix(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "SEL")
        assert "SELECT" in texts
        assert "INSERT" not in texts

    def test_tables_in_general(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "")
        assert "users" in texts

    def test_functions_in_general(self):
        c = make_completer(users=["id"])
        texts = get_texts(c, "COU")
        assert "COUNT" in texts


# --- Metadata label tests ---

class TestCompletionMetadata:
    def test_table_metadata(self):
        c = make_completer(users=["id"])
        completions = get_completions(c, "SELECT * FROM ")
        metas = {text: meta for text, meta in completions}
        assert metas.get("users") == "table"

    def test_column_metadata(self):
        c = make_completer(users=["id", "name"])
        completions = get_completions(c, "SELECT * FROM users WHERE ")
        metas = {text: meta for text, meta in completions}
        assert metas.get("id") == "column"
        assert metas.get("name") == "column"

    def test_keyword_metadata(self):
        c = make_completer(users=["id"])
        completions = get_completions(c, "SEL")
        metas = {text: meta for text, meta in completions}
        assert metas.get("SELECT") == "keyword"

    def test_function_metadata(self):
        c = make_completer(users=["id"])
        completions = get_completions(c, "SELECT COU")
        metas = {text: meta for text, meta in completions}
        assert metas.get("COUNT") == "function"

    def test_command_has_description(self):
        c = make_completer(users=["id"])
        completions = get_completions(c, "\\dt")
        metas = {text: meta for text, meta in completions}
        assert metas.get("\\dt") == "List tables"
