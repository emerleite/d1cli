"""Backslash command handlers — modeled on pgcli/pgspecial."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .connection import Connection

OUTPUT_FORMATS = ("table", "csv", "json", "vertical")

# Named queries storage
_NAMED_QUERIES_PATH = Path.home() / ".config" / "d1cli" / "named_queries.json"


def handle_command(text: str, conn: Connection, state: dict) -> str | None:
    """Handle a backslash command. Returns output string, or None to quit."""
    parts = text.strip().split(None, 1)
    cmd = parts[0]
    arg = parts[1].strip() if len(parts) > 1 else ""

    # Case-sensitive commands: \T, \dv, etc. Case-insensitive for the rest.
    cmd_lower = cmd.lower()

    # --- Schema inspection ---
    if cmd_lower == "\\dt":
        return _list_tables(conn)
    elif cmd_lower == "\\d" and not arg:
        return _list_tables(conn)
    elif cmd_lower == "\\d":
        return _describe_table(conn, arg)
    elif cmd_lower == "\\di":
        return _list_indexes(conn, arg or None)
    elif cmd_lower == "\\dv":
        return _list_views(conn)
    elif cmd_lower == "\\schema":
        if not arg:
            return "Usage: \\schema <table_name>"
        return _show_schema(conn, arg)

    # --- Output ---
    elif cmd in ("\\t", "\\T"):
        if not arg or arg not in OUTPUT_FORMATS:
            return f"Current format: {state['format']}\nAvailable: {', '.join(OUTPUT_FORMATS)}"
        state["format"] = arg
        return f"Output format set to: {arg}"
    elif cmd_lower == "\\x":
        state["expanded"] = not state["expanded"]
        return f"Expanded display is {'on' if state['expanded'] else 'off'}"
    elif cmd_lower == "\\timing":
        state["timing"] = not state["timing"]
        return f"Timing is {'on' if state['timing'] else 'off'}"
    elif cmd_lower == "\\pager":
        if not arg:
            pager = state.get("pager", os.environ.get("PAGER", "less"))
            pager_on = state.get("pager_enabled", True)
            return f"Pager: {pager} ({'on' if pager_on else 'off'})"
        if arg.lower() in ("off", "disable"):
            state["pager_enabled"] = False
            return "Pager disabled."
        if arg.lower() in ("on", "enable"):
            state["pager_enabled"] = True
            return "Pager enabled."
        state["pager"] = arg
        state["pager_enabled"] = True
        return f"Pager set to: {arg}"
    elif cmd_lower == "\\o":
        if not arg:
            if state.get("output_file"):
                state["output_file"] = None
                return "Output to file stopped."
            return "No output file set. Usage: \\o <filename>"
        state["output_file"] = arg
        return f"Output will be saved to: {arg}"

    # --- Editing ---
    elif cmd_lower == "\\e":
        return _edit_query(state)
    elif cmd_lower == "\\i":
        if not arg:
            return "Usage: \\i <filename>"
        return _execute_file(conn, arg, state)

    # --- Shell ---
    elif cmd.startswith("\\!"):
        shell_cmd = arg or (cmd[2:] if len(cmd) > 2 else "")
        if not shell_cmd:
            return "Usage: \\! <command>"
        return _shell_command(shell_cmd)

    # --- Completions ---
    elif cmd_lower in ("\\#", "\\refresh"):
        state["_refresh_completions"] = True
        return "Auto-completions refreshed."

    # --- Named queries ---
    elif cmd_lower == "\\ns":
        if not arg:
            return "Usage: \\ns <name> <query>"
        return _save_named_query(arg, state)
    elif cmd_lower == "\\n":
        if not arg:
            return _list_named_queries()
        return _get_named_query(arg, state)
    elif cmd_lower == "\\nd":
        if not arg:
            return "Usage: \\nd <name>"
        return _delete_named_query(arg)

    # --- Help & Quit ---
    elif cmd_lower in ("\\?", "\\help"):
        return _help()
    elif cmd_lower in ("\\q", "exit", "quit"):
        return None  # signals quit
    else:
        return f"Unknown command: {cmd}\nType \\? for help."


def _list_tables(conn: Connection) -> str:
    tables = conn.get_tables()
    if not tables:
        return "No tables found."
    return "\n".join(tables)


def _list_views(conn: Connection) -> str:
    result = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='view' ORDER BY name"
    )
    if not result.rows:
        return "No views found."
    return "\n".join(row["name"] for row in result.rows)


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


def _edit_query(state: dict) -> str:
    """Open last query in $EDITOR. Returns the edited SQL to execute."""
    editor = os.environ.get("EDITOR", "vi")
    last_query = state.get("last_query", "")

    with tempfile.NamedTemporaryFile(suffix=".sql", mode="w", delete=False) as f:
        f.write(last_query)
        f.flush()
        tmp_path = f.name

    try:
        subprocess.call([editor, tmp_path])
        edited = Path(tmp_path).read_text().strip()
        if edited:
            state["_execute_sql"] = edited
            return f"Executing: {edited[:80]}{'...' if len(edited) > 80 else ''}"
        return "Empty query, nothing to execute."
    finally:
        os.unlink(tmp_path)


def _execute_file(conn: Connection, filename: str, state: dict) -> str:
    """Execute SQL from a file."""
    path = Path(filename).expanduser()
    if not path.exists():
        return f"File not found: {filename}"
    sql = path.read_text().strip()
    if not sql:
        return "Empty file."
    state["_execute_sql"] = sql
    return f"Executing {path.name} ({len(sql)} chars)"


def _shell_command(cmd: str) -> str:
    """Execute a shell command and return output."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=30
        )
        output = result.stdout
        if result.stderr:
            output += result.stderr
        return output.rstrip() if output else "(no output)"
    except subprocess.TimeoutExpired:
        return "Command timed out (30s limit)."
    except Exception as e:
        return f"Error: {e}"


