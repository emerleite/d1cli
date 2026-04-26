"""d1cli — Interactive SQL REPL for Cloudflare D1 databases."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import click
from prompt_toolkit import PromptSession
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.completion import ThreadedCompleter
from prompt_toolkit.history import FileHistory
from prompt_toolkit.lexers import PygmentsLexer
from pygments.lexers.sql import SqlLexer

from . import __version__
from .commands import handle_command
from .completer import D1Completer
from .connection import (
    Connection, LocalConnection, RemoteConnection,
    resolve_local_d1_path,
)
from .formatter import format_result
from .style import D1CLI_STYLE
from .wrangler import find_wrangler_config, parse_d1_bindings, read_wrangler_auth


def _create_connection(local: bool, persist_to: str | None, db: str | None, database_id: str | None) -> Connection:
    config_path = find_wrangler_config()
    bindings = parse_d1_bindings(config_path) if config_path else []

    if not local:
        # Remote mode
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

    # Local mode
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
        mode = conn.mode
        fmt = state["format"]
        timing = "on" if state["timing"] else "off"
        expanded = "on" if state["expanded"] else "off"
        return f" {conn.name} ({mode}) | format: {fmt} | timing: {timing} | expanded: {expanded}"
    return toolbar


def _run_repl(conn: Connection, fmt: str) -> None:
    completer = D1Completer(conn)
    state = {"format": fmt, "timing": False, "expanded": False}

    history_path = Path.home() / ".config" / "d1cli" / "history"
    history_path.parent.mkdir(parents=True, exist_ok=True)

    session: PromptSession = PromptSession(
        lexer=PygmentsLexer(SqlLexer),
        completer=ThreadedCompleter(completer),
        complete_while_typing=True,
        auto_suggest=AutoSuggestFromHistory(),
        history=FileHistory(str(history_path)),
        multiline=True,
        style=D1CLI_STYLE,
        bottom_toolbar=_make_toolbar(conn, state),
    )

    click.echo(f"d1cli v{__version__}")
    click.echo(f"Connected to {conn.name} ({conn.mode})")
    click.echo("Type \\? for help, \\q to quit.\n")

    while True:
        try:
            prompt_str = f"{conn.name}({conn.mode})> "
            text = session.prompt(prompt_str)
        except KeyboardInterrupt:
            continue
        except EOFError:
            break

        text = text.strip()
        if not text:
            continue

        # Backslash commands
        if text.startswith("\\") or text.lower() in ("exit", "quit"):
            try:
                output = handle_command(text, conn, state)
                if output is None:
                    break  # quit
                click.echo(output)
            except Exception as e:
                click.secho(f"Error: {e}", fg="red")
            continue

        # SQL — strip trailing semicolon for execution
        sql = text.rstrip(";").strip() if text.endswith(";") else text

        try:
            # Refresh schema on DDL
            if sql.strip().upper().startswith(("CREATE", "ALTER", "DROP")):
                completer._loaded = False

            result = conn.execute(sql)
            effective_fmt = "vertical" if state["expanded"] else state["format"]
            output = format_result(result, effective_fmt)

            # Use pager for large output
            term_height = click.get_terminal_size()[1]
            lines = output.split("\n")
            if len(lines) > term_height - 4:
                click.echo_via_pager(output + "\n")
            else:
                click.echo(output)

            if state["timing"]:
                click.secho(f"Time: {result.duration:.2f}ms", fg="bright_black")

        except Exception as e:
            click.secho(f"Error: {e}", fg="red")

    click.echo("Bye!")
    conn.close()


@click.command()
@click.option("--local/--remote", default=True, help="Connect to local or remote D1")
@click.option("--persist-to", default=None, help="Local persistence directory")
@click.option("--db", default=None, help="Database name from wrangler.toml")
@click.option("--database-id", default=None, help="D1 database ID")
@click.option("-e", "--execute", default=None, help="Execute SQL and exit")
@click.option("-f", "--file", "sql_file", default=None, help="Execute SQL file and exit")
@click.option("--format", "fmt", default="table", type=click.Choice(["table", "json", "csv", "vertical"]))
@click.version_option(__version__)
def cli(local, persist_to, db, database_id, execute, sql_file, fmt):
    """Interactive SQL REPL for Cloudflare D1 databases."""
    try:
        conn = _create_connection(local, persist_to, db, database_id)

        if execute:
            result = conn.execute(execute)
            click.echo(format_result(result, fmt))
            conn.close()
            return

        if sql_file:
            sql = Path(sql_file).read_text()
            result = conn.execute(sql)
            click.echo(format_result(result, fmt))
            conn.close()
            return

        _run_repl(conn, fmt)

    except click.ClickException:
        raise
    except Exception as e:
        raise click.ClickException(str(e))
