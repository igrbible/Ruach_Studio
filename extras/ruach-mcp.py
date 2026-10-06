#!/usr/bin/env python3
"""Ruach Studio as an MCP server (HERESY 1116): an agent (Claude Desktop, Claude Code, any MCP client) makes songs,
lists and marks takes, and hands a take to REAPER, through the studio's own API (/api/v1). It runs where the agent
runs and talks HTTP to the studio, on this machine or on its network.

    pip install mcp                       (once, in any Python 3.10+; v1 and v2 of the SDK both do)
    RUACH_URL=http://127.0.0.1:41867 python3 extras/ruach-mcp.py      (stdio; the client starts it; another machine: its address)

A client's config (Claude Desktop: claude_desktop_config.json; Claude Code: .mcp.json):
    {"mcpServers": {"ruach-studio": {"command": "python3", "args": ["/path/to/extras/ruach-mcp.py"],
                                     "env": {"RUACH_URL": "http://127.0.0.1:41867"}}}}
RUACH_API_TOKEN goes along as a Bearer token when the studio asks one of callers not on its machine."""
import base64, json, os, time, urllib.parse, urllib.request
from pathlib import Path

try:                                                 # the SDK's v2 name, then v1's
    from mcp.server.mcpserver import MCPServer as Server
except ImportError:
    from mcp.server.fastmcp import FastMCP as Server

URL = os.environ.get("RUACH_URL", "http://127.0.0.1:41867").rstrip("/")
TOKEN = os.environ.get("RUACH_API_TOKEN", "")
mcp = Server("ruach-studio")


