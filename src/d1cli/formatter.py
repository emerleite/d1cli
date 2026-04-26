"""Output formatting using cli_helpers (same as pgcli)."""

from __future__ import annotations

from typing import Iterator

from cli_helpers.tabular_output import TabularOutputFormatter

from .connection import QueryResult

_formatter = TabularOutputFormatter()


def format_result(result: QueryResult, fmt: str = "table") -> str:
    """Format small results as a string."""
    if not result.columns:
        if result.changes > 0:
            return f"{result.changes} row(s) changed"
        return "OK"

    headers = result.columns
    data = [[row.get(col) for col in headers] for row in result.rows]

    format_name = _map_format(fmt)
    output = _formatter.format_output(data, headers, format_name=format_name)
    lines = list(output)

    footer = f"({result.row_count} row{'s' if result.row_count != 1 else ''})"
    lines.append(footer)

    return "\n".join(lines)


def format_result_iter(result: QueryResult, fmt: str = "table") -> Iterator[str]:
    """Stream large results line by line — never builds full string in memory."""
    if not result.columns:
        if result.changes > 0:
            yield f"{result.changes} row(s) changed\n"
        else:
            yield "OK\n"
        return

    headers = result.columns
    data = ([row.get(col) for col in headers] for row in result.rows)

    format_name = _map_format(fmt)
    for line in _formatter.format_output(data, headers, format_name=format_name):
        yield line + "\n"

    yield f"({result.row_count} row{'s' if result.row_count != 1 else ''})\n"


def _map_format(fmt: str) -> str:
    """Map our format names to cli_helpers format names."""
    mapping = {
        "table": "ascii",
        "csv": "csv",
        "json": "json",
        "vertical": "vertical",
    }
    return mapping.get(fmt, "ascii")
