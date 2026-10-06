-- @description Ruach Studio: settings
-- @about Where the studio answers (its address on this machine or the network), the token when the studio asks one
--   (RUACH_API_TOKEN on the studio's machine), and the workspace songs made from REAPER land in.
-- HERESY 1122
local R = dofile(({reaper.get_action_context()})[2]:match("^(.*[/\\])") .. "ruach_common.lua")
local ok, answer = reaper.GetUserInputs("Ruach Studio · settings", 3, "The studio (http://HOST:41867),Token (empty: none),Workspace for songs from REAPER,extrawidth=300,separator=\t",
  R.url() .. "\t" .. R.setting("token", "") .. "\t" .. R.setting("workspace", "From REAPER"))
if not ok then return end
local f = {}
for v in (answer .. "\t"):gmatch("([^\t]*)\t") do f[#f + 1] = v end
reaper.SetExtState(R.EXT, "url", f[1], true)
reaper.SetExtState(R.EXT, "token", f[2], true)
reaper.SetExtState(R.EXT, "workspace", f[3] ~= "" and f[3] or "From REAPER", true)
local code, h = R.call("GET", "/health")
R.say(code == 200 and "The studio answers. Busy: " .. tostring(type(h) == "table" and h.engine and h.engine.busy) or
      "The studio did not answer at " .. R.url() .. " (" .. code .. "): is it running, and is this machine on its network?")
