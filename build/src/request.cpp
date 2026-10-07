// request.cpp: YuE2 request JSON read/write (yyjson)

#include "request.h"

#include <cmath>  // Local addition: rounding LoRA strengths

#include "task-types.h"
#include "yyjson.h"

#include <algorithm>  // HERESY 1166: a slider's curve in order
#include <cstdio>
#include <cstring>
#include <random>
#include <string>

// FP_TO_FLOAT writes the shortest text that reads back to the same float, so
// a 0.7f comes out as 0.7 instead of 0.699999988079071 and a 1.005f survives
static const yyjson_write_flag WRITE_FLAGS =
    YYJSON_WRITE_PRETTY | YYJSON_WRITE_PRETTY_TWO_SPACES | YYJSON_WRITE_FP_TO_FLOAT;

void request_init(Yue2Request * r) {
    r->style  = "";
    r->lyrics = "";
    r->abc    = "";
    r->cot    = "full";

    r->duration         = 480.0f;  // HERESY 1001: 8:00 = 12000 токенов звука
    r->lm_seed          = -1;
    r->seed             = -1;
    r->steps            = 32;
    r->solver           = "midpoint";
    r->lm_batch_size    = 1;
    r->synth_batch_size = 1;
    r->peak_clip        = 10;
    r->cfg_scale        = -1.0f;
    r->semantic_tokens  = "";
    r->semantic_keep    = "";

    r->abc_sampling      = YUE2_ABC_SAMPLING;
    r->semantic_sampling = YUE2_SEMANTIC_SAMPLING;

    r->output_format = OUTPUT_FORMAT_MP3;
    r->mp3_bitrate   = 128;

    // Local additions (console): take title, decoder, sliders, LoRAs, score-only runs, parent take
    r->title     = "";
    r->vae       = "";
    r->sliders   = {};
    r->loras     = {};
    r->plan_only = false;
    r->parent    = "";
    r->score_guard = true;
    r->decode_from = "";
}

static inline std::string yy_str(yyjson_val * v) {
    return std::string(yyjson_get_str(v), yyjson_get_len(v));
}

static void parse_sampling(yyjson_val * obj, const char * key, Yue2Sampling * s) {
    yyjson_val * node = yyjson_obj_get(obj, key);
    if (!node || !yyjson_is_obj(node)) {
        return;
    }
    yyjson_val * v;
    if ((v = yyjson_obj_get(node, "temperature")) && yyjson_is_num(v)) {
        s->temperature = (float) yyjson_get_num(v);
    }
    if ((v = yyjson_obj_get(node, "top_p")) && yyjson_is_num(v)) {
        s->top_p = (float) yyjson_get_num(v);
    }
    if ((v = yyjson_obj_get(node, "top_k")) && yyjson_is_int(v)) {
        s->top_k = yyjson_get_int(v);
    }
    if ((v = yyjson_obj_get(node, "repetition_penalty")) && yyjson_is_num(v)) {
        s->repetition_penalty = (float) yyjson_get_num(v);
    }
    if ((v = yyjson_obj_get(node, "penalty_window")) && yyjson_is_int(v)) {
        s->penalty_window = yyjson_get_int(v);
    }
    if ((v = yyjson_obj_get(node, "min_tokens")) && yyjson_is_int(v)) {
        s->min_tokens = yyjson_get_int(v);
    }
    if ((v = yyjson_obj_get(node, "max_tokens")) && yyjson_is_int(v)) {
        s->max_tokens = yyjson_get_int(v);
    }
}