def _load_named_queries() -> dict[str, str]:
    if not _NAMED_QUERIES_PATH.exists():
        return {}
    try:
        return json.loads(_NAMED_QUERIES_PATH.read_text())
    except Exception:
        return {}


def _save_named_queries(queries: dict[str, str]) -> None:
    _NAMED_QUERIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    _NAMED_QUERIES_PATH.write_text(json.dumps(queries, indent=2))


def _save_named_query(arg: str, state: dict) -> str:
    parts = arg.split(None, 1)
    name = parts[0]
    if len(parts) > 1:
        query = parts[1]
    else:
        query = state.get("last_query", "")
        if not query:
            return "Usage: \\ns <name> <query> — or run a query first, then \\ns <name>"

    queries = _load_named_queries()
    queries[name] = query
    _save_named_queries(queries)
    return f"Saved query '{name}': {query[:60]}{'...' if len(query) > 60 else ''}"


def _list_named_queries() -> str:
    queries = _load_named_queries()
    if not queries:
        return "No named queries. Use \\ns <name> <query> to save one."
    lines = []
    for name, query in queries.items():
        lines.append(f"  {name:<20} {query[:60]}{'...' if len(query) > 60 else ''}")
    return "Named queries:\n" + "\n".join(lines)


def _get_named_query(name: str, state: dict) -> str:
    queries = _load_named_queries()
    if name not in queries:
        return f"Named query '{name}' not found. Use \\n to list."
    state["_execute_sql"] = queries[name]
    return f"Executing '{name}': {queries[name][:80]}"


def _delete_named_query(name: str) -> str:
    queries = _load_named_queries()
    if name not in queries:
        return f"Named query '{name}' not found."
    del queries[name]
    _save_named_queries(queries)
    return f"Deleted named query '{name}'."


def _help() -> str:
    return """d1cli commands:

  \\dt              List tables.
  \\d [table]       List or describe tables.
  \\di [table]      List indexes.
  \\dv              List views.
  \\schema <table>  Show CREATE statement.

  \\T <format>      Change output format (table, json, csv, vertical).
  \\x               Toggle expanded output.
  \\timing          Toggle query timing.
  \\pager [cmd]     Set PAGER. \\pager off to disable.
  \\o [file]        Send output to file. \\o to stop.

  \\e               Edit last query in $EDITOR.
  \\i <file>        Execute commands from file.
  \\! <cmd>         Execute shell command.

  \\n [name]        List or execute named queries.
  \\ns <name>       Save last query as named query.
  \\nd <name>       Delete named query.

  \\# / \\refresh    Refresh auto-completions.
  \\? / \\help       Show this help.
  \\q / exit        Quit d1cli."""
