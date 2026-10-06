#!/usr/bin/env python3
"""
HERETICAL TANDEM™ — Audio Post-Processing Pipeline v6.0
Prometheus² + Йирмийаѓу

ЧТО НОВОГО ПРОТИВ v5 (23.09.2026, по слову Виктора:
«делай версию 6, я только ЗА, и если ты не против, сделай этот скрипт
 реально интерактивным прямо в консоли»):

  ① МЕНЮ НА ВЕСЬ КОНВЕЙЕР, а не только на уровни стемов.
     Запуск без доводов открывает меню: источник, стемы, обработка,
     мастеринг, экспорт — всё видно разом, ничего не надо помнить.
     Старые флаги работают как работали: `--cleanup --fade 2` и т.д.

  ② СТЕМЫ UVR И DEMUCS, а не только SUNO.
     Его слово 23.09.2026: «А стемы СУНО — реальное говно. Я их
     пробовал. Лучше моим Вокал Войс Ремувером разделять, там намного
     чище». Теперь узнаются имена UVR ("(Vocals)", "(Instrumental)",
     "_no_vocals") и Demucs (vocals/drums/bass/other).

  ③ ДЕТЕКТОР ДРЕЙФА — ловит расползание стемов по сетке.
     Беда, названная продюсером в разборе 23.09: стемы уходят из
     синхрона к 20–30 такту, и это замечаешь, когда уже склеил.
     Меряем сдвиг в начале, середине и конце — ДО того, как тратить
     вечер на подгонку.

  ④ ЧЕСТНОЕ СРАВНЕНИЕ ГРОМКОСТИ.
     Там же прозвучало, как онлайн-мастеринг дурит слайдером «до/после»:
     твой оригинал играет тише, и разница слышится там, где её нет.
     Шаг `сверка` выравнивает LUFS и только потом сравнивает.

Требуется: ffmpeg. Для дрейфа — numpy (есть в .venv студии).
"""

import os
import sys
import glob
import json
import math
import shutil
import argparse
import subprocess
import time

# ============================================================
# ЦВЕТА — как в его bash-инструментах (utils/*.sh)
# ============================================================
Z = "\033[1;32m"; K = "\033[1;31m"; S = "\033[1;33m"
B = "\033[1m"; D = "\033[2m"; R = "\033[0m"


def _cvet(tekst, cvet):
    """Цвет только если вывод в терминал — в пайп идёт чистый текст."""
    return f"{cvet}{tekst}{R}" if sys.stdout.isatty() else tekst


# ============================================================
# STEM PATTERNS — auto-detection by filename
# ============================================================
# ⭐ v6: к именам SUNO добавлены UVR и Demucs. Порядок важен —
#   частное идёт раньше общего, иначе "vocal" съест "backing vocal".
STEM_PATTERNS = {
    # SUNO splits: "0 Lead Vocals", "1 Backing Vocals", "2 Drums", …
    # UVR:        "…_(Vocals)_MDX.wav", "…_(Instrumental)_MDX.wav"
    # Demucs:     vocals.wav / drums.wav / bass.wav / other.wav
    "lead_vocals":    {"patterns": ["lead vocal", "lead vox", "main vocal",
                                    "(lead vocals)"], "default_db": 0.0},
    "backing_vocals": {"patterns": ["backing vocal", "back vocal", "bgv",
                                    "chorus vocal", "(backing vocals)"], "default_db": -2.0},
    "vocals":         {"patterns": ["(vocals)", "vocal", "vox", "voice", "sing"],
                       "default_db": 0.0},
    "drums":          {"patterns": ["(drums)", "drum"],                  "default_db": -1.0},
    "percussion":     {"patterns": ["percussion", "perc", "shaker", "tamb"], "default_db": -1.5},
    "bass":           {"patterns": ["(bass)", "bass"],                   "default_db": -1.5},
    "guitar":         {"patterns": ["guitar", "gtr"],                    "default_db": -1.0},
    "keyboard":       {"patterns": ["keyboard", "keys", "piano"],        "default_db": -1.5},
    "strings":        {"patterns": ["string", "violin", "cello", "viola"], "default_db": -1.0},
    "woodwinds":      {"patterns": ["woodwind", "flute", "duduk", "sax",
                                    "oboe", "clarinet"],                 "default_db": -1.5},
    "synth":          {"patterns": ["synth", "pad", "electronic"],       "default_db": -2.0},
    "other":          {"patterns": ["(other)", "other", "residual", "misc"], "default_db": -2.0},
    # ⚠ UVR кладёт «всё кроме вокала» под именами instrumental/no_vocals —
    #   это ПОЛНАЯ подложка, её нельзя ронять по уровню как обычный стем
    "instrumental":   {"patterns": ["(instrumental)", "no_vocals", "no vocals",
                                    "instrument", "inst", "music", "accomp"],
                       "default_db": 0.0},
}

VOCAL_TYPES = ("lead_vocals", "backing_vocals", "vocals")

PRESETS = {
    "flat": {
        "description": "Все стемы по 0 dB — без правок",
        "adjustments": {}
    },
    "balanced": {
        "description": "Вокал вперёд, инструменты уравновешены",
        "adjustments": {
            "lead_vocals": 0.0, "backing_vocals": -2.0, "vocals": 0.0,
            "drums": -1.0, "percussion": -1.5, "bass": -1.5,
            "guitar": -1.0, "keyboard": -1.5, "strings": -1.0,
            "woodwinds": -1.5, "synth": -2.0, "other": -2.0,
            "instrumental": 0.0
        }
    },
    "vocal_forward": {
        "description": "Вокал доминирует",
        "adjustments": {
            "lead_vocals": 1.0, "backing_vocals": -3.0, "vocals": 1.0,
            "drums": -2.5, "percussion": -3.0, "bass": -3.0,
            "guitar": -2.5, "keyboard": -3.0, "strings": -2.5,
            "woodwinds": -3.0, "synth": -3.5, "other": -3.5,
            "instrumental": -2.0
        }
    },
    "instrumental_focus": {
        "description": "Музыка вперёд, вокал в ткань",
        "adjustments": {
            "lead_vocals": -2.0, "backing_vocals": -4.0, "vocals": -2.0,
            "drums": 0.0, "percussion": -0.5, "bass": 0.0,
            "guitar": 0.0, "keyboard": -0.5, "strings": 0.0,
            "woodwinds": -0.5, "synth": -1.0, "other": -1.0,
            "instrumental": 1.0
        }
    },
    "shamanic": {
        "description": "Барабаны и голос — как в ФОСФОРИДЕ",
        "adjustments": {
            "lead_vocals": 0.5, "backing_vocals": -1.5, "vocals": 0.5,
            "drums": 0.5, "percussion": 0.0, "bass": -1.0,
            "guitar": -1.5, "keyboard": -2.0, "strings": -1.5,
            "woodwinds": -1.0, "synth": -2.5, "other": -2.5,
            "instrumental": -0.5
        }
    },
}


