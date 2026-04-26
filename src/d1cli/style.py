"""Prompt styling — pgcli/mycli native color scheme."""

from __future__ import annotations

from prompt_toolkit.styles import Style

D1CLI_STYLE = Style.from_dict({
    "completion-menu.completion": "bg:#333333 #ffffff",
    "completion-menu.completion.current": "bg:#00aaaa #000000",
    "completion-menu.meta.completion": "bg:#444444 #aaaaaa",
    "completion-menu.meta.completion.current": "bg:#00aaaa #000000",
    "bottom-toolbar": "bg:#222222 #aaaaaa",
    "bottom-toolbar.text": "#aaaaaa",
})
