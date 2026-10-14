"""HERESY 1394: a picture's lettering (Viktor 12.10.2026: «Нужен и кернинг правильный, и интерлиньяж»; on the tries: «A & B - лучшие. B -
реально круто. Впиливай всю эту ересь! 🔥»; on its words in fields of their own: «По надписи всё правильно»).

Its words never come in the prompt: the title and a second line are asked apart, and the studio writes the phrase the painter reads.
A («paint»): Qwen-Image paints them with the picture, the phrase after the prompt. B («letter»): Qwen-Image 2.1 letters a finished
picture, the reference, by words, the order written from the fields alone. The painters misspell a word they have rarely seen («RUOCH
STUDIO», «RUUCH STUDIO» on the 1390 lighthouse), so each picture is read back by the listener (Qwen2.5-Omni, art_job's critic: on the
tries it read both misspellings as they were and the right ones right, 5 s a picture on an RTX 3090, 64 s on the CPU) and one misspelled
is painted again with another seed, up to TRIES times; the first spelled exactly is kept, else the nearest, said misspelled with what it
reads (never shown as if it were right)."""
import difflib, gc, os, re, subprocess

import art_job

WHERE = {"top": "At the top, across the upper part of the picture,", "middle": "In the middle of the picture,",
         "bottom": "At the bottom, across the lower part of the picture,"}
LOOK = "large elegant classical serif capitals in warm gold, with even letter spacing"
TRIES = max(1, int(os.environ.get("ART_LETTER_TRIES") or 3))
READ_ROOM = 11 * 2 ** 30                          # the listener's Q8_0 with its projector: 10.5 GB on the card (art_job, 03.10.2026)
# HERESY 1396: hyphens and gaps kept (Krea 2 painted «ФОС-ФО-РИ-Д-А» from a spelled hint and the listener read it smooth)
ASK = ("Read all the text written in this picture. Write it exactly as it is written, character by character, keeping every hyphen, dot "
       "and gap between the letters, each line of text on its own line, and nothing else. If there is no text, write NONE.")
NO_TEXT = re.compile(r"\s*\bno (?:text|letters|words|writing)\b[^.]*\.?", re.I)


def said(s):
    """A field's words for a phrase: one line, its double quotes made single (the phrase quotes it)."""
    return " ".join(str(s or "").split()).replace('"', "'")


# HERESY 1396 (Viktor 12.10.2026: «Для `Ы` и других проблемных кириллических букв… в системный промпт добавлять что-то наподобие "slavic Ы/ы
# renders like flipped capital Latin P with I following it, negatively kerned for almost edge touching closeness"»): the shapes of the
# letters a painter trained on Latin text rarely saw, said for those the words carry (his «ВОЗВРАЩЕНИЕ ШЕХИНЫ» came out «ШЕХИНЯ» three
# times; the lowercase Щ and Ш as scribbles)
GLYPHS = {
    "Ы": "Ы is the soft sign Ь (a capital Latin P flipped upside down: a stem with its bowl at the bottom) followed by a straight stem I, the two set almost touching",
    "Щ": "Щ is Ш (three equal upright stems joined by one bar along the bottom) with a short tail hanging below its bottom right corner",
    "Ш": "Ш is three equal upright stems joined by one bar along the bottom, like a squared W",
    "Ж": "Ж is a capital X with an upright stem through its middle",
    "Ю": "Ю is an upright stem I joined by a short middle bar to a capital O",
    "Я": "Я is a capital Latin R mirrored left to right",
    "И": "И is a capital Latin N mirrored left to right",
    "Й": "Й is И (a mirrored N) with a small breve arc above it",
    "Ц": "Ц is a square-cornered capital U with a short tail below its bottom right corner",
    "Ч": "Ч is a short stem on the left joined at the middle to a tall stem on the right, like a flat-topped 4",
    "Э": "Э is a capital C mirrored left to right with a short bar into its middle",
    "Ъ": "Ъ is the soft sign Ь with a short flag to the left at its top",
    "Ь": "Ь is a capital Latin P flipped upside down: a stem with its bowl at the bottom",
    "Б": "Б is a stem with a bar to the right at its top and a closed bowl at its bottom right",
    "Г": "Г is a capital Latin L turned upside down: a stem with one bar to the right at its top",
    "Д": "Д is a narrow capital A with a flat top whose base runs out and drops two short feet below the line",
    "Л": "Л is a capital Λ with a small hook on its left foot",
    "П": "П is two upright stems joined by a bar across the top",
    "Ф": "Ф is the Greek capital Φ: an upright stem through the middle of a wide O",
    "Ё": "Ё is a capital E with two dots above it",
    "Є": "Є is a capital C with a short bar into its middle",
    "Ї": "Ї is a capital I with two dots above it",
    "Ґ": "Ґ is Г with a short upturn at the end of its top bar",
    "Ў": "Ў is a capital У (like Y with a curved left arm) with a small breve arc above it",
    "У": "У is like a capital Y whose left arm curves down into its stem",
}