# ============================================================
# STEM FUNCTIONS
# ============================================================
def find_stems(directory):
    """Найти аудиофайлы и определить их вид по имени."""
    extensions = [".wav", ".mp3", ".flac", ".ogg", ".aac"]
    stems = []
    for ext in extensions:
        for filepath in sorted(glob.glob(os.path.join(directory, f"*{ext}"))):
            filename = os.path.basename(filepath).lower()
            stem_type = "unknown"
            for stype, info in STEM_PATTERNS.items():
                if any(pat in filename for pat in info["patterns"]):
                    stem_type = stype
                    break
            stems.append({
                "path": filepath,
                "filename": os.path.basename(filepath),
                "type": stem_type,
                "db_adjust": STEM_PATTERNS.get(stem_type, {}).get("default_db", 0.0)
            })
    return stems


def display_stems(stems):
    """Показать найденные стемы с их видом и уровнем."""
    print()
    print(_cvet("  ── СТЕМЫ " + "─" * 50, D))
    for i, stem in enumerate(stems):
        znak = _cvet("✓", Z) if stem["type"] != "unknown" else _cvet("?", S)
        imya = stem["filename"]
        if len(imya) > 46:
            imya = imya[:43] + "…"
        print(f"   {znak} {i+1:2d}  {imya:<46} "
              f"{_cvet(stem['type'], D):<26} {stem['db_adjust']:+5.1f} dB")
    neznakomyh = sum(1 for x in stems if x["type"] == "unknown")
    print(_cvet("  " + "─" * 58, D))
    print(f"   всего {len(stems)}"
          + (_cvet(f" · не опознано {neznakomyh} — задай вид вручную", S)
             if neznakomyh else ""))
    print()


def apply_preset(stems, preset_name):
    """Наложить пресет уровней."""
    if preset_name in PRESETS:
        for stem in stems:
            if stem["type"] in PRESETS[preset_name]["adjustments"]:
                stem["db_adjust"] = PRESETS[preset_name]["adjustments"][stem["type"]]
    return stems


def interactive_adjust(stems):
    """Правка уровней и видов стемов."""
    print(_cvet("\n  УРОВНИ СТЕМОВ", B))
    print(_cvet("  <n> <dB> — уровень · вид <n> <тип> — сменить вид", D))
    print(_cvet("  пресет <имя> · всё <dB> — всем разом · готово", D))
    while True:
        display_stems(stems)
        cmd = input(_cvet("  стемы > ", Z)).strip().lower()
        if cmd in ("готово", "done", "d", "г", ""):
            break
        if cmd.startswith(("пресет ", "preset ")):
            pname = cmd.split(" ", 1)[1].strip()
            if pname in PRESETS:
                apply_preset(stems, pname)
                print(_cvet(f"  наложен: {pname}", Z))
            else:
                print(_cvet(f"  нет такого. есть: {', '.join(PRESETS)}", K))
        elif cmd.startswith(("вид ", "type ")):
            parts = cmd.split()
            if len(parts) == 3 and parts[2] in STEM_PATTERNS:
                try:
                    idx = int(parts[1]) - 1
                    if 0 <= idx < len(stems):
                        stems[idx]["type"] = parts[2]
                        stems[idx]["db_adjust"] = STEM_PATTERNS[parts[2]]["default_db"]
                except ValueError:
                    print(_cvet("  так: вид <номер> <тип>", K))
            else:
                print(_cvet(f"  виды: {', '.join(STEM_PATTERNS)}", D))
        elif cmd.startswith(("всё ", "все ", "all ")):
            try:
                db = float(cmd.split()[1])
                for stem in stems:
                    stem["db_adjust"] = db
            except (ValueError, IndexError):
                print(_cvet("  так: всё <dB>", K))
        else:
            parts = cmd.split()
            if len(parts) == 2:
                try:
                    idx, db = int(parts[0]) - 1, float(parts[1])
                    if 0 <= idx < len(stems):
                        stems[idx]["db_adjust"] = db
                except ValueError:
                    print(_cvet("  так: <номер> <dB>", K))
    return stems


# ============================================================
# ⭐ v6 · РАЗДЕЛЕНИЕ НА СТЕМЫ (ядро UVR)
# ============================================================
# ⭐⭐ Его заказ 24.09.2026: «можно ли взять свежайший код UVR и
#    внедрить его в наш скрипт? Идея какова? Сплитить входной wav на
#    стемы, а потом препарировать каждый стем по слоям — уровни и всё
#    остальное». И его же выбор места: «не на Голем, а наоборот, на
#    ноутбук. Моя RTX5000 справится».
#
# ⛔ ПОЧЕМУ ЯДРО, А НЕ ВЕСЬ UVR. Ultimate Vocal Remover — это GUI на
#    tkinter поверх моделей MDX-Net / Demucs / VR. Нам нужен только
#    низ: пакет audio-separator даёт те же модели без окна и ставится
#    в наш venv. Его модели с Голема перенесены как есть.
#
# ⚠ Его модели лежат ПО ПОДПАПКАМ (MDX_Net_Models / Demucs_Models /
#    VR_Models), а ядро ждёт одну плоскую. Потому папку ищем под
#    каждую модель отдельно, а не задаём одну на всех.
MODELI_KOREN = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "UVR_models")


def najti_modeli():
    """Что у нас есть: [(имя файла, папка, род)] — из папок UVR."""
    rody = (("MDX_Net_Models", ".onnx", "MDX"),
            ("Demucs_Models", ".th", "Demucs"),
            ("Demucs_Models/v3_v4_repo", ".th", "Demucs"),
            ("VR_Models", ".pth", "VR"))
    out = []
    for papka, rasshirenie, rod in rody:
        put = os.path.join(MODELI_KOREN, papka)
        if not os.path.isdir(put):
            continue
        for f in sorted(os.listdir(put)):
            if f.lower().endswith(rasshirenie):
                out.append((f, put, rod))
    return out


def razdelit(fajl, model_imya=None, vyhod=None, format_="WAV"):
    """Разделить трек на стемы ядром UVR. Возвращает список файлов.

    ⛔ ОТКАЗ ГОВОРИТСЯ ВСЛУХ И ВОЗВРАЩАЕТ None, А НЕ ПУСТОЙ СПИСОК:
       пустой список тут неотличим от «стемов не вышло» при успешной
       работе, а это разные вещи (CLAUDE.md §2.8б у Виктора).
    """
    try:
        from audio_separator.separator import Separator
    except ImportError as e:
        print(_cvet(f"  ⛔ ядро UVR не поднялось: {e}", K))
        print(_cvet("     поставить:  Ruach_Studio/.venv/bin/pip install 'audio-separator[gpu]'", D))
        return None

    modeli = najti_modeli()
    if not modeli:
        print(_cvet(f"  ⛔ моделей нет в {MODELI_KOREN}", K))
        return None

    if model_imya is None:
        # ⭐ по умолчанию — Kim_Vocal_2: лучшая из его набора на вокал
        vybor = next((m for m in modeli if "kim_vocal_2" in m[0].lower()),
                     modeli[0])
    else:
        vybor = next((m for m in modeli if m[0] == model_imya), None)
        if vybor is None:
            print(_cvet(f"  ⛔ нет модели {model_imya}", K))
            return None
    imya, papka, rod = vybor

    vyhod = vyhod or os.path.join(os.path.dirname(os.path.abspath(fajl)),
                                  "stems")
    os.makedirs(vyhod, exist_ok=True)
    print(_cvet(f"\n  разделяю: {os.path.basename(fajl)}", B))
    print(f"    модель : {imya}  ({rod})")
    print(f"    выход  : {vyhod}")
    bylo = time.time()
    try:
        s = Separator(model_file_dir=papka, output_dir=vyhod,
                      output_format=format_, log_level=40)
        s.load_model(model_filename=imya)
        fajly = s.separate(fajl)
    except Exception as e:                        # noqa: BLE001
        print(_cvet(f"  ⛔ разделение не вышло: {type(e).__name__}: {e}", K))
        return None
    # ⚠ ядро отдаёт имена без пути — приводим к полным, иначе
    #   следующий шаг конвейера их не найдёт
    polnye = [x if os.path.isabs(x) else os.path.join(vyhod, x)
              for x in (fajly or [])]
    print(_cvet(f"  ✓ готово за {time.time() - bylo:.0f} с · "
                f"стемов {len(polnye)}", Z))
    for x in polnye:
        print(f"      {os.path.basename(x)}")
    return polnye


