-- @description Ruach Studio: generate here
-- @about Makes a song in Ruach Studio and puts it on a new track at the time selection's start (or the edit cursor).
--   The style, the length and the mode are asked; the lyrics come from the notes of the selected items (the REAPER
--   project the studio exports keeps every section's words there), or from the dialog, where " / " starts a line.
--   Selected MIDI items give the song its melody: their notes in the time selection become the score (a track a voice,
--   the top one sung). The length is the time selection's when there is one. REAPER stays free while the studio works.
-- HERESY 1122, 1145 · the API: docs/API.md · the studio's address: "Ruach - Settings"
local R = dofile(({reaper.get_action_context()})[2]:match("^(.*[/\\])") .. "ruach_common.lua")

local test = R.setting("test", "")                -- the studio's own check fills the form here (never set by hand)

-- HERESY 1145: the selected MIDI items, as one standard MIDI file the studio reads as the song's score
local PPQ = 960
local function midi_items()
  local out = {}
  for k = 0, reaper.CountSelectedMediaItems(0) - 1 do
    local item = reaper.GetSelectedMediaItem(0, k)
    local take = reaper.GetActiveTake(item)
    if take and reaper.TakeIsMIDI(take) then out[#out + 1] = { item = item, take = take } end
  end
  return out
end
local function vlq(n)
  local b = string.char(n & 127)
  n = n >> 7
  while n > 0 do b = string.char((n & 127) | 128) .. b; n = n >> 7 end
  return b
end
local function chunk(events)                      -- {tick, order, bytes}: offs before ons at the same tick
  table.sort(events, function(a, b) if a[1] ~= b[1] then return a[1] < b[1] end return a[2] < b[2] end)
  local out, last = {}, 0
  for _, e in ipairs(events) do out[#out + 1] = vlq(e[1] - last) .. e[3]; last = e[1] end
  out[#out + 1] = "\0\255\47\0"
  local body = table.concat(out)
  return "MTrk" .. string.pack(">I4", #body) .. body
end
local MAJOR = { "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B" }
local MINOR = { "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm" }
-- the notes between t0 and t1 (an item's own bounds kept, muted notes left out), a track per REAPER track from the top;
-- the project's tempo and meter at t0; the key when a take has REAPER's key snap on a major or minor scale
local function region_midi(items, t0, t1)
  local q0, q1 = reaper.TimeMap2_timeToQN(0, t0), reaper.TimeMap2_timeToQN(0, t1)
  local byTrack, order, notes, key = {}, {}, 0, nil
  for _, it in ipairs(items) do
    local track = reaper.GetMediaItem_Track(it.item)
    local n = reaper.GetMediaTrackInfo_Value(track, "IP_TRACKNUMBER")
    if not byTrack[n] then
      local _, name = reaper.GetTrackName(track)
      byTrack[n] = { name = name, events = { { 0, 0, "\255\3" .. vlq(#name) .. name } }, seq = 0, notes = 0 }
      order[#order + 1] = n
    end
    local tr = byTrack[n]
    local ip = reaper.GetMediaItemInfo_Value(it.item, "D_POSITION")
    local iq0 = math.max(q0, reaper.TimeMap2_timeToQN(0, ip))
    local iq1 = math.min(q1, reaper.TimeMap2_timeToQN(0, ip + reaper.GetMediaItemInfo_Value(it.item, "D_LENGTH")))
    local _, count = reaper.MIDI_CountEvts(it.take)
    for i = 0, count - 1 do
      local _, _, muted, s, e, chan, pitch, vel = reaper.MIDI_GetNote(it.take, i)
      local qs = reaper.MIDI_GetProjQNFromPPQPos(it.take, s)
      if not muted and qs >= iq0 - 1e-6 and qs < iq1 - 1e-6 then
        local qe = math.min(reaper.MIDI_GetProjQNFromPPQPos(it.take, e), iq1)
        local ts = math.max(0, math.floor((qs - q0) * PPQ + 0.5))
        local te = math.max(ts + 1, math.floor((qe - q0) * PPQ + 0.5))
        tr.seq = tr.seq + 1
        tr.events[#tr.events + 1] = { te, tr.seq, string.char(0x80 | chan, pitch, 64) }
        tr.events[#tr.events + 1] = { ts, 1e9 + tr.seq, string.char(0x90 | chan, pitch, math.max(1, vel)) }
        tr.notes, notes = tr.notes + 1, notes + 1
      end
    end
    if not key and reaper.MIDI_GetScale then
      local ok, has, root, scale = pcall(reaper.MIDI_GetScale, it.take, 0, 0, "")
      if ok and has then key = (scale == 0xAB5 and MAJOR[root + 1]) or (scale == 0x5AD and MINOR[root + 1]) or nil end
    end
  end
  if notes == 0 then return nil end
  table.sort(order)
  local chunks, names = {}, {}
  for _, n in ipairs(order) do
    if byTrack[n].notes > 0 then
      chunks[#chunks + 1] = chunk(byTrack[n].events)
      names[#names + 1] = byTrack[n].name .. " (" .. byTrack[n].notes .. ")"
    end
  end
  local num, den, bpm = reaper.TimeMap_GetTimeSigAtTime(0, t0)
  local conductor = chunk({ { 0, 0, "\255\81\3" .. string.pack(">I3", math.floor(60000000 / bpm + 0.5)) },
                            { 0, 1, "\255\88\4" .. string.char(num, math.floor(math.log(den, 2) + 0.5), 24, 8) } })
  local smf = "MThd" .. string.pack(">I4I2I2I2", 6, 1, 1 + #chunks, PPQ) .. conductor .. table.concat(chunks)
  return { smf = smf, notes = notes, names = table.concat(names, ", "), key = key }
end

local t0, t1 = reaper.GetSet_LoopTimeRange(false, false, 0, 0, false)
local items = midi_items()
if t1 <= t0 and #items > 0 then                   -- no time selection: the selected MIDI items' own span
  t0, t1 = math.huge, -math.huge
  for _, it in ipairs(items) do
    local p = reaper.GetMediaItemInfo_Value(it.item, "D_POSITION")
    t0, t1 = math.min(t0, p), math.max(t1, p + reaper.GetMediaItemInfo_Value(it.item, "D_LENGTH"))
  end
end
local pos = (t1 > t0) and t0 or reaper.GetCursorPosition()
local secs = (t1 > t0) and math.floor(t1 - t0 + 0.5) or tonumber(R.setting("last_seconds", "120"))
local midi = (#items > 0 and t1 > t0) and region_midi(items, t0, t1) or nil

-- the lyrics from the selected items' notes, in time order
local function notes_lyrics()
  local parts = {}
  for k = 0, reaper.CountSelectedMediaItems(0) - 1 do
    local item = reaper.GetSelectedMediaItem(0, k)
    local _, text = reaper.GetSetMediaItemInfo_String(item, "P_NOTES", "", false)
    text = text:gsub("^%s+", ""):gsub("%s+$", "")
    if text ~= "" then parts[#parts + 1] = { reaper.GetMediaItemInfo_Value(item, "D_POSITION"), text } end
  end
  table.sort(parts, function(a, b) return a[1] < b[1] end)
  local out = {}
  for _, p in ipairs(parts) do out[#out + 1] = p[2] end
  return table.concat(out, "\n\n")
end

local style, lyrics, mode, instrumental, use_midi
if test ~= "" then
  local t = R.decode(test)
  style, lyrics, secs, mode, instrumental = t.style, t.lyrics or "", tonumber(t.seconds) or secs, t.mode or "direct", t.instrumental == "y"
  use_midi = t.score == "midi" and midi ~= nil
else
  local from_notes = notes_lyrics()
  local fields = { R.setting("last_style", ""), from_notes ~= "" and "(from the selected items' notes)" or "",
                   tostring(secs), midi and "melody" or R.setting("last_mode", "direct"), "n",
                   midi and ("midi: " .. midi.notes .. " notes · " .. midi.names) or "none" }
  local ok, answer = reaper.GetUserInputs("Ruach Studio · generate here", 6,
    "Style (genre, voice, instruments),Lyrics ( / starts a line),Seconds,Mode: direct / full / melody,Instrumental? y / n,"
    .. "Melody: midi / none,extrawidth=460,separator=\t",
    table.concat(fields, "\t"))
  if not ok then return end
  local f = {}
  for v in (answer .. "\t"):gmatch("([^\t]*)\t") do f[#f + 1] = v end
  style, mode, instrumental = f[1], (f[4] ~= "" and f[4] or "direct"), (f[5]:lower():sub(1, 1) == "y")
  lyrics = (f[2]:sub(1, 1) == "(" and from_notes ~= "") and from_notes or f[2]:gsub("%s*/%s*", "\n")
  secs = tonumber(f[3]) or secs
  use_midi = midi ~= nil and (f[6] or ""):lower():sub(1, 4) == "midi"
  reaper.SetExtState(R.EXT, "last_style", style, true)
  if not use_midi then reaper.SetExtState(R.EXT, "last_mode", mode, true) end
  reaper.SetExtState(R.EXT, "last_seconds", tostring(secs), true)
end
if not style or style == "" then return R.say("A style is needed: language, genre, voice, instruments, tempo.") end
if lyrics ~= "" and not lyrics:find("%[") then lyrics = "[Verse]\n" .. lyrics end

local title = "REAPER · " .. style:sub(1, 40)
local body = { style = style, lyrics = lyrics, mode = mode, duration = secs, instrumental = instrumental, title = title,
               workspace = R.setting("workspace", "From REAPER") }
if use_midi then
  body.midi_b64 = R.base64(midi.smf)
  if midi.key then body.midi_key = midi.key end
  if test ~= "" then                              -- the check compares the studio's reading with its own
    local f = io.open(reaper.GetResourcePath() .. "/ruach_region.mid", "wb"); f:write(midi.smf); f:close()
  end
end
local code, job = R.call("POST", "/songs", body)
if code ~= 202 and code ~= 200 or type(job) ~= "table" or not job.job then
  return R.say("The studio did not take it (" .. code .. "): " .. (type(job) == "table" and (job.error or "") or tostring(job)))
end
-- what the studio made of the melody, kept in the new item's notes
local said = ""
if type(job.score) == "table" then
  local s = job.score
  local from, il = type(s.from) == "table" and s.from or {}, tostring(s.ins_line or "")
  said = string.format("Melody from REAPER: %s, %s BPM, key %s (%s); sung: %s",
    s.meter or "?", tostring(s.bpm or "?"), s.key or "?", s.key_from or "?", tostring(from.vocal or "?"))
  if il:find("^kept") then said = said .. "; played: " .. tostring(from.ins)
  elseif il:find("^left out: chords") then
    said = said .. "; " .. tostring(from.ins) .. " is chords, so it is not given as a line (an instrument could take the tune): the instruments play freely"
  end
  local cut = type(s.dropped) == "table" and ((tonumber(s.dropped.Vocal) or 0) + (tonumber(s.dropped.Ins) or 0)) or 0
  if cut > 0 then said = said .. string.format("; one line a voice, so %d notes sounding with others were left out", cut) end
end

local started, last = reaper.time_precise(), 0
local function finish(text)
  if test ~= "" then reaper.SetExtState(R.EXT, "test_result", text, false) else R.say(text) end
end
local function poll()
  local now = reaper.time_precise()
  if now - last < 2 then return reaper.defer(poll) end
  last = now
  local c, st = R.call("GET", "/jobs/" .. R.escape(tostring(job.job)))
  if type(st) == "table" and st.status == "done" and st.takes and st.takes[1] then
    local name = st.takes[1]
    local file, why = R.fetch(name, title)
    if not file then return finish("The song is made (" .. name .. "), but its audio did not come: " .. why) end
    local item = R.place(file, pos, title)
    if said ~= "" then reaper.GetSetMediaItemInfo_String(item, "P_NOTES", said, true) end
    if test ~= "" then finish("ok " .. name .. " " .. file .. (said ~= "" and (" | " .. said) or "")) end
    return
  end
  if c >= 400 or (type(st) == "table" and (st.status == "failed" or st.status == "cancelled")) then
    return finish("The song was not made: " .. (type(st) == "table" and (st.error or st.status or "") or tostring(st)))
  end
  if now - started > 1800 then return finish("Still running after 30 minutes; it will be in the studio's Librarian.") end
  reaper.defer(poll)
end
reaper.defer(poll)
