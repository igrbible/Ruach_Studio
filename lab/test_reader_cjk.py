"""HERESY CJKNUM: Japanese and Chinese sentences end at 。！？ though no space follows (the testimony lane's finding, 11.11.2026): each
sentence its own, its closing quote with it, the pieces gathered whole and joined without a space, an over-long sentence cut at 、 or ，
before a bare cut; Russian, Greek and English cut as before."""
import re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reader as r

passed = failed = 0


def ok(cond, name, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print("  PASS  " + name)
    else:
        failed += 1
        print("  FAIL  " + name + (f"  ({detail})" if detail else ""))


TAGS = {"tag_re": re.compile(r"<\|[a-z]+:[a-z_]+\|>"), "max_chars": 120}
ja = "母。お母さん、聞こえますか？風が吹いています！彼は「行こう。」と言った。"
s = r.sentences(ja)
ok(s == ["母。", "お母さん、聞こえますか？", "風が吹いています！", "彼は「行こう。」", "と言った。"], "Japanese: a sentence at each 。！？, the closing 」 with its stop", s)
zh = "风在吹。你听见了吗？听见了！「是的。」"
s = r.sentences(zh)
ok(s == ["风在吹。", "你听见了吗？", "听见了！", "「是的。」"], "Chinese: a sentence at each 。？！", s)
ok(r.sentences("Мама. Ты слышишь? Да! Πού είσαι; Εδώ.") == ["Мама.", "Ты слышишь?", "Да!", "Πού είσαι;", "Εδώ."], "Russian and Greek as before (2398's ; too)")
ok(r.sentences("Wait… what?! «Yes.» Done") == ["Wait…", "what?!", "«Yes.»", "Done"], "English as before")
ok(r.sentences("言った。! そして") == ["言った。!", "そして"], "a stop inside the stop before it is not a second sentence")
long_ja = "風が吹いています。" * 40
ps = r.pieces(long_ja, "narration", "sentence", TAGS, False, 0.3, 0.5, 0.9)
ok(len(ps) > 1 and all(len(p["text"]) <= 120 and p["text"].endswith("。") for p in ps), "a long Japanese text: pieces within the cap, each ending at a 。",
   [len(p["text"]) for p in ps])
ok(all(" " not in p["text"] for p in ps), "the sentences of a piece joined without a space", [p["text"][:30] for p in ps if " " in p["text"]])
ok("".join(p["text"] for p in ps) == long_ja, "nothing lost or added")
clause = "あの日の風と光を覚えている、" * 20 + "終わり。"
ps = r.pieces(clause, "narration", "sentence", TAGS, False, 0.3, 0.5, 0.9)
ok(all(len(p["text"]) <= 120 for p in ps) and all(p["text"].endswith("、") for p in ps[:-1]), "one over-long sentence cut at its 、, never inside a word",
   [p["text"][-3:] for p in ps])
ru = r.pieces("Первое предложение. Второе, подлиннее!\n\nНовый абзац? Да.", "narration", "sentence", TAGS, False, 0.3, 0.5, 0.9)
ok([p["text"] for p in ru] == ["Первое предложение. Второе, подлиннее!", "Новый абзац? Да."], "Russian pieces as before (joined with a space)")
print(f"\ntest_reader_cjk  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