# ============================================================
# ⭐ v6 · ДЕТЕКТОР ДРЕЙФА
# ============================================================
def detect_drift(stems, okon=3, dlina_okna=8.0):
    """Меряет, расходятся ли стемы между собой по времени.

    ⭐ ЗАЧЕМ. Разбор продюсера 23.09.2026: стемы плывут по сетке и к
       20–30 такту уходят из синхрона; чинить приходится подрезкой
       каждые четыре такта. Замечаешь это, когда уже склеил и сел
       доигрывать поверх — то есть поздно.

    КАК. Первый стем берём за опорный. Для каждого другого считаем
    взаимную корреляцию в трёх окнах — начало, середина, конец — и
    смотрим, меняется ли сдвиг от окна к окну. Меняется — значит
    плывёт, и видно, на сколько.

    ⛔ ОТКАЗ ПРИБОРА ГОВОРИТСЯ ВСЛУХ. Нет numpy — шаг не притворяется
       успешным и не печатает «дрейфа нет»: он говорит, что не смог.
       Пустой результат тут неотличим от чистого замера, а значит лжёт.
    """
    try:
        import numpy as np
    except ImportError:
        print(_cvet("  ⛔ нет numpy — дрейф НЕ ПРОВЕРЕН (это не «дрейфа нет»)", K))
        print(_cvet("     поставить:  uv pip install numpy", D))
        return None
    if len(stems) < 2:
        print(_cvet("  один стем — сравнивать не с чем", D))
        return None

    def chitat(put, nachalo, dlit):
        """Кусок моно 22050 Гц через ffmpeg — без лишних зависимостей."""
        cmd = ["ffmpeg", "-v", "error", "-ss", str(nachalo), "-t", str(dlit),
               "-i", put, "-ac", "1", "-ar", "22050", "-f", "f32le", "-"]
        r = subprocess.run(cmd, capture_output=True)
        return np.frombuffer(r.stdout, dtype=np.float32)

    dlit = _duration(stems[0]["path"]) or 0
    if dlit < dlina_okna * 2:
        print(_cvet(f"  трек короче {dlina_okna * 2:.0f} с — дрейф мерить негде", D))
        return None

    # окна: начало, середина, конец (с отступом от самых краёв)
    tochki = [dlit * 0.05, dlit * 0.5 - dlina_okna / 2, dlit * 0.92 - dlina_okna]
    opora = stems[0]
    print(_cvet(f"\n  опора: {opora['filename']}", D))
    print(_cvet(f"  окна по {dlina_okna:.0f} с на {dlit:.0f} с трека\n", D))

    itog = []
    for stem in stems[1:]:
        sdvigi = []
        for t in tochki:
            a = chitat(opora["path"], t, dlina_okna)
            b = chitat(stem["path"], t, dlina_okna)
            n = min(len(a), len(b))
            if n < 1000:
                sdvigi.append(None)
                continue
            a, b = a[:n], b[:n]
            # корреляция через БПФ — на 8 с это мгновенно
            korr = np.fft.irfft(np.fft.rfft(a, 2 * n)
                                * np.conj(np.fft.rfft(b, 2 * n)), 2 * n)
            korr = np.concatenate((korr[-(n - 1):], korr[:n]))
            sdvig_otschetov = int(np.argmax(np.abs(korr))) - (n - 1)
            sdvigi.append(sdvig_otschetov / 22050.0 * 1000.0)   # в мс
        znachimye = [x for x in sdvigi if x is not None]
        razbros = (max(znachimye) - min(znachimye)) if len(znachimye) > 1 else 0.0
        itog.append({"stem": stem["filename"], "sdvigi": sdvigi, "razbros": razbros})

    print(_cvet("  ── ДРЕЙФ " + "─" * 50, D))
    print(f"   {'стем':<34} {'начало':>9} {'середина':>10} {'конец':>9} {'разброс':>9}")
    hudshij = 0.0
    for x in itog:
        imya = x["stem"][:32] + "…" if len(x["stem"]) > 33 else x["stem"]
        kuski = [f"{v:+8.1f}" if v is not None else "     — " for v in x["sdvigi"]]
        r = x["razbros"]
        hudshij = max(hudshij, r)
        cvet_r = Z if r < 5 else (S if r < 20 else K)
        print(f"   {imya:<34} {kuski[0]:>9} {kuski[1]:>10} {kuski[2]:>9} "
              f"{_cvet(f'{r:7.1f} мс', cvet_r)}")
    print(_cvet("  " + "─" * 58, D))

    # ⚠ порог не выдуман: 10 мс это уже слышимый флэм на перкуссии,
    #   а 20+ мс — то самое «расползание», о котором говорил продюсер
    if hudshij < 5:
        print(_cvet("   ✓ стемы держат строй — резать не надо", Z))
    elif hudshij < 20:
        print(_cvet(f"   ⚠ лёгкое расползание ({hudshij:.0f} мс) — на перкуссии"
                    " будет слышно как флэм", S))
    else:
        print(_cvet(f"   ⛔ стемы расходятся на {hudshij:.0f} мс —"
                    " склеивать как есть нельзя", K))
        print(_cvet("     резать по 4 такта и подгонять, либо делить заново"
                    " (UVR даёт чище)", D))
    print()
    return itog


def _duration(filepath):
    """Длительность в секундах или None."""
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=duration", "-of", "csv=p=0", filepath],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


def measure_lufs(filepath):
    """Интегральная громкость в LUFS через ebur128, или None."""
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", filepath,
                        "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                       capture_output=True, text=True)
    for stroka in reversed(r.stderr.split("\n")):
        if "I:" in stroka and "LUFS" in stroka:
            try:
                return float(stroka.split("I:")[1].split("LUFS")[0].strip())
            except (ValueError, IndexError):
                pass
    return None


