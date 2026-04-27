"""Prompt styling — pgcli-style configurable themes."""

from __future__ import annotations

from prompt_toolkit.styles import Style, merge_styles
from pygments.styles import get_style_by_name

# Base UI styles (completion menu, toolbar)
_UI_STYLE = {
    "completion-menu.completion": "bg:#333333 #ffffff",
    "completion-menu.completion.current": "bg:#00aaaa #000000",
    "completion-menu.meta.completion": "bg:#444444 #aaaaaa",
    "completion-menu.meta.completion.current": "bg:#00aaaa #000000",
    "completion-menu.multi-column-meta": "bg:#444444 #aaaaaa",
    "bottom-toolbar": "bg:#222222 #aaaaaa",
    "bottom-toolbar.text": "#aaaaaa",
}

# Wider completion menu style
_WIDER_STYLE = {
    "completion-menu": "bg:#333333",
}

AVAILABLE_STYLES = [
    "native", "monokai", "solarized-dark", "solarized-light",
    "vim", "friendly", "default",
]


def get_style(syntax_style: str = "native", wider_menu: bool = False) -> Style:
    """Build prompt_toolkit Style combining Pygments theme + UI styles."""
    ui = dict(_UI_STYLE)
    if wider_menu:
        ui.update(_WIDER_STYLE)

    return Style.from_dict(ui)


# Default style for backwards compatibility
D1CLI_STYLE = get_style()