static void add_sampling(yyjson_mut_doc *     doc,
                         yyjson_mut_val *     root,
                         const char *         key,
                         const Yue2Sampling & s,
                         const Yue2Sampling & d,
                         bool                 sparse) {
    yyjson_mut_val * node = yyjson_mut_obj(doc);
    bool             any  = false;
    if (!sparse || s.temperature != d.temperature) {
        yyjson_mut_obj_add_real(doc, node, "temperature", s.temperature);
        any = true;
    }
    if (!sparse || s.top_p != d.top_p) {
        yyjson_mut_obj_add_real(doc, node, "top_p", s.top_p);
        any = true;
    }
    if (!sparse || s.top_k != d.top_k) {
        yyjson_mut_obj_add_int(doc, node, "top_k", s.top_k);
        any = true;
    }
    if (!sparse || s.repetition_penalty != d.repetition_penalty) {
        yyjson_mut_obj_add_real(doc, node, "repetition_penalty", s.repetition_penalty);
        any = true;
    }
    if (!sparse || s.penalty_window != d.penalty_window) {
        yyjson_mut_obj_add_int(doc, node, "penalty_window", s.penalty_window);
        any = true;
    }
    if (!sparse || s.min_tokens != d.min_tokens) {
        yyjson_mut_obj_add_int(doc, node, "min_tokens", s.min_tokens);
        any = true;
    }
    if (!sparse || s.max_tokens != d.max_tokens) {
        yyjson_mut_obj_add_int(doc, node, "max_tokens", s.max_tokens);
        any = true;
    }
    if (any) {
        yyjson_mut_obj_add_val(doc, root, key, node);
    }
}