def compare_honest(file_a, file_b):
    """Сравнить два файла ЧЕСТНО — после выравнивания громкости.

    ⭐ ПОВОД. Разбор продюсера 23.09.2026 про онлайн-мастеринг: их
       слайдер «до/после» играет твой оригинал тише, и «после» звучит
       богаче просто потому, что громче. Он назвал это прямым обманом.

    ⚠ И ТА ЖЕ ЛОВУШКА СТОИТ ПЕРЕД НАМИ: сравнивая свой результат с
       исходником на глаз и на слух без выравнивания, мы обманываем
       себя ровно так же. Потому здесь сперва цифра, потом суждение.
    """
    print(_cvet("\n  ── СВЕРКА " + "─" * 49, D))
    for imya, put in (("A", file_a), ("B", file_b)):
        if not os.path.isfile(put):
            print(_cvet(f"   ⛔ нет файла: {put}", K))
            return None
        lufs = measure_lufs(put)
        dlit = _duration(put)
        print(f"   {imya}  {os.path.basename(put)[:44]:<44} "
              f"{lufs if lufs is None else f'{lufs:6.1f}'} LUFS  {dlit or 0:6.1f} с")
    la, lb = measure_lufs(file_a), measure_lufs(file_b)
    if la is None or lb is None:
        print(_cvet("   ⛔ громкость не померена — сравнение не делаем", K))
        return None
    raznica = lb - la
    print(_cvet("  " + "─" * 58, D))
    if abs(raznica) < 0.5:
        print(_cvet(f"   ✓ громкость сходится ({raznica:+.1f} LUFS) —"
                    " разницу можно слушать честно", Z))
    else:
        gromche = "B" if raznica > 0 else "A"
        print(_cvet(f"   ⚠ {gromche} громче на {abs(raznica):.1f} LUFS", S))
        print(_cvet("     на слух это само по себе кажется «лучше и богаче»."
                    "\n     Выровняй перед сравнением, иначе сравниваешь"
                    " громкость, а не звук.", D))
    print()
    return raznica


# ============================================================
# PROCESSING FUNCTIONS
# ============================================================
def run_ffmpeg(args, desc=""):
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"] + args
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(_cvet(f"  ✗ FFMPEG ({desc}): {result.stderr[:300]}", K))
        return False
    return True


def merge_stems(stems, output_path, sample_rate=48000, trim_start=0, trim_end=0,
                deess=False, deess_mode="subtle", deess_engine="ffmpeg"):
    """Слить стемы с запасом по перегрузу и микрофейдами против щелчков."""
    print("\n  Слияние стемов...")
    n = len(stems)
    # 1/sqrt(n) — безопасный запас: не все стемы пикуют разом
    headroom_db = 20 * math.log10(1.0 / math.sqrt(n))

    inputs = []
    filter_parts = []
    deessed = []
    for i, stem in enumerate(stems):
        inputs.extend(["-i", stem["path"]])
        effective_db = stem["db_adjust"] + headroom_db
        chain = ["afade=t=in:d=0.05:curve=qsin"]
        if deess and stem["type"] in VOCAL_TYPES:
            chain.append("adeclick=window=55:overlap=75")
            if deess_engine == "calf":
                chain.append("lv2=p=http://calf.sourceforge.net/plugins/Deesser")
            else:
                chain.append("deesser=i=0.5:m=0.5:f=0.5:s=o" if deess_mode == "normal"
                             else "deesser=i=0.35:m=0.4:f=0.55:s=o")
            deessed.append(stem["filename"])
        chain.append(f"volume={effective_db:.2f}dB")
        filter_parts.append(f"[{i}:a]" + ",".join(chain) + f"[s{i}]")

    if deessed:
        print(f"  Де-эссер ({deess_mode}): {', '.join(deessed)}")
    print(f"  Запас: {headroom_db:.1f} dB на стем ({n} стемов)")

    mix_inputs = "".join(f"[s{i}]" for i in range(n))
    filter_parts.append(f"{mix_inputs}amix=inputs={n}:duration=longest:"
                        f"dropout_transition=0:normalize=0[mixed]")
    if trim_start > 0 or trim_end > 0:
        tf = f"[mixed]atrim=start={trim_start}"
        if trim_end > 0:
            tf += f":end={trim_end}"
        filter_parts.append(tf + ",asetpts=PTS-STARTPTS[out]")
    else:
        filter_parts.append("[mixed]acopy[out]")

    ok = run_ffmpeg(inputs + ["-filter_complex", ";".join(filter_parts),
                              "-map", "[out]", "-c:a", "pcm_s24le",
                              "-ar", str(sample_rate), output_path], "merge")
    if ok:
        print(_cvet(f"  ✓ Слито: {os.path.basename(output_path)}", Z))
    return ok


def strip_metadata(input_path, output_path):
    print("  Срез метаданных...")
    ok = run_ffmpeg(["-i", input_path, "-map_metadata", "-1", "-fflags",
                     "+bitexact", "-c:a", "pcm_s24le", output_path], "metadata")
    if ok:
        print(_cvet("  ✓ Метаданные срезаны", Z))
    return ok


def apply_cleanup(input_path, output_path, fade_seconds=0, sample_rate=48000):
    """Снятие DC, highpass 20 Гц, lowpass 22 кГц, при нужде — фейды."""
    print("  Чистка...")
    duration = _duration(input_path)
    filters = ["dcshift=0", "highpass=f=20:poles=2"]
    if sample_rate >= 44100:
        filters.append(f"lowpass=f={min(22050, sample_rate // 2 - 50)}:poles=2")
    if fade_seconds > 0:
        filters.append(f"afade=t=in:st=0:d={fade_seconds}:curve=qsin")
        if duration:
            filters.append(f"afade=t=out:st={max(0, duration - fade_seconds)}:"
                           f"d={fade_seconds}:curve=qsin")
    ok = run_ffmpeg(["-i", input_path, "-af", ",".join(filters),
                     "-c:a", "pcm_s24le", "-ar", str(sample_rate), output_path], "cleanup")
    if ok:
        chto = ["DC", "highpass 20 Гц", "lowpass 22 кГц"]
        if fade_seconds > 0:
            chto.append(f"фейды {fade_seconds} с")
        print(_cvet(f"  ✓ {', '.join(chto)}", Z))
    return ok


def convert_432hz(input_path, output_path, sample_rate=48000):
    print("  Перевод в 432 Гц...")
    k = 432.0 / 440.0
    ok = run_ffmpeg(["-i", input_path, "-af",
                     f"asetrate={sample_rate}*{k},aresample={sample_rate},"
                     f"atempo={1/k}", "-c:a", "pcm_s24le", output_path], "432Hz")
    if ok:
        print(_cvet("  ✓ 432 Гц", Z))
    return ok


