#pragma once
// request.h: YuE2 generation request (JSON serialization)
//
// Pure data container + JSON read/write. Zero business logic.
// Only fields the pipeline consumes: the protocol constants (vocabulary
// slices, sampling presets, frame rate) live in the pipeline, not here.

#include "harmony.h"   // HERESY 1606
#include "sampling.h"

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

// Local addition: one voice/genre slider and its strength (0..1)
struct Yue2SliderChoice {
    std::string id;
    float       strength;
    // HERESY 1166: how the strength runs through the song: points (t, k), t from the first frame of the music (0) to
    // the end of its budget (1), k the share of the strength (0..2); empty: flat, the strength all through
    std::vector<std::pair<float, float>> curve;
};

// Local addition: one LoRA file (its path under the server's --loras folder) and
// its strength on the music (AR) and the sound (NAR) half, each 0..2
struct Yue2LoraChoice {
    std::string id;
    float       ar;
    float       nar;
    // HERESY 1447: its wave through the song, as a slider's (points (t, k) or flat), on both halves; and the budget it
    // shares with the adapters that touch its layers (an index into lora_groups, -1: none). Either one takes the adapter
    // off the merge: it runs with the graph (lora-rt.h)
    std::vector<std::pair<float, float>> curve = {};
    int                                  group = -1;
};

// HERESY 1447: a budget the adapters of a group share at every point of the song: their strengths add up to `cap` at
// most, each giving way in proportion (mode 0, share) or served in the order of the request's list (mode 1, order)
struct Yue2LoraGroup {
    float cap     = 2.0f;   // the music half's
    float cap_nar = 2.0f;   // the sound half's (its red line is lower: 1.5 against the music's 2.25, HERESY 1166, 1167)
    int   mode    = 0;
};

// One adapter of a request (upstream 1603 merge): an entry of the --adapters directory and its strength
struct Yue2Adapter {
    std::string name;
    float       scale;  // 1.0
};

struct Yue2Request {
    // text content
    std::string style;   // ""
    std::string lyrics;  // ""

    // symbolic plan. Empty in melody or full mode makes the model write one,
    // and the score it produces comes back in the reply so it can be edited
    // and submitted again.
    std::string abc;  // ""

    // HERESY 1608 (timoncool/yue2.cpp 7810749): with abc, the score is the opening of a plan, not the whole of it: it goes in
    // without its end token and the model writes the rest of the song on from it, in its key and meter (a hummed or played seed)
    bool abc_continue;  // false

    // chain of thought mode: "full", "melody" or "off"
    std::string cot;  // "full"

    // target length in seconds, the budget the semantic stage stops at. The
    // preset of the stage caps it, so the shorter of the two wins.
    float duration;  // 480 (HERESY 1001)

    // generation. Two seeds: the token draw consumes lm_seed as a Philox key,
    // the acoustic noise consumes seed as an mt19937 seed. Splitting them is
    // ours, the release runs both from one. Stored in int64_t to land positive
    // after rd().
    int64_t lm_seed;  // -1 = random
    int64_t seed;     // -1 = random
    int     steps;    // 32, midpoint steps of the flow matching ODE

    // HERESY 1004: the flow matching solver. "midpoint" is the release (two
    // network calls a step, second order). "euler" is one call, first order.
    // "heun" is two calls, second order, velocity at the step's end instead of
    // its middle. "multistep" is one call, second order: Adams-Bashforth 2,
    // reusing the previous step's velocity, the idea behind DPM++ 2M.
    std::string solver;  // "midpoint"

    // batching: number of songs generated from this prompt. Song i draws
    // its tokens with lm_seed + i, consecutive seeds.
    int lm_batch_size;  // 1

    // number of flow matching variations per song, consecutive noise seeds
    // (seed + j) on the same semantic stream. Output order is song-major:
    // song * synth_batch_size + variation.
    int synth_batch_size;  // 1

    // sampling of each autoregressive stage, the checkpoint presets by default
    Yue2Sampling abc_sampling;
    Yue2Sampling semantic_sampling;

    // semantic stream (CSV of codec values, 25 per second). Non empty replaces
    // the autoregressive stage: the prefix and the codes are prefilled in one
    // forward, so re-rendering with other ODE steps or another decoder costs a
    // single pass instead of the whole token loop.
    std::string semantic_tokens;  // ""

    // HERESY 1037: the start of a semantic stream to keep (CSV of codec values) when semantic_tokens
    // is empty: the music stage continues from it instead of from the beginning ("regenerate from
    // here"). It counts in the duration; the song is the kept codes followed by the new ones.
    std::string semantic_keep;  // ""

