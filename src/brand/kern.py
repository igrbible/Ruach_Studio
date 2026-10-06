"""HERESY 1162 (Viktor, 03.10.2026: «В РУАХ, к примеру, кернинг нулевой между У и А. Учитывай это во всех языках. Для
других сойдёт, но не для Виктора»): a word turned into paths keeps the spacing its font gives each pair of letters. The
font's own kerning (the pair adjustments of its GPOS 'kern' feature), read at the weight the logo uses: a variable font
is set to that weight first, so a pair's value is the one a browser would use there. Needs fontTools."""
from fontTools.varLib.instancer import instantiateVariableFont

_cache = {}


def kerner(font, wght=None, key=None):
    """kern(left glyph, right glyph) -> the adjustment of the space between them, in font units (negative: closer)."""
    ck = (key or id(font), wght)
    if ck in _cache:
        return _cache[ck]
    f = instantiateVariableFont(font, {"wght": wght}, inplace=False) if wght is not None and "fvar" in font else font
    lookups = []
    if "GPOS" in f:
        gpos = f["GPOS"].table
        idx = sorted({i for fr in gpos.FeatureList.FeatureRecord if fr.FeatureTag == "kern" for i in fr.Feature.LookupListIndex})
        for i in idx:
            lk, subs = gpos.LookupList.Lookup[i], []
            for st in lk.SubTable:
                if lk.LookupType == 9:                        # an extension: the pair table inside it
                    if st.ExtensionLookupType != 2:
                        continue
                    st = st.ExtSubTable
                elif lk.LookupType != 2:
                    continue
                cov = {g: n for n, g in enumerate(st.Coverage.glyphs)}
                if st.Format == 1:
                    sets = [{r.SecondGlyph: getattr(r.Value1, "XAdvance", 0) or 0 for r in ps.PairValueRecord} for ps in st.PairSet]
                    subs.append((1, cov, sets))
                elif st.Format == 2:
                    c1, c2 = st.ClassDef1.classDefs if st.ClassDef1 else {}, st.ClassDef2.classDefs if st.ClassDef2 else {}
                    rows = [[getattr(r2.Value1, "XAdvance", 0) or 0 for r2 in r1.Class2Record] for r1 in st.Class1Record]
                    subs.append((2, cov, (c1, c2, rows)))
            lookups.append(subs)

    def kern(a, b):
        total = 0
        for subs in lookups:                                  # each lookup adds; in one, the first subtable that takes the pair
            for fmt, cov, data in subs:
                if a not in cov:
                    continue
                if fmt == 1:
                    v = data[cov[a]].get(b)
                    if v is None:
                        continue
                    total += v
                    break
                c1, c2, rows = data
                total += rows[c1.get(a, 0)][c2.get(b, 0)]
                break
        return total

    _cache[ck] = kern
    return kern
