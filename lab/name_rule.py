"""HERESY 2462 (Viktor 12.11.2026: «В Библиотеку по случаю с / нужно прикрутить сторожа, чтобы не пропускал спец символы в названия пространств и треков как в Библиотеке, так и везде, где присваивается имя или есть возможность переименования. /\\*~ и другие»): one rule for every name the Studio gives or takes: a workspace and each of its sections, a take, an album, a preset, a profile, a mix, a voice, a bank. The page holds the same rule in heresy-dialog.js (HeresyNames), letter for letter; test_names_2462.py runs both on the same names.

A name never holds / \\ * ~ ? : " < > | nor an invisible control character, never begins with a dot, and keeps to its place's length; a name that becomes a file or a folder (file=True) never ends with a dot either. Spaces at its edges are trimmed, as every field of the Studio always did. A name the rule refuses is refused aloud, never changed quietly; cleaned() is what the page offers in its place. A name already there is not judged: the callers check what is made or renamed, never what is read.

A trailing dot is a name's own where no file is made of it: Viktor's presets end so («ФОСФОРИДА. Манифест. Крик.»).
"""
import re

FORBIDDEN = '/\\*~?:"<>|'
CONTROL = re.compile("[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]")
_FORBIDDEN = re.compile("[" + re.escape(FORBIDDEN) + "]")


def refusal(name, max_len=80, file=False):
    """What is wrong with a name (an English sentence the page's catalogs translate), "" when nothing is. Its edges trimmed of spaces first."""
    s = str(name if name is not None else "").strip(" ")
    bad = sorted(set(_FORBIDDEN.findall(s)), key=FORBIDDEN.index)
    if bad:
        return "“" + s + "”: a name cannot hold " + " ".join(bad)
    if CONTROL.search(s):
        return "“" + CONTROL.sub("", s) + "”: a name cannot hold invisible control characters"
    if s.startswith("."):
        return "“" + s + "”: a name cannot begin with a dot"
    if file and s.endswith("."):
        return "“" + s + "”: the name of a file cannot end with a dot"
    if max_len and len(s) > max_len:
        return "“" + s + "”: a name is " + str(max_len) + " characters at most (it has " + str(len(s)) + ")"
    return ""


def check(name, max_len=80, file=False):
    """The name, its edges trimmed of spaces, or ValueError with what is wrong."""
    why = refusal(name, max_len, file)
    if why:
        raise ValueError(why)
    return str(name if name is not None else "").strip(" ")


def cleaned(name, max_len=80, file=False):
    """What the page offers instead of a name refused: / \\ | as -, : as ·, the rest of the forbidden and the controls out, spaces made one."""
    s = CONTROL.sub("", str(name if name is not None else ""))
    s = re.sub(r"\s*[/\\|]\s*", "-", s)
    s = re.sub(r"\s*:\s*", " · ", s)
    s = re.sub(r'[*~?"<>]', "", s)
    s = re.sub(r"\s+", " ", s).strip(" ").lstrip(". ")
    if max_len:
        s = s[:max_len].strip(" ")
    if file:
        s = s.rstrip(". ")
    return s
