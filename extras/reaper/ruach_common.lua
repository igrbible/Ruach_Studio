-- Ruach Studio · what the REAPER scripts share (HERESY 1122). Loaded by the scripts beside it; not an action itself.
-- The studio's API on this machine or the network (docs/API.md); curl does the talking (Linux, macOS, Windows 10+).
local R = {}
R.EXT = "RuachStudio"

function R.setting(key, default)
  local v = reaper.GetExtState(R.EXT, key)
  return v ~= "" and v or default
end

function R.url() return (R.setting("url", "http://127.0.0.1:41867"):gsub("/+$", "")) end

function R.say(text) reaper.ShowMessageBox(text, "Ruach Studio", 0) end

-- a scratch file in REAPER's own folder (os.tmpname is unusable on Windows)
local function scratch()
  return reaper.GetResourcePath() .. "/ruach_" .. tostring(math.random(1, 1e9)) .. ".tmp"
end
math.randomseed(math.floor(reaper.time_precise() * 1000) % 2147483647)

-- JSON out: strings, numbers, booleans, flat lists of strings; enough for the API's requests
local ESC = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
local function jstr(s)
  return '"' .. (tostring(s):gsub('[%c"\\]', function(c) return ESC[c] or string.format("\\u%04x", c:byte()) end)) .. '"'