def apply_loudnorm(input_path, output_path, target_lufs=-14, target_tp=-1, lra=11, sample_rate=48000):
    """⭐ v6.1 (YuE2 OS, 30.09.2026): ДВА ПРОХОДА и частота на выходе.

    ⛔ Прежняя редакция была однопроходной и без -ar. Две беды из этого:
      · loudnorm внутри работает на 192 кГц и так и отдаёт, если частоту не
        назвать — каждый выход после этого шага был 192 кГц, вчетверо тяжелее;
      · один проход — динамический режим, цель он держит приблизительно:
        на КРИКЕ вышло -12.8 при заказанных -14.
    Теперь: замер (print_format=json), затем линейная поправка по замеру
    (linear=true) — точное попадание без «дыхания» громкости.
    """
    print(f"  Громкость к {target_lufs} LUFS (два прохода)...")
    base = f"loudnorm=I={target_lufs}:LRA={lra}:TP={target_tp}"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", input_path, "-af",
                        base + ":print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    m = None
    try:
        tail = r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1]
        m = json.loads(tail)
    except (ValueError, json.JSONDecodeError):
        pass
    if m:
        af = (base + f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
              f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    else:
        print(_cvet("  ⚠ замер не прочитан — один проход", S))
        af = base
    ok = run_ffmpeg(["-i", input_path, "-af", af, "-ar", str(sample_rate),
                     "-c:a", "pcm_s24le", output_path], "loudnorm")
    if ok:
        print(_cvet(f"  ✓ {target_lufs} LUFS, TP={target_tp} dB, {sample_rate} Гц", Z))
    return ok


def export_formats(input_path, output_dir, basename, formats=("wav", "flac", "mp3")):
    print("  Выгрузка...")
    exports = {}
    if "wav" in formats:
        wav_path = os.path.join(output_dir, f"{basename}.wav")
        try:
            if os.path.abspath(input_path) != os.path.abspath(wav_path):
                shutil.copy2(input_path, wav_path)
        except shutil.SameFileError:
            pass
        exports["wav"] = wav_path
        print(_cvet(f"  ✓ WAV: {os.path.basename(wav_path)}", Z))
    if "flac" in formats:
        flac_path = os.path.join(output_dir, f"{basename}.flac")
        if run_ffmpeg(["-i", input_path, "-map_metadata", "-1", "-fflags", "+bitexact",
                       "-c:a", "flac", "-compression_level", "8", flac_path], "FLAC"):
            exports["flac"] = flac_path
            print(_cvet(f"  ✓ FLAC: {os.path.basename(flac_path)}", Z))
    if "mp3" in formats:
        mp3_path = os.path.join(output_dir, f"{basename}.mp3")
        if run_ffmpeg(["-i", input_path, "-map_metadata", "-1", "-fflags", "+bitexact",
                       "-c:a", "libmp3lame", "-b:a", "320k", "-q:a", "0", mp3_path], "MP3"):
            exports["mp3"] = mp3_path
            print(_cvet(f"  ✓ MP3: {os.path.basename(mp3_path)}", Z))
    return exports


def verify_metadata(filepath):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format_tags", filepath], capture_output=True, text=True)
    if r.stdout.strip() and "TAG:" in r.stdout:
        print(_cvet(f"  ⚠ остались метаданные: {os.path.basename(filepath)}", S))
        return False
    print(_cvet(f"  ✓ чисто: {os.path.basename(filepath)}", Z))
    return True


def get_audio_info(filepath):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=duration,size,bit_rate", "-show_entries",
                        "stream=sample_rate,channels,codec_name", "-of", "json",
                        filepath], capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


# ============================================================
# ⭐ v6 · КОНСОЛЬНОЕ МЕНЮ
# ============================================================
# ⛔⛔ 24.09.2026 · ЕГО ЛОВЛЯ: «я в строке набираю ~/D, а затем TAB,
#   и пустота в консоли, но отступ кошерный».
#   Причина простая: input() сам по себе никакого дополнения
#   не знает — его даёт readline, а он не был даже импортирован.
#   TAB вставлял табуляцию — отсюда «отступ кошерный».
def _nastroit_dopolnenie():
    """Дополнение путей по TAB, как в shell."""
    try:
        import readline
    except ImportError:
        return False

    def dopolnit(tekst, sostoyanie):
        tekst = os.path.expanduser(tekst)
        # ⚠ если пользователь набрал ~/D — ищем в раскрытом виде,
        #   а отдаём тоже раскрытый: путь должен быть годен сразу
        varianty = sorted(glob.glob(tekst + "*"))
        varianty = [v + os.sep if os.path.isdir(v) else v for v in varianty]
        return varianty[sostoyanie] if sostoyanie < len(varianty) else None

    readline.set_completer(dopolnit)
    # ⛔⛔ 24.09.2026 · ЕГО ЛОВЛЯ: «по браузеру я заткнулся на глубоком
    #   древе, может пробелы обрубили» — и он угадал в точку.
    #   Я поставил разделителями " \t\n", то есть ВКЛЮЧИЛ ПРОБЕЛ.
    #   На пути «FOSFORIDA. Return of Shekhina/» readline считал каждое
    #   слово отдельным токеном и дополнял от «Return», а не от всего пути.
    # ⭐ У него папки альбомов с пробелами и точками — значит весь ввод
    #   есть ОДИН путь, а не список слов. Разделители — только перевод строки.
    readline.set_completer_delims("\t\n")
    # ⚠ libedit (макошный readline) понимает другую команду
    if "libedit" in getattr(readline, "__doc__", "") or "":
        readline.parse_and_bind("bind ^I rl_complete")
    else:
        readline.parse_and_bind("tab: complete")
    return True


def obzor_fs(nachalo=None, tolko_papki=False):
    """Обзор файловой системы — ходить и выбирать цифрами.

    ⭐ Его заказ 24.09.2026: «Сделай браузер по файловой системе,
       чтобы можно было выбрать директорию для источников».

    ← наверх · цифра — зайти · Enter — взять эту папку · q — отмена
    """
    tek = os.path.abspath(os.path.expanduser(nachalo or os.getcwd()))
    if os.path.isfile(tek):
        tek = os.path.dirname(tek)
    ZVUK = (".wav", ".mp3", ".flac", ".ogg", ".aac", ".m4a")
    while True:
        try:
            vse = sorted(os.listdir(tek))
        except OSError as e:
            print(_cvet(f"  ⛔ не читается: {e}", K))
            tek = os.path.dirname(tek) or "/"
            continue
        papki = [x for x in vse if os.path.isdir(os.path.join(tek, x))
                 and not x.startswith(".")]
        fajly = [] if tolko_papki else [
            x for x in vse if x.lower().endswith(ZVUK)]
        print()
        print(_cvet("  " + tek, B))
        print(_cvet("  " + "─" * 58, D))
        n = 0
        punkty = []
        for x in papki:
            n += 1
            punkty.append(("d", x))
            # ⭐ сразу видно, где лежат стемы: считаем аудио внутри
            try:
                skolko = sum(1 for y in os.listdir(os.path.join(tek, x))
                             if y.lower().endswith(ZVUK))
            except OSError:
                skolko = 0
            metka = _cvet(f"  ♫ {skolko}", Z) if skolko else ""
            print(f"   {n:3d}  {_cvet('▸', D)} {x}/{metka}")
        for x in fajly:
            n += 1
            punkty.append(("f", x))
            print(f"   {n:3d}    {x}")
        print(_cvet("  " + "─" * 58, D))
        print(_cvet("   ← или 0 — наверх · цифра — зайти/взять · "
                    "Enter — взять эту папку · q — отмена", D))
        vybor = input(_cvet("  обзор > ", Z)).strip()
        if vybor.lower() in ("q", "й"):
            return None
        if vybor == "":
            return tek
        if vybor in ("0", "..", "-"):
            tek = os.path.dirname(tek) or "/"
            continue
        if vybor.isdigit() and 1 <= int(vybor) <= len(punkty):
            rod, imya = punkty[int(vybor) - 1]
            put = os.path.join(tek, imya)
            if rod == "f":
                return put
            tek = put
        else:
            print(_cvet("  не понял", S))


