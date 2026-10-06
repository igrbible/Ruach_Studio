-- @description Ruach Studio: bring a take
-- @about Finds takes in Ruach Studio's Librarian by words (the title or a note; * and ? work) and puts the one you
--   pick on a new track at the edit cursor. Empty words: the newest takes.
-- HERESY 1122 · the studio's address: "Ruach - Settings"
local R = dofile(({reaper.get_action_context()})[2]:match("^(.*[/\\])") .. "ruach_common.lua")

local test = R.setting("test", "")
local words = ""
if test ~= "" then words = R.decode(test).words or "" else
  local ok, answer = reaper.GetUserInputs("Ruach Studio · bring a take", 2, "Words (title or note),Workspace (empty: all),extrawidth=300,separator=\t",
                                         R.setting("last_words", "") .. "\t" .. R.setting("last_ws", ""))
  if not ok then return end
  local f = {}
  for v in (answer .. "\t"):gmatch("([^\t]*)\t") do f[#f + 1] = v end
  words = f[1]
  reaper.SetExtState(R.EXT, "last_words", f[1], true)
  reaper.SetExtState(R.EXT, "last_ws", f[2], true)
  if f[2] ~= "" then words = words .. "\0" .. f[2] end
end
local q, ws = words:match("^([^%z]*)%z?(.*)$")
local path = "/takes?limit=24&q=" .. R.escape(q) .. (ws ~= "" and "&workspace=" .. R.escape(ws) or "")
local code, data = R.call("GET", path)
if code ~= 200 or type(data) ~= "table" then return R.say("The studio did not answer (" .. code .. ").") end
local takes = data.takes or {}
if #takes == 0 then return R.say("No take holds those words.") end

local function clock(s) s = math.floor((s or 0) + 0.5); return string.format("%d:%02d", s // 60, s % 60) end
local pick
if test ~= "" then pick = 1 else
  local menu = {}
  for k, t in ipairs(takes) do
    menu[#menu + 1] = ((t.title or t.name):gsub("[|!#<>]", " ")) .. "   " .. clock(t.seconds)
  end
  gfx.init("", 0, 0, 0, reaper.GetMousePosition())
  gfx.x, gfx.y = 0, 0
  pick = gfx.showmenu(table.concat(menu, "|"))
  gfx.quit()
  if pick == 0 then return end
end
local take = takes[pick]
local label = take.title or take.name
local file, why = R.fetch(take.name, label)
if not file then return R.say("Its audio did not come: " .. why) end
R.place(file, reaper.GetCursorPosition(), label)
if test ~= "" then reaper.SetExtState(R.EXT, "test_result", "ok " .. take.name .. " " .. file, false) end