    // HERESY 1661: the backbone this job is sung on, one of the server's --model names ("" = the Engine's)
    std::string backbone;  // ""

    // HERESY 1169 (Viktor 08.10.2026: a Full song runs on 10-15 s after its proper fade): the take ends at this second (with decode_from its kept latents are decoded only so far; 0: to the end) and fades out over its last fade_out seconds (0: no fade)
    float end_at;    // 0
    float fade_out;  // 0
    // HERESY 1324 (SUNO's Fade in, Viktor's screenshots 09.10.2026): the take's first fade_in seconds brought up from silence (0: no fade)
    float fade_in;   // 0

    // classifier free guidance on the semantic stage. Negative applies the
    // default (HERESY 1031: 1.6 in every mode; the release had 1.01 in off mode
    // and 1.0 otherwise), and a scale of exactly 1.0 keeps a single branch.
    float cfg_scale;  // -1
    float cfg_lyrics;  // HERESY 1397: the lyrics' own guidance in the music stage; -1: as cfg_scale
    bool  score_planned;  // HERESY 1618: the page planned this score itself first (a key, an instrumental): sung as given, called planned
    bool  free_tempo;  // HERESY 1416: the music stage reads the score without its tempo (Q: lines and [Q:…] fields)
    bool  nar_ladder;  // HERESY 1768: the sound half in even pieces of about 20 s, each hearing 2 s past its edges (experimental)
    int   vocal_octave;  // HERESY 1743: a score the model plans whole has its Vocal line moved by this many octaves before it is sung (−3…3; 0: as planned)

    // output normalization percentile control, the peak being the
    // 1 - peak_clip / 1e6 percentile of the absolute signal
    int peak_clip;  // 10

    // audio output format: "mp3", "wav16", "wav24", "wav32"
    std::string output_format;

    // MP3 encoder bitrate in kbps, used when output_format is "mp3".
    // WAV outputs ignore this field.
    int mp3_bitrate;  // 128

    // Local additions (console): the pipeline reads vae, sliders and
    // plan_only; title and parent only travel with the take.
    std::string                   title;      // ""
    std::string                   vae;        // "" = the server's default decoder
    std::vector<Yue2SliderChoice> sliders;    // applied while the music tokens are written
    std::vector<Yue2LoraChoice>   loras;      // merged into the weights for the whole run (1447: or run with the graph)
    std::vector<Yue2LoraGroup>    lora_groups;  // HERESY 1447: the budgets the loras' groups name
    bool                          plan_only;  // false; stop after the score
    bool                          score_guard;  // true; a broken score stops the run before the music (HERESY 1087)
    std::string                   parent;     // "" or the library take this re-renders
    std::string                   decode_from;  // "" or a take whose kept latents another decoder makes again (HERESY 1168)

    // adapters stacked on the backbone, each merged into the halves it
    // changes at its own strength
    std::vector<Yue2Adapter> adapters;  // empty

    // continuation: the semantic stream of a source song, its section
    // [source_start, source_end) in seconds opening the song the model then
    // writes on from. source_end -1 is the end of the source.
    std::string source_tokens;  // "" (no continuation)
    float       source_start;   // 0
    float       source_end;     // -1

    // HERESY 1606 (timoncool/yue2.cpp 1e21e63): chord variety and section order of a planned score, see harmony.h;
    // "harmony": {"identity": "root"|"spelling", "strength", "window", "hold_limit", "outside_bonus", "outside_limit",
    // "section_strength", "section_open", "follow": ["intro", "verse", ...]}
    Yue2Harmony harmony;  // off
    std::string harmony_error;  // HERESY 1606: why the harmony object was refused, the server's 400
};

// fills every field with its default
void request_init(Yue2Request * r);

// parses a JSON string, missing fields keep their default
bool request_parse_json(Yue2Request * r, const char * json);

// parses a JSON file, missing fields keep their default
bool request_parse(Yue2Request * r, const char * path);

// serializes, sparse skips the fields left at their default
std::string request_to_json(const Yue2Request * r, bool sparse = true);

// resolves a negative seed to a random positive one
void request_resolve_seed(Yue2Request * r);

// the request that renders one track of a batch again without the
// autoregression: its score, its semantic stream and the two seeds it
// consumed, the stream of a continued track whole and its source dropped
Yue2Request request_replay(const Yue2Request & base,
                           const std::string & abc,
                           const std::string & tokens,
                           int                 song,
                           int                 variation);