def _sprosit(vopros, po_umolchaniyu=None, tip=str):
    """Спросить с показом значения по умолчанию. Пустой ответ — берём его."""
    hvost = f" [{po_umolchaniyu}]" if po_umolchaniyu is not None else ""
    otvet = input(_cvet(f"  {vopros}{hvost}: ", Z)).strip()
    if not otvet:
        return po_umolchaniyu
    if tip is bool:
        return otvet.lower() in ("y", "yes", "д", "да", "1", "+")
    try:
        return tip(otvet)
    except ValueError:
        print(_cvet("  не понял — беру прежнее", S))
        return po_umolchaniyu


def _sostoyanie(nastr):
    """Показать весь заказ разом: что включено, что нет."""
    def gal(x):
        return _cvet("✓", Z) if x else _cvet("·", D)
    print()
    print(_cvet("═" * 62, B))
    print(_cvet("  HERETICAL TANDEM™ · ДЕБАНКЕР v6", B) + _cvet("   Prometheus² + Йирмийаѓу", D))
    print(_cvet("═" * 62, B))
    ist = nastr["input"] or _cvet("НЕ ЗАДАН", K)
    rezhim = ("стемы" if nastr["input"] and os.path.isdir(nastr["input"])
              else "файл" if nastr["input"] else "—")
    vyhod = nastr["output"] or "рядом, в output/"
    print(f"   1  Источник      {ist}")
    print("      " + _cvet(f"режим: {rezhim} · выход: {vyhod}", D))
    if rezhim == "стемы":
        print(f"   2  Стемы         пресет {_cvet(nastr['preset'], B)}"
              f"{' · уровни правлены' if nastr['stems_tuned'] else ''}")
    else:
        print(_cvet("   2  Стемы         — (источник не папка)", D))
    print(f"   3  Обработка     {gal(nastr['cleanup'])} чистка   "
          f"{gal(nastr['fade'] > 0)} фейд {nastr['fade']:g} с   "
          f"{gal(nastr['deess'])} де-эссер ({nastr['deess_mode']})")
    obrezka = f"обрезка: с {nastr['trim_start']:g} с"
    if nastr["trim_end"]:
        obrezka += f" по {nastr['trim_end']:g} с"
    print("      " + _cvet(obrezka, D))
    print(f"   4  Мастеринг     {gal(nastr['hz432'])} 432 Гц   "
          f"{gal(not nastr['skip_loudnorm'])} громкость {nastr['lufs']:g} LUFS / TP {nastr['tp']:g}")
    print(f"   5  Выгрузка      {', '.join(nastr['formats']).upper()}   ·  "
          f"{nastr['sr']} Гц")
    print(_cvet("  " + "─" * 60, D))
    print(f"   d  Дрейф стемов  {_cvet('проверить синхрон ДО склейки', D)}")
    print(f"   s  Сверка        {_cvet('сравнить два файла по выровненной громкости', D)}")
    print(f"   o  Обзор папок   {_cvet('походить по файловой системе и выбрать', D)}")
    print(f"   r  Разделить     {_cvet('трек → стемы ядром UVR (Kim_Vocal_2 и др.)', D)}")
    print(_cvet("  " + "─" * 60, D))
    print(_cvet("   g  ПОЕХАЛИ", Z) + _cvet("      q  выход", D))
    print()


def menu(nastr):
    """Главное меню. Возвращает True — гнать конвейер, False — выход."""
    # ⚠ без этого TAB вставляет табуляцию вместо дополнения —
    #   ровно то, что он поймал: «пустота, но отступ кошерный»
    if not _nastroit_dopolnenie():
        print(_cvet("  ⚠ readline недоступен — TAB дополнять не будет, "
                    "пользуйся обзором", S))
    while True:
        _sostoyanie(nastr)
        vybor = input(_cvet("  > ", Z)).strip().lower()

        if vybor in ("q", "й", "выход", "exit"):
            return False
        if vybor in ("g", "п", "go", "поехали", ""):
            if not nastr["input"]:
                print(_cvet("  ⛔ сперва задай источник (1)", K))
                continue
            return True

        if vybor == "1":
            # ⭐ 24.09.2026 · два пути на выбор: обзор или набор с TAB
            print(_cvet("\n  Enter — обзор по папкам · или впиши путь "
                        "(TAB дополняет)", D))
            put = input(_cvet("  путь > ", Z)).strip().strip("'\"")
            if not put:
                put = obzor_fs(nastr["input"] or os.getcwd())
            if put:
                put = os.path.expanduser(put)
                if os.path.exists(put):
                    nastr["input"] = put
                    nastr["stems"] = None
                    nastr["stems_tuned"] = False
                    print(_cvet(f"  ✓ {put}", Z))
                else:
                    print(_cvet(f"  ⛔ не найдено: {put}", K))
            nastr["output"] = _sprosit("выход (пусто — рядом)", nastr["output"])
            nastr["name"] = _sprosit("имя выходных файлов", nastr["name"])

        elif vybor == "2":
            if not (nastr["input"] and os.path.isdir(nastr["input"])):
                print(_cvet("  источник не папка — стемов нет", S))
                continue
            if nastr["stems"] is None:
                nastr["stems"] = find_stems(nastr["input"])
                apply_preset(nastr["stems"], nastr["preset"])
            if not nastr["stems"]:
                print(_cvet("  ⛔ аудиофайлов в папке нет", K))
                continue
            print(_cvet(f"\n  пресеты: {', '.join(PRESETS)}", D))
            for imya, info in PRESETS.items():
                print(f"    {_cvet(imya, B):<28} {_cvet(info['description'], D)}")
            p = _sprosit("пресет", nastr["preset"])
            if p in PRESETS:
                nastr["preset"] = p
                apply_preset(nastr["stems"], p)
            if _sprosit("править уровни вручную?", "n", bool):
                interactive_adjust(nastr["stems"])
                nastr["stems_tuned"] = True

        elif vybor == "3":
            nastr["cleanup"] = _sprosit("чистка (DC, 20 Гц, 22 кГц)?",
                                        "y" if nastr["cleanup"] else "n", bool)
            nastr["fade"] = _sprosit("фейд вход/выход, секунд (0 — нет)",
                                     nastr["fade"], float)
            nastr["trim_start"] = _sprosit("обрезать с начала, секунд",
                                           nastr["trim_start"], float)
            nastr["trim_end"] = _sprosit("оборвать на секунде (0 — нет)",
                                         nastr["trim_end"], float)
            nastr["deess"] = _sprosit("де-эссер на вокальные стемы?",
                                      "y" if nastr["deess"] else "n", bool)
            if nastr["deess"]:
                m = _sprosit("сила (subtle/normal)", nastr["deess_mode"])
                if m in ("subtle", "normal"):
                    nastr["deess_mode"] = m

        elif vybor == "4":
            nastr["hz432"] = _sprosit("перевести в 432 Гц?",
                                      "y" if nastr["hz432"] else "n", bool)
            gromkost = _sprosit("нормировать громкость?",
                                "n" if nastr["skip_loudnorm"] else "y", bool)
            nastr["skip_loudnorm"] = not gromkost
            if gromkost:
                nastr["lufs"] = _sprosit("целевые LUFS", nastr["lufs"], float)
                nastr["tp"] = _sprosit("True Peak, dB", nastr["tp"], float)
                # ⚠ подсказка по месту, чтобы не лезть в справочники
                if nastr["lufs"] > -9:
                    print(_cvet("  ⚠ громче −9 LUFS площадки всё равно прижмут,"
                                " а динамика уже потеряна", S))

        elif vybor == "5":
            print(_cvet("  форматы через запятую: wav, flac, mp3", D))
            f = _sprosit("форматы", ",".join(nastr["formats"]))
            vybrano = [x.strip() for x in f.split(",")
                       if x.strip() in ("wav", "flac", "mp3")]
            if vybrano:
                nastr["formats"] = vybrano
            nastr["sr"] = _sprosit("частота дискретизации", nastr["sr"], int)

        elif vybor in ("d", "в"):
            if not (nastr["input"] and os.path.isdir(nastr["input"])):
                print(_cvet("  дрейф меряется по папке стемов", S))
                continue
            if nastr["stems"] is None:
                nastr["stems"] = find_stems(nastr["input"])
                apply_preset(nastr["stems"], nastr["preset"])
            detect_drift(nastr["stems"])
            input(_cvet("  Enter — назад ", D))

        elif vybor in ("r", "к"):
            ist = nastr["input"]
            if not ist or os.path.isdir(ist):
                print(_cvet("  разделять можно ТРЕК, а не папку — задай файл (1)", S))
                continue
            modeli = najti_modeli()
            if not modeli:
                print(_cvet(f"  ⛔ моделей нет в {MODELI_KOREN}", K))
                continue
            print(_cvet("\n  модели:", B))
            for i, (imya, _pp, rod) in enumerate(modeli, 1):
                print(f"   {i:3d}  {imya:<40} {_cvet(rod, D)}")
            nom = _sprosit("номер (пусто — Kim_Vocal_2)", "", str)
            imya = None
            if nom.strip().isdigit() and 1 <= int(nom) <= len(modeli):
                imya = modeli[int(nom) - 1][0]
            stemy = razdelit(ist, imya)
            if stemy:
                # ⭐ СРАЗУ ПЕРЕВОДИМ ИСТОЧНИК НА ПАПКУ СО СТЕМАМИ —
                #   в этом весь смысл его замысла: разделил — и тут же
                #   разбираешь каждый стем по слоям, без перезапуска.
                nastr["input"] = os.path.dirname(stemy[0])
                nastr["stems"] = None
                nastr["stems_tuned"] = False
                print(_cvet(f"  → источником стала папка со стемами", Z))
            input(_cvet("  Enter — назад ", D))

        elif vybor in ("o", "щ"):
            put = obzor_fs(nastr["input"] or os.getcwd())
            if put:
                nastr["input"] = put
                nastr["stems"] = None
                nastr["stems_tuned"] = False
                print(_cvet(f"  ✓ источник: {put}", Z))

        elif vybor in ("s", "ы"):
            a = _sprosit("файл A (исходник)", None)
            b = _sprosit("файл B (результат)", None)
            if a and b:
                compare_honest(os.path.expanduser(a.strip().strip("'\"")),
                               os.path.expanduser(b.strip().strip("'\"")))
                input(_cvet("  Enter — назад ", D))
        else:
            print(_cvet("  не понял. цифры 1–5, d, s, g, q", S))


