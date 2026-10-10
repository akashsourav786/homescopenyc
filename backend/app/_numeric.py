"""
Numeric helpers that replicate JavaScript Math semantics exactly.

Python's built-in round() uses banker's rounding (round-half-to-even),
while JS Math.round() rounds half up (toward +Infinity). The TypeScript
engines use Math.round in several places (round2, whole-dollar amounts),
so these helpers exist to guarantee numeric parity.
"""

from __future__ import annotations

import math


def round2(n: float) -> float:
    """Mirror `Math.round(n * 100) / 100` — half up."""
    return math.floor(n * 100 + 0.5) / 100


def round_half_up(n: float) -> int:
    """Mirror `Math.round(n)` for the non-negative values used here."""
    return int(math.floor(n + 0.5))


def money(n: float) -> str:
    """Mirror `` `$${Math.round(n).toLocaleString("en-US")}` ``."""
    return f"${round_half_up(n):,}"


def is_num(v) -> bool:
    """Mirror `typeof v === "number" && Number.isFinite(v)`."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def is_int(v) -> bool:
    """Mirror `Number.isInteger(v)`."""
    if isinstance(v, bool):
        return False
    if isinstance(v, int):
        return True
    return isinstance(v, float) and v.is_integer()