# the ones said: И, Д, Я and the like came right without a word (the Fosforida tries); Ф said beside the Greek Φ it matches (Viktor:
# «И Ф ты зря удалил. Лучше оставить как паритет заглавной греческой Φ»)
HARD = set("ЫЩШЖЮЪЬЭЦЧЙЁЄЇҐЎФ")


def shapes(text):
    """The shapes of the letters the words carry that the painter may not know, each once, in the words' order. No spelling: Krea 2
    painted its hyphens into the title («ФОС-ФО-РИ-Д-А»), 12.10.2026."""
    seen, out = set(), []
    for ch in str(text).upper():
        if ch in GLYPHS and ch in HARD and ch not in seen:
            seen.add(ch)
            out.append(GLYPHS[ch])
    return " The letters: " + "; ".join(out) + "." if out else ""


def phrase(prompt, L):
    """A: the prompt (its «No text» taken out: a take's prompt asks for none) and the lettering: after it when it is a paragraph, as a
    paragraph of its own after the first when it has several (his Fosforida prompt, 3200 characters in ten paragraphs, drowned the lettering
    put at its end: three pictures without a letter; his own TEXT RENDERING stood second)."""
    p = NO_TEXT.sub("", prompt).strip()
    sub = f', and below it, smaller, "{said(L["sub"])}"' if L.get("sub") else ""
    say = (f'{WHERE[L["where"]]} the title "{said(L["title"])}" in {said(L.get("look")) or LOOK}{sub}, '
           f"painted in the same technique and light as the picture. No other text.{shapes(L['title'] + ' ' + (L.get('sub') or ''))}")
    parts = [x for x in re.split(r"\n\s*\n", p) if x.strip()]
    if len(parts) > 1:
        return "\n\n".join([parts[0].strip(), "TEXT RENDERING: " + say] + [x.strip() for x in parts[1:]])
    return p.rstrip(" .,") + ". " + say


def order(L):
    """B: Qwen-Image 2.1's order for a finished picture, from the fields alone."""
    sub = f', and below it, smaller, "{said(L["sub"])}"' if L.get("sub") else ""
    where = WHERE[L["where"]][0].lower() + WHERE[L["where"]][1:].rstrip(",")
    return (f'Add the title "{said(L["title"])}" {where}, in {said(L.get("look")) or LOOK}{sub}, painted in the same technique, '
            f"brushwork and light as the picture, as on an album cover. Keep everything else exactly as it is.{shapes(L['title'] + ' ' + (L.get('sub') or ''))}")


def words(s):
    return re.findall(r"[^\W_]+", str(s or "").casefold())


def exact(L, read):
    return words(L["title"] + " " + (L.get("sub") or "")) == words(read)


def near(L, read):
    return difflib.SequenceMatcher(None, " ".join(words(L["title"] + " " + (L.get("sub") or ""))), " ".join(words(read))).ratio()