def nastrojki_po_umolchaniyu():
    return {
        "input": None, "output": None, "name": None,
        "preset": "balanced", "stems": None, "stems_tuned": False,
        "cleanup": True, "fade": 0.0, "trim_start": 0.0, "trim_end": 0.0,
        "deess": False, "deess_mode": "subtle", "deess_engine": "ffmpeg",
        "hz432": True, "skip_loudnorm": False, "lufs": -14.0, "tp": -1.0,
        "sr": 48000, "formats": ["wav", "flac", "mp3"],
    }


# ============================================================
# КОНВЕЙЕР
# ============================================================
def gnat(n):
    """Прогнать конвейер по заказу n (словарь настроек)."""
    is_dir = os.path.isdir(n["input"])
    if is_dir:
        output_dir = n["output"] or os.path.join(n["input"], "output")
        auto_name = os.path.basename(os.path.normpath(n["input"]))
        if auto_name.lower() in ("v1", "v2", "v3", "stems"):
            auto_name = os.path.basename(os.path.dirname(os.path.normpath(n["input"])))
        mode = "СТЕМЫ"
    else:
        input_dir = os.path.dirname(os.path.abspath(n["input"]))
        output_dir = n["output"] or os.path.join(input_dir, "output")
        auto_name = os.path.splitext(os.path.basename(n["input"]))[0]
        mode = "ФАЙЛ"
    os.makedirs(output_dir, exist_ok=True)
    basename = n["name"] or auto_name

    print()
    print(_cvet("═" * 62, B))
    print(_cvet(f"  ДЕБАНКЕР v6 · {mode}", B))
    print(_cvet("═" * 62, B))
    print(f"  вход:  {n['input']}")
    print(f"  выход: {output_dir}")
    print(f"  имя:   {basename}")
    print(_cvet("═" * 62, B))

    step = 0
    if is_dir:
        step += 1
        print(_cvet(f"\n[{step}] Стемы", B))
        stems = n["stems"] or find_stems(n["input"])
        if not stems:
            print(_cvet("  ⛔ аудиофайлов нет", K))
            return False
        if not n["stems"]:
            apply_preset(stems, n["preset"])
        display_stems(stems)

        # ⭐ v6: дрейф меряется САМ, до склейки — чтобы не узнать потом
        step += 1
        print(_cvet(f"\n[{step}] Проверка синхрона", B))
        detect_drift(stems)

        step += 1
        print(_cvet(f"\n[{step}] Слияние", B))
        merged = os.path.join(output_dir, f"{basename}_01_merged.wav")
        ok = merge_stems(stems, merged, n["sr"], n["trim_start"], n["trim_end"],
                         n["deess"], n["deess_mode"], n["deess_engine"])
        if not ok and n["deess"] and n["deess_engine"] == "calf":
            print(_cvet("  ⚠ Calf LV2 не поднялся — берём ffmpeg", S))
            ok = merge_stems(stems, merged, n["sr"], n["trim_start"], n["trim_end"],
                             n["deess"], n["deess_mode"], "ffmpeg")
        if not ok:
            return False
        current = merged
    else:
        if n["trim_start"] > 0 or n["trim_end"] > 0:
            step += 1
            print(_cvet(f"\n[{step}] Обрезка", B))
            trimmed = os.path.join(output_dir, f"{basename}_01_trimmed.wav")
            tf = f"atrim=start={n['trim_start']}"
            if n["trim_end"] > 0:
                tf += f":end={n['trim_end']}"
            run_ffmpeg(["-i", n["input"], "-af", tf + ",asetpts=PTS-STARTPTS",
                        "-c:a", "pcm_s24le", "-ar", str(n["sr"]), trimmed], "trim")
            current = trimmed
        else:
            current = n["input"]

    step += 1
    print(_cvet(f"\n[{step}] Метаданные", B))
    clean = os.path.join(output_dir, f"{basename}_02_clean.wav")
    if not strip_metadata(current, clean):
        return False
    current = clean

    if n["cleanup"] or n["fade"] > 0:
        step += 1
        print(_cvet(f"\n[{step}] Чистка", B))
        cleaned = os.path.join(output_dir, f"{basename}_03_cleanup.wav")
        if apply_cleanup(current, cleaned, n["fade"], n["sr"]):
            current = cleaned

    if n["hz432"]:
        step += 1
        print(_cvet(f"\n[{step}] 432 Гц", B))
        hz = os.path.join(output_dir, f"{basename}_04_432hz.wav")
        if not convert_432hz(current, hz, n["sr"]):
            return False
        current = hz

    if not n["skip_loudnorm"]:
        step += 1
        print(_cvet(f"\n[{step}] Громкость", B))
        norm = os.path.join(output_dir, f"{basename}_05_normalized.wav")
        if not apply_loudnorm(current, norm, n["lufs"], n["tp"], sample_rate=n["sr"]):
            return False
        current = norm

    step += 1
    print(_cvet(f"\n[{step}] Итоговый срез метаданных", B))
    final = os.path.join(output_dir, f"{basename}_FINAL.wav")
    if not strip_metadata(current, final):
        return False

    step += 1
    print(_cvet(f"\n[{step}] Выгрузка", B))
    exports = export_formats(final, output_dir, f"{basename}_FINAL", n["formats"])

    print(_cvet("\n  ── ПРИЁМКА " + "─" * 48, D))
    for fmt, path in exports.items():
        verify_metadata(path)
        info = get_audio_info(path)
        if info and "format" in info:
            d = float(info["format"].get("duration", 0))
            s = int(info["format"].get("size", 0)) / (1024 * 1024)
            print(f"      {d:.1f} с ({d/60:.2f} мин) · {s:.1f} МБ")

    # ⭐ v6: честная сверка входа с выходом — сама, без напоминаний
    if not is_dir and "wav" in exports:
        print(_cvet("\n  ── ВХОД ПРОТИВ ВЫХОДА " + "─" * 37, D))
        compare_honest(n["input"], exports["wav"])

    for f in glob.glob(os.path.join(output_dir, f"{basename}_0*.wav")):
        os.remove(f)

    print(_cvet("═" * 62, Z))
    print(_cvet("  ✓ ГОТОВО", Z) + f"   {output_dir}/")
    for fmt, path in exports.items():
        print(f"      {fmt.upper():<5} {os.path.basename(path)}")
    print(_cvet("═" * 62, Z))
    print(_cvet("  HERETICAL TANDEM™ · 🔥🖖\n", D))
    return True


