"""Ruach Studio's own trainer (HERESY 1083): the caption and the AR's prompt.

A caption is AI-Toolkit's YuE2 form: the style, then a "[Lyrics]" line and the lyrics. The AR sees
    [EOD] "INSTRUCTION\n[Tags]\nSTYLE\n[Lyrics]\nLYRICS\n" [ABC_START]   then (Direct mode)  [ABC_END, MUSIC_START]
and the music tokens after it. parse_caption() and the prompt are AI-Toolkit's (MIT, Ostris):
extensions_built_in/audio_models/yue2/yue2_model.py and src/tokenizer.py; the BPE is the one the
Comfy-Org checkpoint carries (text_encoders.yue2_tokenizer_json)."""
import re
import unicodedata
from typing import List

from model import ABC_END, ABC_START, EOD, INSTRUCTIONS, MUSIC_START

_SECTION = re.compile(r"^\s*\[(Tags|Lyrics|Duration)\]\s*$", re.IGNORECASE | re.MULTILINE)
_SONG_SECTION = re.compile(r"^\s*\[[^\]]+\]\s*$")


def _normalize_section(line: str) -> str:
    """[BRIDGE] -> [Bridge], [pre-chorus] -> [Pre-Chorus]: YuE2's section tags are Title case."""
    if not _SONG_SECTION.match(line):
        return line
    lead, body, trail = line[: line.index("[") + 1], line[line.index("[") + 1: line.rindex("]")], line[line.rindex("]"):]
    body = " ".join(w.capitalize() if w.isupper() and len(w) > 1 else w for w in body.split(" "))
    body = body[:1].upper() + body[1:]
    body = re.sub(r"-([a-z])", lambda m: "-" + m.group(1).upper(), body)
    return lead + body + trail


def parse_caption(text: str) -> dict:
    """Caption -> {style, lyrics}: the style text, then [Lyrics] and the lyrics; without a [Lyrics] line
    the first song section ([Intro], [Verse]…) starts them."""
    sections, current = {"tags": []}, "tags"
    for line in str(text or "").splitlines():
        m = _SECTION.match(line)
        if m:
            current = m.group(1).lower()
            sections.setdefault(current, [])
            continue
        if current == "tags" and "lyrics" not in sections and _SONG_SECTION.match(line):
            current = "lyrics"
            sections["lyrics"] = []
        sections.setdefault(current, []).append(_normalize_section(line) if current == "lyrics" else line)
    return {"style": "\n".join(sections["tags"]).strip(), "lyrics": "\n".join(sections.get("lyrics", [])).strip()}


class TextTokenizer:
    def __init__(self, tokenizer_json: bytes):
        from tokenizers import Tokenizer
        self.tokenizer = Tokenizer.from_str(tokenizer_json.decode("utf-8"))

    def encode(self, text: str) -> List[int]:
        return self.tokenizer.encode(unicodedata.normalize("NFC", text)).ids

    def prefix_head_ids(self, style: str, lyrics: str, cot: str = "off") -> List[int]:
        return [EOD] + self.encode(f"{INSTRUCTIONS[cot]}\n[Tags]\n{style}\n[Lyrics]\n{lyrics}\n") + [ABC_START]

    def prefix_ids(self, caption: str, cot: str = "off") -> List[int]:
        """Everything before the first music token, Direct mode (no score)."""
        if cot != "off":
            raise ValueError("this trainer runs Direct mode (cot off) for now")
        c = parse_caption(caption)
        return self.prefix_head_ids(c["style"], c["lyrics"], cot) + [ABC_END, MUSIC_START]


def tokenizer_from_checkpoint(path: str) -> TextTokenizer:
    from safetensors import safe_open
    with safe_open(path, framework="pt") as f:
        blob = f.get_tensor("text_encoders.yue2_tokenizer_json")
    return TextTokenizer(bytes(blob.tolist()))
