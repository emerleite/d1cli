"""d1cli — Interactive SQL REPL for Cloudflare D1 databases."""

from __future__ import annotations

import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import click
from prompt_toolkit import PromptSession
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.completion import DynamicCompleter
from prompt_toolkit.enums import EditingMode
from prompt_toolkit.history import FileHistory
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.lexers import PygmentsLexer
from pygments.lexers.sql import SqlLexer

from . import __version__
from .commands import handle_command
from .completer import D1Completer
from .config import load_config, save_config, get_connections, get_connection_names, ConnectionProfile
from .connection import (
    Connection, LocalConnection, RemoteConnection,
    resolve_local_d1_path,
)
from .formatter import format_result, is_too_wide
from .style import get_style
from .wrangler import find_wrangler_config, parse_d1_bindings, read_wrangler_auth

# Auto-configure LESS for colors and horizontal scrolling
if "LESS" not in os.environ:
    os.environ["LESS"] = "-SRXF"

DESTRUCTIVE_PATTERN = re.compile(
    r"^\s*(DROP|DELETE|TRUNCATE|ALTER\s+TABLE\s+\w+\s+DROP)\b",
    re.IGNORECASE,
)


def _split_statements(text: str) -> list[str]:
    """Split SQL text into individual statements, respecting string literals."""
    statements = []
    current = []
    in_single = False
    in_double = False

    for ch in text:
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        elif ch == ";" and not in_single and not in_double:
            stmt = "".join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
            continue
        current.append(ch)

    # Remaining text without trailing ;
    stmt = "".join(current).strip()
    if stmt:
        statements.append(stmt)

    return statements


