#pragma once
// request.h: YuE2 generation request (JSON serialization)
//
// Pure data container + JSON read/write. Zero business logic.
// Only fields the pipeline consumes: the protocol constants (vocabulary
// slices, sampling presets, frame rate) live in the pipeline, not here.

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
};

struct Yue2Request {
    // text content
    std::string style;   // ""
    std::string lyrics;  // ""

    // symbolic plan. Empty in melody or full mode makes the model write one,
    // and the score it produces comes back in the reply so it can be edited
    // and submitted again.
    std::string abc;  // ""

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

    // HERESY 1169 (Viktor 08.10.2026: a Full song runs on 10-15 s after its proper fade): the take ends at this second (with decode_from its kept latents are decoded only so far; 0: to the end) and fades out over its last fade_out seconds (0: no fade)
    float end_at;    // 0
    float fade_out;  // 0

    // classifier free guidance on the semantic stage. Negative applies the
    // default (HERESY 1031: 1.6 in every mode; the release had 1.01 in off mode
    // and 1.0 otherwise), and a scale of exactly 1.0 keeps a single branch.
    float cfg_scale;  // -1

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
    std::vector<Yue2LoraChoice>   loras;      // merged into the weights for the whole run
    bool                          plan_only;  // false; stop after the score
    bool                          score_guard;  // true; a broken score stops the run before the music (HERESY 1087)
    std::string                   parent;     // "" or the library take this re-renders
    std::string                   decode_from;  // "" or a take whose kept latents another decoder makes again (HERESY 1168)
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
// autoregression: its score, its semantic stream and the two seeds it consumed
Yue2Request request_replay(const Yue2Request & base,
                           const std::string & abc,
                           const std::string & tokens,
                           int                 song,
                           int                 variation);