end
function R.encode(t)
  local parts = {}
  for k, v in pairs(t) do
    local val
    if type(v) == "string" then val = jstr(v)
    elseif type(v) == "table" then
      local items = {}
      for _, x in ipairs(v) do items[#items + 1] = jstr(x) end
      val = "[" .. table.concat(items, ",") .. "]"
    else val = tostring(v) end
    parts[#parts + 1] = jstr(k) .. ":" .. val
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

-- JSON in: the whole grammar, small
function R.decode(s)
  local i = 1
  local function ws() i = s:find("[^ \t\r\n]", i) or #s + 1 end
  local value
  local function str()
    local out, j = {}, i + 1
    while true do
      local k = s:find('["\\]', j)
      if not k then error("unterminated string") end
      out[#out + 1] = s:sub(j, k - 1)
      if s:sub(k, k) == '"' then i = k + 1; return table.concat(out) end
      local n = s:sub(k + 1, k + 1)
      if n == "u" then
        local cp = tonumber(s:sub(k + 2, k + 5), 16); j = k + 6
        if cp >= 0xD800 and cp <= 0xDBFF and s:sub(j, j + 1) == "\\u" then
          cp = 0x10000 + (cp - 0xD800) * 0x400 + (tonumber(s:sub(j + 2, j + 5), 16) - 0xDC00); j = j + 6
        end
        out[#out + 1] = utf8.char(cp)
      else
        out[#out + 1] = ({ b = "\b", f = "\f", n = "\n", r = "\r", t = "\t" })[n] or n; j = k + 2
      end
    end
  end
  function value()
    ws()
    local c = s:sub(i, i)
    if c == "{" then
      i = i + 1; local t = {}; ws()
      if s:sub(i, i) == "}" then i = i + 1; return t end
      while true do
        ws(); local key = str(); ws(); i = i + 1; t[key] = value(); ws()
        local d = s:sub(i, i); i = i + 1
        if d == "}" then return t end
      end
    elseif c == "[" then
      i = i + 1; local t = {}; ws()
      if s:sub(i, i) == "]" then i = i + 1; return t end
      while true do
        t[#t + 1] = value(); ws()
        local d = s:sub(i, i); i = i + 1
        if d == "]" then return t end
      end
    elseif c == '"' then return str()
    elseif s:sub(i, i + 3) == "true" then i = i + 4; return true
    elseif s:sub(i, i + 4) == "false" then i = i + 5; return false
    elseif s:sub(i, i + 3) == "null" then i = i + 4; return nil
    else
      local num = s:match("^-?%d+%.?%d*[eE]?[-+]?%d*", i)
      if not num or num == "" then error("bad JSON at " .. i) end
      i = i + #num; return tonumber(num)
    end
  end
  return value()
end

-- bytes as base64, for a file the API takes inside JSON (HERESY 1145: a MIDI file)
local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
function R.base64(s)
  local out = {}
  for i = 1, #s, 3 do
    local a, b, c = s:byte(i, i + 2)
    local n = (a << 16) | ((b or 0) << 8) | (c or 0)
    local function at(k) return B64:sub(k + 1, k + 1) end
    out[#out + 1] = at(n >> 18) .. at((n >> 12) & 63) .. (b and at((n >> 6) & 63) or "=") .. (c and at(n & 63) or "=")
  end
  return table.concat(out)
end

-- one call to the API: status, decoded body (or the raw text when it is not JSON)
function R.call(method, path, body)
  local out = scratch()
  local cmd = 'curl -s -m 60 -X ' .. method .. ' -o "' .. out .. '" -w "%{http_code}"'
  local token = R.setting("token", "")
  if token ~= "" then cmd = cmd .. ' -H "Authorization: Bearer ' .. token .. '"' end
  local inp
  if body then
    inp = scratch()
    local f = io.open(inp, "wb"); f:write(R.encode(body)); f:close()
    cmd = cmd .. ' -H "Content-Type: application/json" --data-binary @"' .. inp .. '"'
  end
  cmd = cmd .. ' "' .. R.url() .. '/api/v1' .. path .. '"'
  local p = io.popen(cmd)
  local code = tonumber(p:read("*a")) or 0
  p:close()
  local text = ""
  local f = io.open(out, "rb")
  if f then text = f:read("*a"); f:close() end
  os.remove(out)
  if inp then os.remove(inp) end
  local ok, data = pcall(R.decode, text)
  return code, ok and data or text
end

-- a take's audio into the project's folder; the file's path or nil and why
function R.fetch(name, label)
  local dir = reaper.GetProjectPath("") .. "/Ruach"
  reaper.RecursiveCreateDirectory(dir, 0)
  local safe = (label or name):gsub('[\\/:*?"<>|]', "_"):sub(1, 80)
  local file = dir .. "/" .. safe .. " · " .. name:sub(1, 15) .. ".wav"
  local cmd = 'curl -s -L -m 600 -o "' .. file .. '" -w "%{http_code}" "' .. R.url() .. '/api/v1/takes/' .. R.escape(name) .. '/audio"'
  local p = io.popen(cmd)
  local code = tonumber(p:read("*a")) or 0
  p:close()
  if code ~= 200 then os.remove(file); return nil, "the studio answered " .. code end
  return file
end

function R.escape(s)
  return (s:gsub("[^%w%-%._~]", function(c) return string.format("%%%02X", c:byte()) end))
end

-- the take on a track of its own at `pos`; the new item
function R.place(file, pos, label)
  reaper.Undo_BeginBlock()
  local n = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(n, true)
  local track = reaper.GetTrack(0, n)
  reaper.GetSetMediaTrackInfo_String(track, "P_NAME", label, true)
  local item = reaper.AddMediaItemToTrack(track)
  local take = reaper.AddTakeToMediaItem(item)
  local src = reaper.PCM_Source_CreateFromFile(file)
  reaper.SetMediaItemTake_Source(take, src)
  reaper.SetMediaItemInfo_Value(item, "D_POSITION", pos)
  reaper.SetMediaItemInfo_Value(item, "D_LENGTH", (reaper.GetMediaSourceLength(src)))
  reaper.GetSetMediaItemTakeInfo_String(take, "P_NAME", label, true)
  reaper.Main_OnCommand(40047, 0)                 -- Peaks: build any missing peaks
  reaper.UpdateArrange()
  reaper.Undo_EndBlock("Ruach Studio: " .. label, -1)
  return item
end

return R
