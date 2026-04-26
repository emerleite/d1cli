"""Backslash command handlers."""

from __future__ import annotations

from typing import TYPE_CHECKING

import click

if TYPE_CHECKING:
    from .connection import Connection

OUTPUT_FORMATS = ("table", "csv", "json", "vertical")


def handle_command(text: str, conn: Connection, state: dict) -> str | None:
    """Handle a backslash command. Returns output string, or None to quit."""
    parts = text.strip().split(None, 1)
    cmd = parts[0].lower()
    arg = parts[1] if len(parts) > 1 else ""

    if cmd == "\\dt":
        return _list_tables(conn)
    elif cmd == "\\d":
        if not arg:
            return "Usage: \\d <table_name>"
        return _describe_table(conn, arg)
    elif cmd == "\\di":
        return _list_indexes(conn, arg or None)
    elif cmd == "\\schema":
        if not arg:
            return "Usage: \\schema <table_name>"
        return _show_schema(conn, arg)
    elif cmd in ("\\t", "\\T"):
        if not arg or arg not in OUTPUT_FORMATS:
            return f"Current format: {state['format']}\nAvailable: {', '.join(OUTPUT_FORMATS)}"
        state["format"] = arg
        return f"Output format set to: {arg}"
    elif cmd == "\\x":
        state["expanded"] = not state["expanded"]
        return f"Expanded display is {'on' if state['expanded'] else 'off'}"
    elif cmd == "\\timing":
        state["timing"] = not state["timing"]
        return f"Timing is {'on' if state['timing'] else 'off'}"
    elif cmd in ("\\?", "\\help"):
        return _help()
    elif cmd in ("\\q", "exit", "quit"):
        return None  # signals quit
    else:
        return f"Unknown command: {cmd}\nType \\? for help."


def _list_tables(conn: Connection) -> str:
    tables = conn.get_tables()
    if not tables:
        return "No tables found."
    return "\n".join(tables)


def _describe_table(conn: Connection, table: str) -> str:
    columns = conn.get_columns(table)
    if not columns:
        return f'Table "{table}" not found.'

    lines = [f"Table: {table}", ""]
    header = f"{'Column':<20} {'Type':<12} {'Nullable':<10} {'Default':<15} {'PK'}"
    lines.append(header)
    lines.append("-" * len(header))
    for c in columns:
        nullable = "NO" if c.notnull else "YES"
        default = c.default or ""
        pk = "YES" if c.pk else ""
        lines.append(f"{c.name:<20} {c.type:<12} {nullable:<10} {default:<15} {pk}")

    indexes = conn.get_indexes(table)
    if indexes:
        lines.append("")
        lines.append("Indexes:")
        for idx in indexes:
            unique = " UNIQUE" if idx.unique else ""
            cols = ", ".join(idx.columns)
            lines.append(f"  {idx.name}{unique} ({cols})")

    return "\n".join(lines)


def _list_indexes(conn: Connection, table: str | None) -> str:
    indexes = conn.get_indexes(table)
    if not indexes:
        return "No indexes found."

    lines = []
    for idx in indexes:
        unique = " UNIQUE" if idx.unique else ""
        cols = ", ".join(idx.columns)
        lines.append(f"{idx.name:<30} {idx.table:<20}{unique} ({cols})")
    return "\n".join(lines)


def _show_schema(conn: Connection, table: str) -> str:
    result = conn.execute(
        f"SELECT sql FROM sqlite_master WHERE name = '{table}' AND sql IS NOT NULL"
    )
    if not result.rows:
        return f'Table "{table}" not found.'

    lines = [row["sql"] + ";" for row in result.rows]

    idx_result = conn.execute(
        f"SELECT sql FROM sqlite_master WHERE tbl_name = '{table}' AND type = 'index' AND sql IS NOT NULL"
    )
    for row in idx_result.rows:
        lines.append(row["sql"] + ";")

    return "\n".join(lines)


def _help() -> str:
    return """d1cli commands:

  \\dt              List tables
  \\d <table>       Describe table (columns, indexes)
  \\di [table]      List indexes
  \\schema <table>  Show CREATE statement
  \\T <format>      Set output format (table, json, csv, vertical)
  \\x               Toggle expanded (vertical) output
  \\timing          Toggle query timing
  \\? or \\help      Show this help
  \\q or exit       Quit

Queries end with ; for execution. Multi-line input is supported.
Tab completion works for commands, tables, columns, and formats."""