static void request_parse_obj(yyjson_val * obj, Yue2Request * r) {
    yyjson_val * v;

    if ((v = yyjson_obj_get(obj, "style")) && yyjson_is_str(v)) {
        r->style = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "lyrics")) && yyjson_is_str(v)) {
        r->lyrics = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "abc")) && yyjson_is_str(v)) {
        r->abc = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "cot")) && yyjson_is_str(v)) {
        r->cot = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "duration")) && yyjson_is_num(v)) {
        r->duration = (float) yyjson_get_num(v);
    }
    if ((v = yyjson_obj_get(obj, "lm_seed")) && yyjson_is_int(v)) {
        r->lm_seed = yyjson_get_sint(v);
    }
    if ((v = yyjson_obj_get(obj, "seed")) && yyjson_is_int(v)) {
        r->seed = yyjson_get_sint(v);
    }
    if ((v = yyjson_obj_get(obj, "peak_clip")) && yyjson_is_int(v)) {
        r->peak_clip = yyjson_get_int(v);
    }
    if ((v = yyjson_obj_get(obj, "solver")) && yyjson_is_str(v)) {
        r->solver = yyjson_get_str(v);
    }
    if ((v = yyjson_obj_get(obj, "steps")) && yyjson_is_int(v)) {
        r->steps = yyjson_get_int(v);
    }
    if ((v = yyjson_obj_get(obj, "lm_batch_size")) && yyjson_is_int(v)) {
        r->lm_batch_size = yyjson_get_int(v);
    }
    if ((v = yyjson_obj_get(obj, "synth_batch_size")) && yyjson_is_int(v)) {
        r->synth_batch_size = yyjson_get_int(v);
    }
    parse_sampling(obj, "abc_sampling", &r->abc_sampling);
    parse_sampling(obj, "semantic_sampling", &r->semantic_sampling);
    if ((v = yyjson_obj_get(obj, "semantic_tokens")) && yyjson_is_str(v)) {
        r->semantic_tokens = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "semantic_keep")) && yyjson_is_str(v)) {
        r->semantic_keep = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "cfg_scale")) && yyjson_is_num(v)) {
        r->cfg_scale = (float) yyjson_get_num(v);
    }
    if ((v = yyjson_obj_get(obj, "output_format")) && yyjson_is_str(v)) {
        r->output_format = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "mp3_bitrate")) && yyjson_is_int(v)) {
        r->mp3_bitrate = yyjson_get_int(v);
    }
    // Local additions (console): the fields request_init() adds, read from the request
    if ((v = yyjson_obj_get(obj, "title")) && yyjson_is_str(v)) {
        r->title = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "vae")) && yyjson_is_str(v)) {
        r->vae = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "parent")) && yyjson_is_str(v)) {
        r->parent = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "decode_from")) && yyjson_is_str(v)) {   // HERESY 1168
        r->decode_from = yy_str(v);
    }
    if ((v = yyjson_obj_get(obj, "plan_only")) && yyjson_is_bool(v)) {
        r->plan_only = yyjson_get_bool(v);
    }
    if ((v = yyjson_obj_get(obj, "score_guard")) && yyjson_is_bool(v)) {
        r->score_guard = yyjson_get_bool(v);
    }
    if ((v = yyjson_obj_get(obj, "sliders")) && yyjson_is_arr(v)) {
        size_t       idx, max;
        yyjson_val * item;
        yyjson_arr_foreach(v, idx, max, item) {
            yyjson_val * id       = yyjson_obj_get(item, "id");
            yyjson_val * strength = yyjson_obj_get(item, "strength");
            if (id && yyjson_is_str(id)) {
                Yue2SliderChoice c;
                c.id       = yy_str(id);
                c.strength = strength && yyjson_is_num(strength) ? (float) yyjson_get_num(strength) : 1.0f;
                // HERESY 1166: its curve, points [t, k] (t 0..1, k 0..2, 64 at most) or a name: flat, arch, rise, fall
                yyjson_val * curve = yyjson_obj_get(item, "curve");
                if (curve && yyjson_is_str(curve)) {
                    std::string name = yy_str(curve);
                    if (name == "arch") {
                        c.curve = { { 0.0f, 0.15f }, { 0.5f, 1.0f }, { 1.0f, 0.15f } };
                    } else if (name == "rise") {
                        c.curve = { { 0.0f, 0.1f }, { 1.0f, 1.0f } };
                    } else if (name == "fall") {
                        c.curve = { { 0.0f, 1.0f }, { 1.0f, 0.1f } };
                    }
                } else if (curve && yyjson_is_arr(curve)) {
                    size_t       ci, cmax;
                    yyjson_val * pt;
                    yyjson_arr_foreach(curve, ci, cmax, pt) {
                        yyjson_val * a = yyjson_is_arr(pt) ? yyjson_arr_get(pt, 0) : nullptr;
                        yyjson_val * b = yyjson_is_arr(pt) ? yyjson_arr_get(pt, 1) : nullptr;
                        if (a && b && yyjson_is_num(a) && yyjson_is_num(b) && c.curve.size() < 64) {
                            float t = std::min(1.0f, std::max(0.0f, (float) yyjson_get_num(a)));
                            float k = std::min(2.0f, std::max(0.0f, (float) yyjson_get_num(b)));
                            c.curve.push_back({ t, k });
                        }
                    }
                    std::stable_sort(c.curve.begin(), c.curve.end(),
                                     [](const std::pair<float, float> & x, const std::pair<float, float> & y) { return x.first < y.first; });
                }
                r->sliders.push_back(c);
            }
        }
    }
    if ((v = yyjson_obj_get(obj, "loras")) && yyjson_is_arr(v)) {
        size_t       idx, max;
        yyjson_val * item;
        yyjson_arr_foreach(v, idx, max, item) {
            yyjson_val * id  = yyjson_obj_get(item, "id");
            yyjson_val * ar  = yyjson_obj_get(item, "ar");
            yyjson_val * nar = yyjson_obj_get(item, "nar");
            if (id && yyjson_is_str(id)) {
                r->loras.push_back({ yy_str(id), ar && yyjson_is_num(ar) ? (float) yyjson_get_num(ar) : 1.0f,
                                     nar && yyjson_is_num(nar) ? (float) yyjson_get_num(nar) : 1.0f });
            }
        }
    }
}

bool request_parse_json(Yue2Request * r, const char * json) {
    request_init(r);
    yyjson_doc * doc = yyjson_read(json, strlen(json), 0);
    if (!doc) {
        fprintf(stderr, "[Request] ERROR: malformed JSON\n");
        return false;
    }
    yyjson_val * root = yyjson_doc_get_root(doc);
    if (!yyjson_is_obj(root)) {
        fprintf(stderr, "[Request] ERROR: root is not an object\n");
        yyjson_doc_free(doc);
        return false;
    }
    request_parse_obj(root, r);
    yyjson_doc_free(doc);
    return true;
}