def call(path, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    if TOKEN:
        headers["Authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(URL + "/api/v1" + path, data=data, headers=headers, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:                  # the studio's own words, not a bare status
        try:
            return {"error": json.loads(e.read().decode()).get("error", str(e)), "status": e.code}
        except ValueError:
            return {"error": str(e), "status": e.code}


@mcp.tool()
def generate_song(style: str, lyrics: str = "", title: str = "", mode: str = "", duration: float = 0,
                  instrumental: bool = False, workspace: str = "", music_seed: int | None = None,
                  sound_seed: int | None = None, midi_file: str = "", midi_key: str = "", wait: bool = True) -> dict:
    """Make a song with YuE2 on the studio's GPU. style: language, genre, voice, instruments, tempo, in plain words.
    lyrics: with section tags on their own lines ([Verse], [Chorus], [Bridge], [Outro]). mode: direct (fastest), full
    (a score first: melody and chords), melody; empty: direct, or melody with a MIDI file. duration in seconds (up to
    480; 0: 180, or the MIDI file's own length). instrumental: no voice. workspace: the Librarian's workspace it lands
    in. midi_file: a standard MIDI file on this machine whose notes become the song's melody (the top track sung, the
    second played, one line a voice); the answer's "score" says how the studio read it (key, tempo, notes kept and
    dropped). midi_key: the key to write it in (Em, Bb…) when the file has none and the studio's guess would not do.
    With wait, returns the finished take (a 3-minute song takes one to two minutes); without, the job to poll with
    job_status."""
    body = {"style": style, "lyrics": lyrics, "title": title, "duration": duration, "instrumental": instrumental}
    if mode:
        body["mode"] = mode
    if midi_file:                                       # HERESY 1145
        try:
            body["midi_b64"] = base64.b64encode(Path(midi_file).expanduser().read_bytes()).decode()
        except OSError as e:
            return {"error": f"the MIDI file could not be read: {e}"}
        if midi_key:
            body["midi_key"] = midi_key
    if workspace:
        body["workspace"] = workspace
    if music_seed is not None:
        body["music_seed"] = music_seed
    if sound_seed is not None:
        body["sound_seed"] = sound_seed
    job = call("/songs", body)
    if not wait or "job" not in job:
        return job
    score = job.get("score")
    t0 = time.time()
    while time.time() - t0 < 1800:
        time.sleep(4)
        st = call(f"/jobs/{urllib.parse.quote(str(job['job']))}")
        if st.get("status") in ("done", "failed", "cancelled"):
            if st.get("takes"):
                st["take"] = call(f"/takes/{st['takes'][0]}")
                st["listen"] = URL + "/api/v1/takes/" + st["takes"][0] + "/audio"
            if score:
                st["score"] = score
            return st
    return {"job": job["job"], "status": "still running after 30 minutes: ask job_status"}


@mcp.tool()
def job_status(job: str) -> dict:
    """The state of a song in the making (queued, running, done, failed, cancelled); when done, its takes."""
    return call(f"/jobs/{urllib.parse.quote(job)}")


@mcp.tool()
def cancel_job(job: str) -> dict:
    """Stop a song in the making."""
    return call(f"/jobs/{urllib.parse.quote(job)}/cancel", {})


@mcp.tool()
def list_takes(workspace: str = "", query: str = "", limit: int = 20, offset: int = 0) -> dict:
    """The takes in the Librarian, newest first; optionally one workspace's, or those whose title or note holds a word."""
    q = {"limit": limit, "offset": offset}
    if workspace:
        q["workspace"] = workspace
    if query:
        q["q"] = query
    return call("/takes?" + urllib.parse.urlencode(q))


@mcp.tool()
def get_take(name: str) -> dict:
    """One take: what it was made with (style, lyrics, score, seeds, adapters), its marks, its workspaces, its audio."""
    out = call(f"/takes/{urllib.parse.quote(name)}")
    if "audio" in out:
        out["listen"] = URL + out["audio"]
    return out


@mcp.tool()
def mark_take(name: str, rating: int | None = None, favorite: bool | None = None, note: str | None = None) -> dict:
    """Mark a take: rating 1 (like), -1 (dislike), 0 (neither); favourite or not; a note (empty removes it)."""
    body = {k: v for k, v in (("rating", rating), ("favorite", favorite), ("note", note)) if v is not None}
    return call(f"/takes/{urllib.parse.quote(name)}/marks", body)


@mcp.tool()
def list_workspaces() -> dict:
    """The Librarian's workspaces and how many takes each holds."""
    return call("/workspaces")


@mcp.tool()
def file_takes(workspace: str, names: list[str], op: str = "add", from_workspace: str = "") -> dict:
    """Put takes into a workspace (op add), take them out (remove), or move them there from another (move)."""
    body = {"op": op, "names": names}
    if op == "move":
        body["from"] = from_workspace
    return call(f"/workspaces/{urllib.parse.quote(workspace)}", body)


@mcp.tool()
def export_reaper(name: str) -> dict:
    """The take as a REAPER project (the mix, its stems, the lyrics and sections when timed), packed as a ZIP; returns
    where to download it."""
    out = call(f"/takes/{urllib.parse.quote(name)}/reaper", {}, timeout=900)
    if out.get("url"):
        out["download"] = URL + out["url"]
    return out


@mcp.tool()
def draw_artwork(name: str, again: bool = False, wait: bool = True) -> dict:
    """Draw a take's artwork (HERESY 1120): a small model writes a picture prompt from the take's style and lyrics, an
    SDXL model paints it (768 px JPEG; about half a minute). again: a new one even when it has one. With wait,
    returns what was drawn (the prompt, the seed) and where to see it."""
    first = call(f"/takes/{urllib.parse.quote(name)}/artwork", {"again": again}, timeout=60)
    t0 = time.time()
    while wait and first.get("status") in ("queued", "running") and time.time() - t0 < 600:
        time.sleep(4)
        first = call(f"/takes/{urllib.parse.quote(name)}/artwork", {}, timeout=60)
    if first.get("artwork") and not first.get("status"):
        first["see"] = URL + first["artwork"]
    return first


@mcp.tool()
def refine_take(name: str, step: str, options: dict | None = None, wait: bool = True) -> dict:
    """A step of the Refiner on a take (HERESY 1144). step: stems ({mode: vocals | four}), debuzz ({strength 0.1–1}),
    remaster ({preset, lufs, hz432, source: "derived/stems-…"}), upscale ({mode: subtle | normal | high | extreme,
    variants 1 | 2}), lyrics-check. With wait, returns when nothing of that step runs on the take any more, with the
    take's tree (every branch and its files, each with a url)."""
    out = call(f"/takes/{urllib.parse.quote(name)}/{step}", options or {}, timeout=120)
    t0 = time.time()
    while wait and time.time() - t0 < 3600:
        tree = call(f"/takes/{urllib.parse.quote(name)}/derived")
        running = [j for j in tree.get("running", []) if str(j.get("key", "")).startswith(step.split("-")[0])]
        if not running and (step != "lyrics-check" or not out.get("status")):
            return {"started": out, "tree": tree}
        if step == "lyrics-check" and out.get("status"):
            time.sleep(4)
            out = call(f"/takes/{urllib.parse.quote(name)}/{step}", {}, timeout=120)
            continue
        time.sleep(5)
    return out


@mcp.tool()
def studio_health() -> dict:
    """Whether the studio answers, whether it is busy, and which GPUs it may use now (the guard's verdict)."""
    return call("/health")


if __name__ == "__main__":
    mcp.run()
