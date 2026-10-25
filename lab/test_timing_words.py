"""HERESY 1646: the word-timed LRC: each word at its heard time, the unheard and a choir's (words) between, a guessed line shared evenly."""
import timing


def whisper(words):
    return {"segments": [{"words": [{"w": w, "s": s, "e": e} for w, s, e in words]}], "duration": 30.0}


def test_each_word_at_its_time():
    rows = timing.align(whisper([("Ты", 1.0, 1.3), ("слышишь", 1.4, 2.0), ("меня", 2.1, 2.6), ("свет", 5.0, 5.4), ("мой", 5.5, 5.9)]),
                        "[Verse]\nТы слышишь меня?\nСвет мой (Аллилуйя)\n")
    assert [r["text"] for r in rows] == ["Ты слышишь меня?", "Свет мой (Аллилуйя)"]
    assert rows[0]["tt"] == [[1.0, 1.3], [1.4, 2.0], [2.1, 2.6]]
    lrc = timing.lrc_words(rows, "Song")
    lines = lrc.splitlines()
    assert lines[0] == "[ti:Song]"
    assert lines[1] == "[00:01.00]<00:01.00>Ты <00:01.40>слышишь <00:02.10>меня?"
    assert lines[2].startswith("[00:05.00]<00:05.00>Свет <00:05.50>мой <00:05.")   # the choir's word after the last heard one, before the line's end


def test_unheard_word_between_neighbours():
    rows = timing.align(whisper([("один", 1.0, 1.2), ("три", 3.0, 3.2), ("четыре", 4.0, 4.2)]), "один два три четыре\n")
    w = dict(timing._word_times(rows[0]))
    assert w["один"] == 1.0 and w["три"] == 3.0 and w["четыре"] == 4.0
    assert w["два"] == 2.0                                     # halfway between its heard neighbours


def test_guessed_and_old_timings_share_the_span():
    r = {"text": "a b c d", "start": 10.0, "end": 14.0, "guessed": True}
    assert [t for _, t in timing._word_times(r)] == [10.0, 11.0, 12.0, 13.0]
    r = {"text": "a b", "start": 3.0, "end": 5.0, "guessed": False}  # a timing made before 1646: no tt
    assert [t for _, t in timing._word_times(r)] == [3.0, 4.0]


if __name__ == "__main__":                            # python3 test_timing_words.py, as the lab's other tests
    import sys
    bad = []
    for name, fn in sorted((k, v) for k, v in dict(globals()).items() if k.startswith("test_")):
        try:
            fn()
        except AssertionError as e:
            bad.append(f"{name} {e}")
    print("test_timing_words:", "FAILED " + ", ".join(bad) if bad else "all passed")
    sys.exit(1 if bad else 0)