bool request_parse(Yue2Request * r, const char * path) {
    request_init(r);
    yyjson_doc * doc = yyjson_read_file(path, 0, NULL, NULL);
    if (!doc) {
        fprintf(stderr, "[Request] ERROR: cannot read %s\n", path);
        return false;
    }
    yyjson_val * root = yyjson_doc_get_root(doc);
    if (!yyjson_is_obj(root)) {
        fprintf(stderr, "[Request] ERROR: root is not an object in %s\n", path);
        yyjson_doc_free(doc);
        return false;
    }
    request_parse_obj(root, r);
    yyjson_doc_free(doc);
    fprintf(stderr, "[Request] Parsed %s\n", path);
    return true;
}

std::string request_to_json(const Yue2Request * r, bool sparse) {
    Yue2Request d;
    request_init(&d);

    yyjson_mut_doc * doc  = yyjson_mut_doc_new(NULL);
    yyjson_mut_val * root = yyjson_mut_obj(doc);
    yyjson_mut_doc_set_root(doc, root);

    if (!sparse || r->style != d.style) {
        yyjson_mut_obj_add_strncpy(doc, root, "style", r->style.c_str(), r->style.size());
    }
    if (!sparse || r->lyrics != d.lyrics) {
        yyjson_mut_obj_add_strncpy(doc, root, "lyrics", r->lyrics.c_str(), r->lyrics.size());
    }
    if (!sparse || r->abc != d.abc) {
        yyjson_mut_obj_add_strncpy(doc, root, "abc", r->abc.c_str(), r->abc.size());
    }
    if (!sparse || r->cot != d.cot) {
        yyjson_mut_obj_add_strncpy(doc, root, "cot", r->cot.c_str(), r->cot.size());
    }
    if (!sparse || r->duration != d.duration) {
        yyjson_mut_obj_add_real(doc, root, "duration", r->duration);
    }
    if (!sparse || r->lm_seed != d.lm_seed) {
        yyjson_mut_obj_add_sint(doc, root, "lm_seed", r->lm_seed);
    }
    if (!sparse || r->seed != d.seed) {
        yyjson_mut_obj_add_sint(doc, root, "seed", r->seed);
    }
    if (!sparse || r->solver != d.solver) {
        yyjson_mut_obj_add_strncpy(doc, root, "solver", r->solver.c_str(), r->solver.size());
    }
    if (!sparse || r->steps != d.steps) {
        yyjson_mut_obj_add_int(doc, root, "steps", r->steps);
    }
    if (!sparse || r->lm_batch_size != d.lm_batch_size) {
        yyjson_mut_obj_add_int(doc, root, "lm_batch_size", r->lm_batch_size);
    }
    if (!sparse || r->synth_batch_size != d.synth_batch_size) {
        yyjson_mut_obj_add_int(doc, root, "synth_batch_size", r->synth_batch_size);
    }
    add_sampling(doc, root, "abc_sampling", r->abc_sampling, d.abc_sampling, sparse);
    add_sampling(doc, root, "semantic_sampling", r->semantic_sampling, d.semantic_sampling, sparse);
    if (!sparse || r->semantic_tokens != d.semantic_tokens) {
        yyjson_mut_obj_add_strncpy(doc, root, "semantic_tokens", r->semantic_tokens.c_str(), r->semantic_tokens.size());
    }
    if (!r->semantic_keep.empty()) {   // HERESY 1037: written only when used
        yyjson_mut_obj_add_strncpy(doc, root, "semantic_keep", r->semantic_keep.c_str(), r->semantic_keep.size());
    }
    if (!sparse || r->cfg_scale != d.cfg_scale) {
        yyjson_mut_obj_add_real(doc, root, "cfg_scale", r->cfg_scale);
    }
    if (!sparse || r->output_format != d.output_format) {
        yyjson_mut_obj_add_strncpy(doc, root, "output_format", r->output_format.c_str(), r->output_format.size());
    }
    if (!sparse || r->peak_clip != d.peak_clip) {
        yyjson_mut_obj_add_int(doc, root, "peak_clip", r->peak_clip);
    }
    if (!sparse || r->mp3_bitrate != d.mp3_bitrate) {
        yyjson_mut_obj_add_int(doc, root, "mp3_bitrate", r->mp3_bitrate);
    }
    // Local additions (console): the same fields, written back (strengths rounded to 3 decimals)
    if (!sparse || r->title != d.title) {
        yyjson_mut_obj_add_strncpy(doc, root, "title", r->title.c_str(), r->title.size());
    }
    if (!sparse || r->vae != d.vae) {
        yyjson_mut_obj_add_strncpy(doc, root, "vae", r->vae.c_str(), r->vae.size());
    }
    if (!sparse || !r->sliders.empty()) {
        yyjson_mut_val * list = yyjson_mut_arr(doc);
        for (const Yue2SliderChoice & c : r->sliders) {
            yyjson_mut_val * item = yyjson_mut_obj(doc);
            yyjson_mut_obj_add_strncpy(doc, item, "id", c.id.c_str(), c.id.size());
            yyjson_mut_obj_add_real(doc, item, "strength", c.strength);
            if (!c.curve.empty()) {          // HERESY 1166: its curve, so a take made again runs the same
                yyjson_mut_val * pts = yyjson_mut_arr(doc);
                for (const auto & p : c.curve) {
                    yyjson_mut_val * pt = yyjson_mut_arr(doc);
                    yyjson_mut_arr_add_real(doc, pt, std::round(p.first * 1000.0) / 1000.0);
                    yyjson_mut_arr_add_real(doc, pt, std::round(p.second * 1000.0) / 1000.0);
                    yyjson_mut_arr_append(pts, pt);
                }
                yyjson_mut_obj_add_val(doc, item, "curve", pts);
            }
            yyjson_mut_arr_append(list, item);
        }
        yyjson_mut_obj_add_val(doc, root, "sliders", list);
    }
    if (!sparse || !r->loras.empty()) {
        yyjson_mut_val * list = yyjson_mut_arr(doc);
        for (const Yue2LoraChoice & c : r->loras) {
            yyjson_mut_val * item = yyjson_mut_obj(doc);
            yyjson_mut_obj_add_strncpy(doc, item, "id", c.id.c_str(), c.id.size());
            yyjson_mut_obj_add_real(doc, item, "ar", std::round((double) c.ar * 1000.0) / 1000.0);
            yyjson_mut_obj_add_real(doc, item, "nar", std::round((double) c.nar * 1000.0) / 1000.0);
            yyjson_mut_arr_append(list, item);
        }
        yyjson_mut_obj_add_val(doc, root, "loras", list);
    }
    if (!sparse || r->plan_only != d.plan_only) {
        yyjson_mut_obj_add_bool(doc, root, "plan_only", r->plan_only);
    }
    if (!sparse || r->score_guard != d.score_guard) {
        yyjson_mut_obj_add_bool(doc, root, "score_guard", r->score_guard);
    }
    if (!sparse || r->parent != d.parent) {
        yyjson_mut_obj_add_strncpy(doc, root, "parent", r->parent.c_str(), r->parent.size());
    }
    if (!r->decode_from.empty()) {   // HERESY 1168: only on its way in; a take's own request never keeps it
        yyjson_mut_obj_add_strncpy(doc, root, "decode_from", r->decode_from.c_str(), r->decode_from.size());
    }

    char *      json = yyjson_mut_write(doc, WRITE_FLAGS, NULL);
    std::string out  = json ? json : "{}";
    if (json) {
        free(json);
    }
    yyjson_mut_doc_free(doc);
    return out;
}

static int64_t random_seed() {
    std::random_device rd;
    uint64_t           hi = rd();
    uint64_t           lo = rd();
    return (int64_t) ((((hi << 32) | lo) >> 1));
}

void request_resolve_seed(Yue2Request * r) {
    if (r->lm_seed < 0) {
        r->lm_seed = random_seed();
    }
    if (r->seed < 0) {
        r->seed = random_seed();
    }
}

Yue2Request request_replay(const Yue2Request & base,
                           const std::string & abc,
                           const std::string & tokens,
                           int                 song,
                           int                 variation) {
    Yue2Request r      = base;
    r.abc              = abc;
    r.semantic_tokens  = tokens;
    r.lm_seed          = base.lm_seed + song;
    r.seed             = base.seed + variation;
    r.lm_batch_size    = 1;
    r.synth_batch_size = 1;
    return r;
}
