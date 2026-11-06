"""HERESY 2036 (Viktor 03.11.2026: «полноценный интерфейс для Пианотек, эиртек и органтек»): Modartt's three instruments through one module.
pianoteq_live.py drives the product its NAME and SLUG say; for Organteq and Airteq it is loaded once more as a module of its own (its own server,
its own copy of the preferences, its own catalog in user/<slug>-catalog.json), so Pianoteq's way, proved since 1977, is theirs too. Their trials
answer the same JSON-RPC and the same command line (read 04.11.2026: Organteq 2.1.2, Airteq 1.0.2).
    live(slug) → the module for that product · PRODUCTS · sweep(kit)"""
import importlib.util
from pathlib import Path

import pianoteq_live

HERE = Path(__file__).resolve().parent
PRODUCTS = {"pianoteq": "Pianoteq", "organteq": "Organteq", "airteq": "Airteq"}
_MODS = {"pianoteq": pianoteq_live}


def live(slug):
    """The module that drives this product (Pianoteq's own when none is named)."""
    slug = str(slug or "pianoteq").lower()
    if slug not in PRODUCTS:
        raise ValueError("a Modartt product is one of " + ", ".join(PRODUCTS))
    m = _MODS.get(slug)
    if m is None:
        spec = importlib.util.spec_from_file_location(f"ruach_{slug}_live", HERE / "pianoteq_live.py")
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        m.NAME, m.SLUG = PRODUCTS[slug], slug
        _MODS[slug] = m
    return m


def sweep(kit):
    """At the lab's start: every product's server folders left by a crash go."""
    for slug in PRODUCTS:
        live(slug).sweep(kit)
