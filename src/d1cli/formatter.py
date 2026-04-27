"""Output formatting using cli_helpers (same as pgcli)."""

from __future__ import annotations

from typing import Iterator

from cli_helpers.tabular_output import TabularOutputFormatter

from .connection import QueryResult

_formatter = TabularOutputFormatter()


def _preprocess_row(row: list, null_string: str = "<null>", max_width: int = 0) -> list:
    """Apply NULL representation and column width truncation."""
    result = []
    for val in row:
        if val is None:
            result.append(null_string)
        elif max_width > 0 and isinstance(val, str) and len(val) > max_width:
            result.append(val[:max_width - 3] + "...")
        else:
            result.append(val)
    return result


def format_result(
    result: QueryResult,
    fmt: str = "table",
    null_string: str = "<null>",
    max_width: int = 0,
) -> str:
    """Format results as a string."""
    if not result.columns:
        if result.changes > 0:
            return f"{result.changes} row(s) changed"
        return "OK"

    headers = result.columns
    data = [
        _preprocess_row([row.get(col) for col in headers], null_string, max_width)
        for row in result.rows
    ]

    format_name = _map_format(fmt)
    output = _formatter.format_output(data, headers, format_name=format_name)
    lines = list(output)

    footer = f"({result.row_count} row{'s' if result.row_count != 1 else ''})"
    lines.append(footer)

    return "\n".join(lines)


def format_result_iter(
    result: QueryResult,
    fmt: str = "table",
    null_string: str = "<null>",
    max_width: int = 0,
) -> Iterator[str]:
    """Stream large results line by line."""
    if not result.columns:
        if result.changes > 0:
            yield f"{result.changes} row(s) changed\n"
        else:
            yield "OK\n"
        return

    headers = result.columns
    data = (
        _preprocess_row([row.get(col) for col in headers], null_string, max_width)
        for row in result.rows
    )

    format_name = _map_format(fmt)
    for line in _formatter.format_output(data, headers, format_name=format_name):
        yield line + "\n"

    yield f"({result.row_count} row{'s' if result.row_count != 1 else ''})\n"


def is_too_wide(text: str, terminal_width: int) -> bool:
    """Check if any line exceeds terminal width (for auto-expand)."""
    return any(len(line) > terminal_width for line in text.split("\n")[:5])


def _map_format(fmt: str) -> str:
    """Map our format names to cli_helpers format names."""
    mapping = {
        "table": "ascii",
        "csv": "csv",
        "json": "json",
        "vertical": "vertical",
    }
    return mapping.get(fmt, "ascii")