def _humanize_duration(ms: float) -> str:
    """Format duration like pgcli: 0.45ms, 2.3s, 1m 30s."""
    if ms < 1000:
        return f"{ms:.2f}ms"
    secs = ms / 1000
    if secs < 60:
        return f"{secs:.1f}s"
    mins = int(secs // 60)
    remaining = secs % 60
    return f"{mins}m {remaining:.0f}s"


def _create_connection_from_profile(profile: ConnectionProfile) -> Connection:
    """Create a connection from a named profile."""
    is_local = profile.mode == "local"
    api_token = profile.api_token
    account_id = profile.account_id

    if not is_local:
        # Remote — resolve auth
        if not api_token:
            api_token = os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN")
        if not api_token:
            auth = read_wrangler_auth()
            if auth:
                if auth.expiration_time:
                    exp = datetime.fromisoformat(auth.expiration_time.replace("Z", "+00:00"))
                    if exp < datetime.now(timezone.utc):
                        raise click.ClickException("Wrangler OAuth token expired. Run `wrangler login` to refresh.")
                api_token = auth.oauth_token
        if not api_token:
            raise click.ClickException("No API token for this profile. Set api_token in config or run `wrangler login`.")

        if not account_id:
            account_id = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        if not account_id:
            account_id = _detect_account_id(api_token)
        if not account_id:
            raise click.ClickException("Could not detect account ID. Set account_id in profile or CF_ACCOUNT_ID env var.")

        config_path = find_wrangler_config()
        bindings = parse_d1_bindings(config_path) if config_path else []
        binding = _pick_binding(bindings, profile.db, profile.database_id)
        return RemoteConnection(account_id, binding.database_id, api_token, binding.database_name)

    # Local
    config_path = find_wrangler_config()
    bindings = parse_d1_bindings(config_path) if config_path else []
    binding = _pick_binding(bindings, profile.db, profile.database_id)
    sqlite_path = resolve_local_d1_path(binding.database_id, profile.persist_to)
    if not sqlite_path:
        raise click.ClickException("Could not find local D1 database file for this profile.")
    return LocalConnection(sqlite_path, binding.database_name)


def _create_connection(local: bool, persist_to: str | None, db: str | None, database_id: str | None) -> Connection:
    config_path = find_wrangler_config()
    bindings = parse_d1_bindings(config_path) if config_path else []

    if not local:
        api_token = os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN")
        if not api_token:
            auth = read_wrangler_auth()
            if auth:
                if auth.expiration_time:
                    exp = datetime.fromisoformat(auth.expiration_time.replace("Z", "+00:00"))
                    if exp < datetime.now(timezone.utc):
                        raise click.ClickException("Wrangler OAuth token expired. Run `wrangler login` to refresh.")
                api_token = auth.oauth_token

        if not api_token:
            raise click.ClickException(
                "No API token found. Either:\n"
                "  1. Run `wrangler login` (recommended)\n"
                "  2. Set CF_API_TOKEN environment variable"
            )

        account_id = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        if not account_id:
            account_id = _detect_account_id(api_token)
        if not account_id:
            raise click.ClickException("Could not detect account ID. Set CF_ACCOUNT_ID environment variable.")

        binding = _pick_binding(bindings, db, database_id)
        return RemoteConnection(account_id, binding.database_id, api_token, binding.database_name)

    binding = _pick_binding(bindings, db, database_id)
    sqlite_path = resolve_local_d1_path(binding.database_id, persist_to)
    if not sqlite_path:
        raise click.ClickException(
            "Could not find local D1 database file.\n"
            "Make sure you've run `wrangler dev` with --persist-to, or specify --persist-to."
        )
    return LocalConnection(sqlite_path, binding.database_name)


def _pick_binding(bindings, db_name, database_id):
    from .wrangler import D1Binding

    if database_id:
        for b in bindings:
            if b.database_id == database_id:
                return b
        return D1Binding(binding="DB", database_name=database_id[:8], database_id=database_id)
    if db_name:
        for b in bindings:
            if b.database_name == db_name:
                return b
        raise click.ClickException(f'Database "{db_name}" not found in wrangler.toml')
    if len(bindings) == 1:
        return bindings[0]
    if not bindings:
        raise click.ClickException("No D1 databases found in wrangler.toml")
    names = "\n".join(f"  - {b.database_name}" for b in bindings)
    raise click.ClickException(f"Multiple D1 databases found. Use --db to specify:\n{names}")


def _detect_account_id(api_token: str) -> str | None:
    import httpx
    try:
        resp = httpx.get(
            "https://api.cloudflare.com/client/v4/accounts?per_page=1",
            headers={"Authorization": f"Bearer {api_token}"},
            timeout=10.0,
        )
        if resp.is_success:
            data = resp.json()
            accounts = data.get("result", [])
            if accounts:
                return accounts[0]["id"]
    except Exception:
        pass
    return None


def _make_toolbar(conn: Connection, state: dict):
    def toolbar():
        left = f" {conn.name} ({conn.mode})"
        parts = [f"F2:Smart {'on' if state.get('smart_completion', True) else 'off'}"]
        parts.append(f"F4:{'Vi' if state.get('vi_mode') else 'Emacs'}")
        parts.append(f"fmt:{state.get('format', 'table')}")
        if state.get("timing"):
            parts.append("timing")
        if state.get("expanded"):
            parts.append("\\x")
        last_dur = state.get("_last_duration")
        if last_dur is not None:
            parts.append(_humanize_duration(last_dur))
        return left + " | " + " | ".join(parts)
    return toolbar


def _make_bindings(state: dict):
    """Key bindings modeled on pgcli/key_bindings.py."""
    bindings = KeyBindings()

    @bindings.add("enter")
    def handle_enter(event):
        buf = event.current_buffer
        if buf.complete_state:
            buf.complete_state = None
            return
        text = buf.text.strip()
        if not text or text.startswith("\\") or text.lower() in ("exit", "quit") or text.endswith(";"):
            buf.validate_and_handle()
        else:
            buf.insert_text("\n")

    @bindings.add("tab")
    def handle_tab(event):
        """Force autocompletion at cursor — matches pgcli behavior."""
        buf = event.current_buffer
        doc = buf.document
        if doc.on_first_line or doc.current_line.strip():
            if buf.complete_state:
                buf.complete_next()
            else:
                buf.start_completion(select_first=True)

    @bindings.add("f2")
    def toggle_smart_completion(event):
        state["smart_completion"] = not state.get("smart_completion", True)
        status = "on" if state["smart_completion"] else "off"
        # Can't easily show message from keybinding, toggle takes effect on next completion

    @bindings.add("f3")
    def toggle_multiline(event):
        state["multi_line"] = not state.get("multi_line", True)

    @bindings.add("f4")
    def toggle_vi_mode(event):
        state["vi_mode"] = not state.get("vi_mode", False)
        if state["vi_mode"]:
            event.app.editing_mode = EditingMode.VI
        else:
            event.app.editing_mode = EditingMode.EMACS

    @bindings.add("c-space")
    def force_completion(event):
        """Ctrl+Space: force completion (alternative to Tab)."""
        buf = event.current_buffer
        if buf.complete_state:
            buf.complete_next()
        else:
            buf.start_completion(select_first=True)

    return bindings


def _format_prompt(template: str, conn: Connection) -> str:
    """Format prompt string: \\d=database, \\m=mode."""
    return template.replace("\\d", conn.name).replace("\\m", conn.mode)


def _log_query(log_file: str, text: str) -> None:
    """Append query to log file."""
    try:
        with open(Path(log_file).expanduser(), "a") as f:
            f.write(f"-- {datetime.now().isoformat()}\n{text}\n\n")
    except Exception:
        pass


def _run_init_commands(conn: Connection, state: dict, completer: D1Completer) -> None:
    """Execute startup commands from config."""
    init_cmds = state.get("startup_commands", [])
    for cmd in init_cmds:
        cmd = cmd.strip()
        if not cmd:
            continue
        if cmd.startswith("\\") or cmd.startswith("."):
            output = handle_command(cmd, conn, state)
            if output:
                click.echo(output)
        else:
            _execute_and_display(conn, cmd, state, completer)


def _confirm_destructive(sql: str, state: dict) -> bool:
    """Warn before destructive queries. Returns True to proceed, False to cancel."""
    if not state.get("destructive_warning", True):
        return True
    if not DESTRUCTIVE_PATTERN.match(sql):
        return True
    try:
        click.secho(f"\nYou're about to run a destructive command.", fg="red", bold=True)
        click.secho(f"  {sql[:100]}{'...' if len(sql) > 100 else ''}", fg="yellow")
        return click.confirm("Are you sure?", default=False)
    except (KeyboardInterrupt, EOFError):
        return False


def _run_repl(conn: Connection, state: dict) -> None:
    completer = D1Completer(conn, state=state)

    history_path = Path.home() / ".config" / "d1cli" / "history"
    history_path.parent.mkdir(parents=True, exist_ok=True)

    editing_mode = EditingMode.VI if state.get("vi_mode") else EditingMode.EMACS

    style = get_style(
        syntax_style=state.get("syntax_style", "native"),
        wider_menu=state.get("wider_completion_menu", False),
    )

    session: PromptSession = PromptSession(
        lexer=PygmentsLexer(SqlLexer),
        completer=DynamicCompleter(lambda: completer),
        complete_while_typing=True,
        auto_suggest=AutoSuggestFromHistory(),
        history=FileHistory(str(history_path)),
        multiline=True,
        style=style,
        bottom_toolbar=_make_toolbar(conn, state),
        key_bindings=_make_bindings(state),
        prompt_continuation=lambda width, line_number, is_soft_wrap: "." * (width - 1) + " ",
        reserve_space_for_menu=8,
        editing_mode=editing_mode,
        search_ignore_case=True,
    )

    if not state.get("less_chatty"):
        click.echo(f"d1cli v{__version__}")
        click.echo(f"Connected to {conn.name} ({conn.mode})")
        click.echo("Type \\? for help, \\q to quit.")
        click.echo("F2: Smart Completion | F3: Multiline | F4: Vi/Emacs\n")

    # Run init commands from config
    _run_init_commands(conn, state, completer)

    while True:
        try:
            prompt_template = state.get("prompt", "\\d(\\m)> ")
            prompt_str = _format_prompt(prompt_template, conn)
            text = session.prompt(prompt_str)
        except KeyboardInterrupt:
            continue
        except EOFError:
            break

        text = text.strip()
        if not text:
            continue

        # Log query if logging enabled
        log_file = state.get("log_file")
        if log_file:
            _log_query(log_file, text)

        # Backslash or dot commands
        if text.startswith("\\") or text.startswith(".") or text.lower() in ("exit", "quit"):
            try:
                output = handle_command(text, conn, state)
                if output is None:
                    break
                if output:
                    click.echo(output)

                if state.pop("_refresh_completions", False):
                    completer.refresh()

                # Handle \c (switch database or profile)
                switch_target = state.pop("_switch_db", None)
                if switch_target:
                    try:
                        profiles = get_connections(state)
                        if switch_target in profiles:
                            new_conn = _create_connection_from_profile(profiles[switch_target])
                        else:
                            new_conn = _create_connection(
                                conn.mode == "local",
                                state.get("_persist_to"),
                                switch_target, None,
                            )
                        conn.close()
                        conn = new_conn
                        completer = D1Completer(conn, state=state)
                        completer.refresh()
                        click.echo(f"Connected to {conn.name} ({conn.mode})")
                    except Exception as e:
                        click.secho(f"Error switching: {e}", fg="red")
                    continue

                # Handle \watch
                watch_interval = state.pop("_watch", None)
                if watch_interval and state.get("last_query"):
                    _watch_query(conn, state, watch_interval)
                    continue

                deferred_sql = state.pop("_execute_sql", None)
                if deferred_sql:
                    text = deferred_sql
                else:
                    continue
            except Exception as e:
                click.secho(f"Error: {e}", fg="red")
                continue

        # SQL — split into individual statements
        statements = _split_statements(text)
        for sql in statements:
            state["last_query"] = sql
            _execute_and_display(conn, sql, state, completer)

    if not state.get("less_chatty"):
        click.echo("Bye!")
    conn.close()
    save_config(state)


def _execute_and_display(conn: Connection, sql: str, state: dict, completer: D1Completer | None = None) -> None:
    """Execute SQL and display results."""
    # Destructive warning
    if not _confirm_destructive(sql, state):
        click.secho("Cancelled.", fg="yellow")
        return

    try:
        if completer and sql.strip().upper().startswith(("CREATE", "ALTER", "DROP")):
            completer._loaded = False

        row_limit = state.get("row_limit", 1000)
        result = conn.execute(sql, row_limit=row_limit)
        effective_fmt = "vertical" if state.get("expanded") else state.get("format", "table")
        null_string = state.get("null_string", "<null>")
        max_width = state.get("max_column_width", 0)

        output = format_result(result, effective_fmt, null_string=null_string, max_width=max_width)

        # Auto-expand: switch to vertical if result is too wide
        if state.get("auto_expand") and effective_fmt != "vertical":
            try:
                term_width = os.get_terminal_size().columns
            except OSError:
                term_width = 80
            if is_too_wide(output, term_width):
                output = format_result(result, "vertical", null_string=null_string, max_width=max_width)

        if result.truncated:
            click.secho(
                f"Results limited to {row_limit} rows. Add LIMIT to your query or use --row-limit 0 for all rows.",
                fg="red",
            )

        # Output to file if \o is active
        output_file = state.get("output_file")
        if output_file:
            Path(output_file).expanduser().write_text(output + "\n")
            click.echo(f"Output written to {output_file}")

        # Pager
        pager_enabled = state.get("pager_enabled", True)
        try:
            term_height = os.get_terminal_size().lines
        except OSError:
            term_height = 24
        if pager_enabled and output.count("\n") > term_height - 4:
            click.echo_via_pager(output + "\n")
        else:
            click.echo(output)

        # Timing + status
        state["_last_duration"] = result.duration
        if state.get("timing"):
            click.secho(f"Time: {_humanize_duration(result.duration)}", fg="bright_black")

        if completer and sql.strip().upper().startswith(("CREATE", "ALTER", "DROP")):
            completer.refresh()

    except Exception as e:
        if state.get("verbose_errors"):
            import traceback
            click.secho(f"Error: {e}", fg="red")
            click.secho(f"Query: {sql[:200]}", fg="yellow")
            click.secho(traceback.format_exc(), fg="bright_black")
        else:
            click.secho(f"Error: {e}", fg="red")
        if state.get("on_error") == "RESUME":
            pass


def _watch_query(conn: Connection, state: dict, interval: float) -> None:
    """Re-execute the last query every N seconds until Ctrl+C."""
    sql = state.get("last_query")
    if not sql:
        click.secho("No query to watch.", fg="yellow")
        return

    click.echo(f"Watching every {interval}s. Press Ctrl+C to stop.\n")
    try:
        while True:
            click.clear()
            click.secho(f"Every {interval}s  —  {datetime.now().strftime('%H:%M:%S')}\n", fg="bright_black")
            _execute_and_display(conn, sql, state)
            time.sleep(interval)
    except KeyboardInterrupt:
        click.echo("\nWatch stopped.")


@click.command()
@click.option("-c", "--connection", "conn_name", default=None, help="Connection profile name from config")
@click.option("--local/--remote", default=True, help="Connect to local or remote D1")
@click.option("--persist-to", default=None, help="Local persistence directory")
@click.option("--db", default=None, help="Database name from wrangler.toml")
@click.option("--database-id", default=None, help="D1 database ID")
@click.option("-e", "--execute", default=None, help="Execute SQL and exit")
@click.option("-f", "--file", "sql_file", default=None, help="Execute SQL file and exit")
@click.option("--format", "fmt", default=None, type=click.Choice(["table", "json", "csv", "vertical"]))
@click.option("--row-limit", default=None, type=int, help="Max rows (0=no limit, default 1000)")
@click.option("--vi/--emacs", "vi_mode", default=None, help="Vi or Emacs editing mode")
@click.option("--less-chatty", is_flag=True, default=False, help="Suppress banner")
@click.option("--log-file", default=None, help="Log all queries to file")
@click.version_option(__version__)
def cli(conn_name, local, persist_to, db, database_id, execute, sql_file, fmt, row_limit, vi_mode, less_chatty, log_file):
    """Interactive SQL REPL for Cloudflare D1 databases."""
    try:
        # Load config, override with CLI flags
        state = load_config()
        if fmt is not None:
            state["format"] = fmt
        if row_limit is not None:
            state["row_limit"] = row_limit
        if vi_mode is not None:
            state["vi_mode"] = vi_mode
        if less_chatty:
            state["less_chatty"] = True
        if log_file:
            state["log_file"] = log_file
        if persist_to:
            state["_persist_to"] = persist_to

        # Connect via profile or flags
        if conn_name:
            profiles = get_connections(state)
            if conn_name not in profiles:
                available = ", ".join(profiles.keys()) if profiles else "none"
                raise click.ClickException(f'Connection "{conn_name}" not found. Available: {available}')
            conn = _create_connection_from_profile(profiles[conn_name])
        else:
            conn = _create_connection(local, persist_to, db, database_id)

        if execute:
            for stmt in _split_statements(execute):
                result = conn.execute(stmt)
                click.echo(format_result(result, state.get("format", "table")))
            conn.close()
            return

        if sql_file:
            sql = Path(sql_file).read_text()
            for stmt in _split_statements(sql):
                result = conn.execute(stmt)
                click.echo(format_result(result, state.get("format", "table")))
            conn.close()
            return

        _run_repl(conn, state)

    except click.ClickException:
        raise
    except Exception as e:
        raise click.ClickException(str(e))
