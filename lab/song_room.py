"""HERESY 2942 (Viktor 22.11.2026: «в Музыкальной модели… предусмотреть максимальные лимиты на выхлоп модели, в блоке семплинга подправить сторожа на макс
токенов»): how much music the model's window really leaves for the song at hand, said before it is sung, so the page never promises «8:00» where the window
holds 6:28.

The engine's own count (build/src/prompt.h, pipeline.h): the prompt is <|endoftext|> + the BPE of «instruction\\n[Tags]\\nstyle\\n[Lyrics]\\nlyrics\\n» + <abc>
+ the score + </abc> + <|music_start|> (Direct: <abc></abc> and no score). Whole (the default), the sound half holds the song in one window of
(context - prefix - 3) / 2 frames; in pieces (or on the ladder) the music half alone bounds it, context - prefix. 25 frames a second.

The text is counted by the backbone's own frozen BPE, read from its GGUF (tokenizer.ggml.tokens and .merges, the same in every YuE2 backbone): NFC, the
Qwen2 pre-tokenizer pattern build/src/bpe.h matches, byte-level, the merges. A score the model will write itself is not known yet: it is put at the
median of the Studio's planned scores, 8.64 tokens a second of plan (134 takes of 15–21.11.2026: 6.86 at the 10th percentile, 12.46 at the 90th), for
a plan as long as the music the window then holds."""
import threading
import unicodedata

import paths

FRAME_RATE = 25
CONTEXT = 24576                  # YUE2_CONTEXT, the checkpoint's; an Engine context set smaller is the caller's
SCORE_RATE = (6.86, 8.64, 12.46)  # a planned score's tokens a second of plan: p10, median, p90
INSTRUCTION = {
    "off": "Generate music with codec tokens from the given conditions.",
    "melody": "Generate a melody-only ABC transcription without chord symbols, then generate music with codec tokens from the given conditions.",
    "full": "Generate a chord-annotated ABC transcription, then generate music with codec tokens from the given conditions.",
}
PATTERN = r"(?i:'s|'t|'re|'ve|'m|'ll|'d)|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+"
_TOK = {"t": None, "from": "", "error": ""}
_LOCK = threading.Lock()


def tokenizer(kit=None):
    """The backbone's frozen BPE, read once from the first backbone GGUF the engine may sing with (each holds the same text vocabulary).
    → a tokenizers.Tokenizer, or None with _TOK["error"] saying why (no backbone yet, no package)."""
    with _LOCK:
        if _TOK["t"] is not None or _TOK["error"]:
            return _TOK["t"]
        try:
            import gguf
            from tokenizers import Regex, Tokenizer, models, normalizers, pre_tokenizers
            found = paths.backbones(kit)
            if not found:
                _TOK["error"] = "no backbone GGUF of the engine's yet"
                return None
            src = min(found, key=lambda p: p.stat().st_size)          # the metadata is the same in each; the smallest maps fastest
            r = gguf.GGUFReader(str(src))

            def strings(key):
                f = r.fields[key]
                return [bytes(f.parts[i]).decode("utf-8") for i in f.data]
            toks, merges = strings("tokenizer.ggml.tokens"), strings("tokenizer.ggml.merges")
            vocab = {t: i for i, t in enumerate(toks)}
            bpe = models.BPE(vocab=vocab, merges=[tuple(m.split(" ", 1)) for m in merges])
            t = Tokenizer(bpe)
            t.normalizer = normalizers.NFC()
            t.pre_tokenizer = pre_tokenizers.Sequence([pre_tokenizers.Split(Regex(PATTERN), behavior="isolated"),
                                                       pre_tokenizers.ByteLevel(add_prefix_space=False, use_regex=False)])
            _TOK["t"], _TOK["from"] = t, src.name
            return t
        except Exception as e:                  # said to the page: the room is then not counted, never guessed
            _TOK["error"] = f"the backbone's tokenizer did not load: {e}"
            return None


def count(t, text):
    return len(t.encode(unicodedata.normalize("NFC", text), add_special_tokens=False).ids) if text else 0


def room(data, kit=None):
    """{style, lyrics, abc, cot, length (s), context?} -> what the window leaves the music of this song.
    text: the style's and the lyrics' tokens with the instruction; score: the given score's tokens (exact), or for a score the model writes the
    estimate at the median rate, low and high at the 10th and 90th percentiles; whole and pieces: the seconds of music each way leaves (the
    estimate's middle, with low and high for a score not given); fits: Max length within the window, whole."""
    t = tokenizer(kit)
    if t is None:
        return {"ok": False, "error": _TOK["error"]}
    cot = str(data.get("cot") or "full")
    cot = cot if cot in INSTRUCTION else "full"
    style, lyrics, abc = str(data.get("style") or ""), str(data.get("lyrics") or ""), str(data.get("abc") or "")
    try:
        ctx = int(data.get("context") or CONTEXT)
    except (TypeError, ValueError):
        ctx = CONTEXT
    ctx = max(1024, min(ctx, CONTEXT))
    try:
        length = float(data.get("length") or 0)
    except (TypeError, ValueError):
        length = 0.0
    text = 1 + count(t, INSTRUCTION[cot] + "\n[Tags]\n" + style + "\n[Lyrics]\n" + lyrics + "\n") + 1   # <|endoftext|> … <abc>
    tail = 2                                                         # </abc> <|music_start|>
    out = {"ok": True, "context": ctx, "text": text, "cot": cot, "from": _TOK["from"]}

    def frames_whole(prefix):
        return max(0, (ctx - prefix - 3) // 2)

    def frames_pieces(prefix):
        return max(0, ctx - prefix)
    if cot == "off" or abc.strip():
        score = count(t, abc) if cot != "off" else 0
        prefix = text + score + tail
        out.update(score=score, score_known=True, prefix=prefix,
                   whole=frames_whole(prefix) / FRAME_RATE, pieces=frames_pieces(prefix) / FRAME_RATE)
    else:
        # a score the model writes: as long as the music it plans, at rate tokens a second; the plan as long as the music (and never past the length
        # asked): s * 25 frames = (ctx - text - tail - 3 - rate * s) / 2 whole, ctx - text - tail - rate * s in pieces
        def solve(rate, whole):
            room_ = ctx - text - tail - (3 if whole else 0)
            s = room_ / (2 * FRAME_RATE + rate) if whole else room_ / (FRAME_RATE + rate)
            if length > 0 and s > length:                            # the plan no longer than the length asked: its score that much shorter
                s_plan = length
                s = (frames_whole(text + tail + int(rate * s_plan)) if whole else frames_pieces(text + tail + int(rate * s_plan))) / FRAME_RATE
            return max(0.0, s)
        lo, mid, hi = SCORE_RATE
        out.update(score=int(mid * min(length or solve(mid, True), solve(mid, True))), score_known=False,
                   whole=solve(mid, True), whole_low=solve(hi, True), whole_high=solve(lo, True),
                   pieces=solve(mid, False), pieces_low=solve(hi, False), pieces_high=solve(lo, False))
        out["prefix"] = text + out["score"] + tail
    out["fits"] = not length or length <= out["whole"] + 0.5
    return out