# ============================================================
# MAIN
# ============================================================
def main():
    p = argparse.ArgumentParser(
        description="HERETICAL TANDEM™ — Дебанкер v6",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Без доводов — открывается МЕНЮ (всё видно разом, ничего не надо помнить):
    %(prog)s

Флаги работают как в v5:
    %(prog)s track.wav --cleanup --fade 2
    %(prog)s ./stems/v1/ -p shamanic --interactive
    %(prog)s ./stems/v1/ --drift-only        только проверить синхрон
    %(prog)s --compare A.wav B.wav           честная сверка громкости
        """)
    p.add_argument("input", nargs="?", help="файл или папка со стемами")
    p.add_argument("-o", "--output", default=None, help="папка выхода")
    p.add_argument("-n", "--name", default=None, help="имя выходных файлов")
    p.add_argument("-p", "--preset", default="balanced", choices=list(PRESETS),
                   help="пресет уровней (стемы)")
    p.add_argument("-i", "--interactive", action="store_true", help="править уровни")
    p.add_argument("-m", "--menu", action="store_true", help="открыть меню")
    p.add_argument("--no-432hz", action="store_true")
    p.add_argument("--skip-loudnorm", action="store_true")
    p.add_argument("--lufs", type=float, default=-14.0)
    p.add_argument("--tp", type=float, default=-1.0)
    p.add_argument("--sr", type=int, default=48000)
    p.add_argument("--cleanup", action="store_true")
    p.add_argument("--fade", type=float, default=0)
    p.add_argument("--deess", action="store_true")
    p.add_argument("--deess-mode", default="subtle", choices=["subtle", "normal"])
    p.add_argument("--deess-engine", default="ffmpeg", choices=["ffmpeg", "calf"])
    p.add_argument("--trim-start", type=float, default=0)
    p.add_argument("--trim-end", type=float, default=0)
    p.add_argument("--split", nargs="?", const="", metavar="МОДЕЛЬ",
                   help="разделить трек на стемы ядром UVR и выйти "
                        "(без довода — Kim_Vocal_2)")
    p.add_argument("--models", action="store_true",
                   help="показать доступные модели разделения")
    p.add_argument("--drift-only", action="store_true",
                   help="только проверить синхрон стемов и выйти")
    p.add_argument("--compare", nargs=2, metavar=("A", "B"),
                   help="честно сравнить два файла по выровненной громкости")
    args = p.parse_args()

    if not shutil.which("ffmpeg"):
        print(_cvet("⛔ нет ffmpeg — без него никуда", K))
        sys.exit(1)

    if args.models:
        for imya, papka, rod in najti_modeli():
            print(f"  {imya:<42} {rod:<8} {papka}")
        sys.exit(0)

    if args.compare:
        compare_honest(os.path.expanduser(args.compare[0]),
                       os.path.expanduser(args.compare[1]))
        sys.exit(0)

    n = nastrojki_po_umolchaniyu()

    if args.input:
        n["input"] = os.path.expanduser(args.input)
        if not os.path.exists(n["input"]):
            print(_cvet(f"⛔ не найдено: {n['input']}", K))
            sys.exit(1)

    if args.split is not None:
        if not n["input"] or os.path.isdir(n["input"]):
            print(_cvet("⛔ --split нужен ТРЕК, не папка", K))
            sys.exit(1)
        sys.exit(0 if razdelit(n["input"], args.split or None) else 1)

    if args.drift_only:
        if not (n["input"] and os.path.isdir(n["input"])):
            print(_cvet("⛔ --drift-only нужна папка со стемами", K))
            sys.exit(1)
        detect_drift(find_stems(n["input"]))
        sys.exit(0)

    # ⭐ флаги ложатся поверх умолчаний; меню открывается, когда явно
    #   попросили или когда вход вовсе не назван
    n.update({
        "output": args.output, "name": args.name, "preset": args.preset,
        "cleanup": args.cleanup or n["cleanup"], "fade": args.fade,
        "trim_start": args.trim_start, "trim_end": args.trim_end,
        "deess": args.deess, "deess_mode": args.deess_mode,
        "deess_engine": args.deess_engine, "hz432": not args.no_432hz,
        "skip_loudnorm": args.skip_loudnorm, "lufs": args.lufs,
        "tp": args.tp, "sr": args.sr,
    })

    if args.menu or not args.input:
        if not menu(n):
            print(_cvet("  вышли, ничего не тронули\n", D))
            sys.exit(0)
    elif args.interactive and os.path.isdir(n["input"]):
        n["stems"] = apply_preset(find_stems(n["input"]), n["preset"])
        interactive_adjust(n["stems"])

    sys.exit(0 if gnat(n) else 1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(_cvet("\n\n  прервано\n", S))
        sys.exit(130)
