"""HERESY 2899 (GitHub issue 13, 20.11.2026, a user on 2.0.9: the bar's Unload «greyed out and non functional» while the Writer's model held the
card; Viktor: «Добавь выгрузку любой модели в кнопку в студийном хедере. Но… модели Художника и Видеографа, так как они реально тяжёлые, лучше со
сторожем и небольшим оверлеем в той зоне»): everything the Studio holds in a card's memory, in any room, from one place. The songs' engine (its
loaded modules), the Writer's model (2463), the Narrator's kept worker (Drama 3, Higgs), the Artist's painters kept between runs (1370) and the
Videographer's MiniMax H3 workers (1868): each with its room, its card, its memory and whether it is at work. A busy one is never let go; the
engine, the Writer and the Narrator are light (back at the next ask in seconds), the Artist's and the Videographer's heavy (the page asks first).
    held(kit) → [{id, room, name, device, mb, busy, heavy}]
    release(kit, ids) → {freed: [{id, room, name, mb}], busy: [{id, room, name}], unknown: [ids]}"""
import json
import os
import subprocess
import urllib.request

ENGINE_URL = "http://127.0.0.1:" + os.environ.get("YUE2CPP_PORT", "7777")   # HERESY 2936: the port the engine was given, as everywhere else


def _cuda():
    """{pid: MiB} of the CUDA processes; {} when nvidia-smi does not answer (the cards then counted as unknown, 0)"""
    try:
        p = subprocess.run(["nvidia-smi", "--query-compute-apps=pid,used_memory", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return {}
    out = {}
    for line in (p.stdout or "").splitlines():
        a = [x.strip() for x in line.split(",")]
        if len(a) == 2 and a[0].isdigit() and a[1].isdigit():
            out[int(a[0])] = out.get(int(a[0]), 0) + int(a[1])
    return out


def _session_mb(pid, cuda):
    """the MiB a process and the ones of its session hold on CUDA cards (a worker and the server it started)"""
    try:
        sid = os.getsid(int(pid))
    except (OSError, TypeError, ValueError):
        return 0
    n = 0
    for p, mb in cuda.items():
        try:
            if os.getsid(p) == sid:
                n += mb
        except OSError:
            pass
    return n


def _arc_mb(pid):
    try:
        import writer_llm
        return round(sum(writer_llm._drm_vram([int(pid)]).values()))
    except Exception:  # noqa: BLE001
        return 0


def _engine():
    try:
        with urllib.request.urlopen(ENGINE_URL + "/hardware", timeout=4) as r:
            return json.load(r)
    except (OSError, ValueError):
        return None


def held(kit):
    out, cuda = [], _cuda()
    hw = _engine()
    if hw and (hw.get("loaded_modules") or 0) > 0:
        g = (hw.get("gpus") or [{}])[0]
        dev = "Intel Arc" if str(g.get("name", "")).startswith("SYCL") else str(g.get("description") or g.get("name") or "GPU")
        out.append({"id": "engine", "room": "Musician", "name": "YuE2", "device": dev, "mb": round((hw.get("loaded_bytes") or 0) / 2 ** 20),
                    "busy": bool(hw.get("busy")), "heavy": False})
    try:
        import writer_llm
        st = writer_llm.status(kit)
        if st.get("running") and st.get("where") in ("cuda", "arc"):
            pid = writer_llm.S.get("pid") or (writer_llm.S.get("proc") and writer_llm.S["proc"].pid)
            out.append({"id": "writer", "room": "Writer", "name": str(st.get("variant") or "the Writer's model"),
                        "device": "Intel Arc" if st["where"] == "arc" else f"GPU {st.get('gpu')}", "mb": _arc_mb(pid) if st["where"] == "arc" else _session_mb(pid, cuda),
                        "busy": bool(st.get("busy")), "heavy": False})
    except Exception:  # noqa: BLE001   a room that cannot say is left out, never guessed
        pass
    try:
        import reader
        w = reader.W.get("w")
        if w and w.alive() and w.device in ("cuda", "xpu"):
            out.append({"id": "narrator", "room": "Narrator", "name": str(w.label), "device": "Intel Arc" if w.device == "xpu" else f"GPU {w.card}",
                        "mb": _arc_mb(w.p.pid) if w.device == "xpu" else _session_mb(w.p.pid, cuda), "busy": bool(w.busy), "heavy": False})
    except Exception:  # noqa: BLE001
        pass
    try:
        import artist
        for s in artist.kept():
            if s.alive():
                out.append({"id": f"artist:{s.gpu}", "room": "Artist", "name": str(s.painter or "a painter"), "device": f"GPU {s.gpu}",
                            "mb": _session_mb(s.p.pid, cuda), "busy": bool(s.busy), "heavy": True})
    except Exception:  # noqa: BLE001
        pass
    try:
        import h3_shots
        for x in h3_shots.workers(kit):
            if not x["alive"]:
                continue
            w = h3_shots._alive(h3_shots._root(kit) / f"gpu{x['gpu']}-{x['kind']}") or {}
            out.append({"id": f"video:{x['gpu']}-{x['kind']}", "room": "Videographer", "name": "MiniMax H3 · " + str(x["kind"]), "device": f"GPU {x['gpu']}",
                        "mb": _session_mb(w.get("pid"), cuda) if w.get("pid") else 0, "busy": bool(x["queued"] or x["running"] or x["status"] != "ready"), "heavy": True})
    except Exception:  # noqa: BLE001
        pass
    return out


def release(kit, ids):
    """the ones asked (or all when ids is None) let go, a busy one never: said back by room with the memory each held"""
    now = held(kit)
    want = [h for h in now if ids is None or h["id"] in ids]
    unknown = [] if ids is None else [i for i in ids if i not in {h["id"] for h in now}]
    freed, busy = [], []
    for h in want:
        if h["busy"]:
            busy.append({k: h[k] for k in ("id", "room", "name")})
            continue
        ok, mb = False, h["mb"]
        try:
            if h["id"] == "engine":
                req = urllib.request.Request(ENGINE_URL + "/unload", data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=10) as r:
                    a = json.load(r)
                ok, mb = bool(a.get("applied")), round(a.get("freed_mb") or mb)
            elif h["id"] == "writer":
                import writer_llm
                writer_llm.stop("the bar's Unload")
                ok = True
            elif h["id"] == "narrator":
                import reader
                ok = bool(reader.unload().get("freed"))
            elif h["id"].startswith("artist:"):
                import artist
                ok = bool(artist.release_idle("Unload", gpu=int(h["id"].split(":")[1])))
            elif h["id"].startswith("video:"):
                import h3_shots
                ok = int(h["id"].split(":")[1].split("-")[0]) in h3_shots.release_idle(kit)
        except Exception:  # noqa: BLE001   not let go: said as busy, never as freed
            ok = False
        (freed if ok else busy).append({"id": h["id"], "room": h["room"], "name": h["name"], **({"mb": mb} if ok else {})})
    return {"freed": freed, "busy": busy, "unknown": unknown}