def read(image, on_card=True):
    """What the listener reads in the picture, a line per line of text; raises when it cannot be asked (said, never taken for «no text»)."""
    crit = art_job.critic()
    if crit is None:
        raise RuntimeError("the listener (Qwen2.5-Omni GGUF and llama.cpp's llama-mtmd-cli) is not on this machine: the lettering cannot be read back")
    r = subprocess.run([str(art_job.CLI), "-m", str(crit[0]), "--mmproj", str(crit[1]), "--image", str(image), "-p", ASK,
                        "-ngl", "99" if on_card else "0", "-c", "8192", "-n", "80", "--temp", "0"],
                       capture_output=True, text=True, timeout=300 if on_card else 600)
    if r.returncode != 0:
        raise RuntimeError("the listener could not read the picture: " + (r.stderr.strip().splitlines() or ["no output"])[-1][-200:])
    text = "\n".join(l.strip() for l in r.stdout.splitlines() if l.strip())
    return "" if text.upper() == "NONE" else text


def card_for_reading(pipe, streamed):
    """The card's room for the listener: free already; or the painter whole on it (its transformer and VAE) put in RAM while it reads,
    given back by back(); or, streamed with its kept blocks on the card, no room: read on the CPU. Returns (on_card, back)."""
    import torch
    gc.collect()
    torch.cuda.empty_cache()
    if torch.cuda.mem_get_info()[0] >= READ_ROOM:
        return True, lambda: None
    if streamed or pipe is None:
        return False, lambda: None
    moved = [m for m in (getattr(pipe, "transformer", None), getattr(pipe, "vae", None))
             if m is not None and any(p.device.type == "cuda" for p in m.parameters())]
    for m in moved:
        m.to("cpu")
    gc.collect()
    torch.cuda.empty_cache()

    def back():
        for m in moved:
            m.to("cuda")
    return torch.cuda.mem_get_info()[0] >= READ_ROOM, back


def judge(run, L, tried, pipe, streamed):
    """A round read: each picture of this round not read yet, read and judged; returns the numbers still without one spelled exactly."""
    fresh = [row for rows in tried.values() for row in rows if row.get("kept") and "letters" not in row]
    if fresh:
        on_card, back = card_for_reading(pipe, streamed)
        try:
            for row in fresh:
                text = read(run / row["file"], on_card)
                row["letters"] = {"read": text, "exact": exact(L, text), "near": round(near(L, text), 3)}
                if not on_card:
                    row["letters"]["on"] = "cpu"
        except (RuntimeError, OSError, subprocess.TimeoutExpired) as e:
            # not read: the pictures kept as painted and said unread (never taken for spelled), no round more
            for row in fresh:
                row.setdefault("letters", {"unread": str(e)[:300]})
            return set()
        finally:
            back()
    return {n for n, rows in tried.items() if not any((r.get("letters") or {}).get("exact") for r in rows)}


def settle(run, tried):
    """Each picture's row, one per number: the first spelled exactly, else the nearest (said misspelled); the others moved aside into
    misspelled/ (kept, never deleted), their tries counted on the row kept."""
    out = []
    for n in sorted(tried):
        rows = tried[n]
        read_ = [r for r in rows if r.get("kept") and "exact" in (r.get("letters") or {})]
        best = next((r for r in read_ if r["letters"]["exact"]), None) or max(read_, key=lambda r: r["letters"]["near"], default=None) \
            or next((r for r in rows if r.get("kept")), None) or rows[-1]
        for r in read_:
            if r is best:
                continue
            aside = run / "misspelled"
            (aside / "thumbs").mkdir(parents=True, exist_ok=True)
            for f in (r["file"], r["thumb"]):
                if (run / f).exists():
                    os.replace(run / f, aside / f)
        if best.get("letters"):
            best["letters"]["tries"] = len(rows)
        out.append(best)
    return out
