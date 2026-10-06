#pragma once
// sheetsage.h: SheetSage2 audio to score transcriber
//
// One GGUF holds MERT-v2-FullSong with the SheetSage2 LoRA merged and the
// SheetSage2 head. Audio at 24 kHz mono goes through the log mel frontend
// (DSP on the host), three ConvNeXt subsampling blocks and 24 conformer
// layers on the backend, a softmax mix of the 25 states projected to the
// decoder width, then a BART decoder writes symbolic tokens greedily under
// the grammar of the vocabulary. The events become an ABC score in
// notation.h.
//
// The window is fixed: every input is padded with silence to 300 s like the
// reference does, the global response norm of the frontend spans the whole
// window and would move with the padding otherwise.

#include "audio-resample.h"
#include "backend.h"
#include "debug.h"
#include "gguf-weights.h"
#include "graph-arena.h"
#include "notation.h"
#include "timer.h"
#include "weight-ctx.h"
#include "yyjson.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#define SS2_SAMPLE_RATE   24000
#define SS2_MAX_LAYERS    24
#define SS2_MAX_DEC       6
#define SS2_MAX_SUB       3
#define SS2_MAX_SUB_DEPTH 5
#define SS2_GRAPH_NODES   16384

struct SS2Config {
    // backbone
    int   n_fft, hop, win, n_mels;
    int   sub_channels[SS2_MAX_SUB];
    int   sub_depths[SS2_MAX_SUB];
    float sub_eps;
    int   hidden, inter, n_layers, n_heads, conv_kernel;
    float eps, rope_base;
    int   ratio;  // samples per encoder frame (960)
    // head
    int   d_model, d_inter, n_dec, n_dec_heads, vocab, max_out;
    float window_seconds;
    int   time_hz;
};

// The symbolic vocabulary, from the tokenizer tables of the GGUF: ranges by
// kind, and the label lists of the kinds that are not a plain index
struct SS2Tokenizer {
    int n_tokens, pad, sos, eos, out;
    int prompt0, prompt1, shift0, shift1, time0, time1, meter0, meter1, eighth0, eighth1, structure0, structure1, key0,
        key1, majmin0, majmin1, chord0, chord1, pitch0, pitch1, duration0, duration1;
    std::vector<std::string> prompts, structures, majmin_chords, chords, chords_abc, keys, keys_abc;
    std::vector<int>         meter_num, meter_den, duration_templates;
    std::vector<float>       duration_boundaries;
    NotTables                tables;  // chord and key labels -> ABC spelling
};

struct SS2ConvNext {
    struct ggml_tensor *dw_w, *dw_b;      // [7, 1, C] depthwise kernel and [C] bias
    struct ggml_tensor *ln_w, *ln_b;      // [C]
    struct ggml_tensor *up_w, *up_b;      // [C, 4C], [4C]
    struct ggml_tensor *grn_w, *grn_b;    // [4C]
    struct ggml_tensor *down_w, *down_b;  // [4C, C], [C]
};

struct SS2SubBlock {
    struct ggml_tensor *rs_ln_w, *rs_ln_b;  // [C_in], absent on the first block
    struct ggml_tensor *rs_w, *rs_b;        // [2, C_in, C_out], [C_out]
    SS2ConvNext         layers[SS2_MAX_SUB_DEPTH];
};

struct SS2Layer {
    struct ggml_tensor *ffn1_ln_w, *ffn1_ln_b, *ffn1_w1, *ffn1_b1, *ffn1_w2, *ffn1_b2;
    struct ggml_tensor *attn_ln_w, *attn_ln_b, *q_w, *q_b, *k_w, *k_b, *v_w, *v_b, *o_w, *o_b;
    struct ggml_tensor *conv_ln_w, *conv_ln_b, *conv_pw1, *conv_dw, *conv_dw_ln_w, *conv_dw_ln_b, *conv_pw2;
    struct ggml_tensor *ffn2_ln_w, *ffn2_ln_b, *ffn2_w1, *ffn2_b1, *ffn2_w2, *ffn2_b2;
    struct ggml_tensor *final_ln_w, *final_ln_b;
};

struct SS2DecLayer {
    struct ggml_tensor *sa_q_w, *sa_q_b, *sa_k_w, *sa_k_b, *sa_v_w, *sa_v_b, *sa_o_w, *sa_o_b, *sa_ln_w, *sa_ln_b;
    struct ggml_tensor *ca_q_w, *ca_q_b, *ca_k_w, *ca_k_b, *ca_v_w, *ca_v_b, *ca_o_w, *ca_o_b, *ca_ln_w, *ca_ln_b;
    struct ggml_tensor *fc1_w, *fc1_b, *fc2_w, *fc2_b, *final_ln_w, *final_ln_b;
};

struct SheetSage2 {
    SS2Config    cfg;
    SS2Tokenizer tok;

    // Mel frontend tables on the host: Hann window, mel filterbank
    // [n_fft / 2 + 1, n_mels] with the nonzero row span of every bin, per
    // bin mean and std
    std::vector<float> window, mel_fb, mel_mean, mel_std;
    std::vector<int>   mel_lo, mel_hi;

    SS2SubBlock sub[SS2_MAX_SUB];
    SS2Layer    layers[SS2_MAX_LAYERS];
    SS2DecLayer dec[SS2_MAX_DEC];

    struct ggml_tensor * layer_weight;     // [n_layers + 1]
    struct ggml_tensor * proj_w, *proj_b;  // [hidden, d_model], [d_model]
    struct ggml_tensor * embed;            // [d_model, vocab], the output projection too
    struct ggml_tensor * positions;        // [d_model, max_out + 2], row p + 2 is position p
    struct ggml_tensor * emb_ln_w, *emb_ln_b;

    WeightCtx            wctx;
    ggml_backend_t       backend;
    ggml_backend_t       cpu_backend;
    ggml_backend_sched_t sched;
    bool                 use_flash_attn;
    GraphArena           arena;
};

// json helpers on a parsed document

static int ss2_json_int(yyjson_val * obj, const char * key) {
    yyjson_val * v = yyjson_obj_get(obj, key);
    if (!v || !yyjson_is_num(v)) {
        fprintf(stderr, "[SheetSage] FATAL: config key %s missing\n", key);
        exit(1);
    }
    return (int) yyjson_get_num(v);
}

static float ss2_json_float(yyjson_val * obj, const char * key) {
    yyjson_val * v = yyjson_obj_get(obj, key);
    if (!v || !yyjson_is_num(v)) {
        fprintf(stderr, "[SheetSage] FATAL: config key %s missing\n", key);
        exit(1);
    }
    return (float) yyjson_get_num(v);
}

static yyjson_val * ss2_json_arr(yyjson_val * obj, const char * key) {
    yyjson_val * v = yyjson_obj_get(obj, key);
    if (!v || !yyjson_is_arr(v)) {
        fprintf(stderr, "[SheetSage] FATAL: config key %s missing\n", key);
        exit(1);
    }
    return v;
}

static void ss2_json_strings(yyjson_val * obj, const char * key, std::vector<std::string> * out) {
    yyjson_val * arr = ss2_json_arr(obj, key);
    size_t       idx, max;
    yyjson_val * v;
    yyjson_arr_foreach(arr, idx, max, v) {
        out->push_back(yyjson_get_str(v));
    }
}

static void ss2_load_config(SheetSage2 * m, const char * json) {
    yyjson_doc * doc = yyjson_read(json, strlen(json), 0);
    if (!doc) {
        fprintf(stderr, "[SheetSage] FATAL: malformed config json\n");
        exit(1);
    }
    yyjson_val * root = yyjson_doc_get_root(doc);
    yyjson_val * bb   = yyjson_obj_get(root, "backbone_config");
    SS2Config &  c    = m->cfg;
    c.n_fft           = ss2_json_int(bb, "n_fft");
    c.hop             = ss2_json_int(bb, "hop_length");
    c.win             = ss2_json_int(bb, "win_length");
    c.n_mels          = ss2_json_int(bb, "num_mel_bins");
    yyjson_val * ch   = ss2_json_arr(bb, "subsampling_channels");
    yyjson_val * dp   = ss2_json_arr(bb, "subsampling_depths");
    for (int i = 0; i < SS2_MAX_SUB; i++) {
        c.sub_channels[i] = (int) yyjson_get_num(yyjson_arr_get(ch, (size_t) i));
        c.sub_depths[i]   = (int) yyjson_get_num(yyjson_arr_get(dp, (size_t) i));
    }
    c.sub_eps        = ss2_json_float(bb, "subsampling_layer_norm_eps");
    c.hidden         = ss2_json_int(bb, "hidden_size");
    c.inter          = ss2_json_int(bb, "intermediate_size");
    c.n_layers       = ss2_json_int(bb, "num_hidden_layers");
    c.n_heads        = ss2_json_int(bb, "num_attention_heads");
    c.conv_kernel    = ss2_json_int(bb, "conv_depthwise_kernel_size");
    c.eps            = ss2_json_float(bb, "layer_norm_eps");
    c.rope_base      = ss2_json_float(bb, "rotary_embedding_base");
    c.ratio          = ss2_json_int(bb, "inputs_to_logits_ratio");
    c.d_model        = ss2_json_int(root, "hidden_size");
    c.d_inter        = ss2_json_int(root, "intermediate_size");
    c.n_dec          = ss2_json_int(root, "decoder_layers");
    c.n_dec_heads    = ss2_json_int(root, "num_attention_heads");
    c.vocab          = ss2_json_int(root, "vocab_size");
    c.max_out        = ss2_json_int(root, "max_output_seq_len");
    c.window_seconds = ss2_json_float(root, "input_audio_length");
    c.time_hz        = ss2_json_int(root, "time_hz");
    int sample_rate  = ss2_json_int(bb, "sampling_rate");
    yyjson_doc_free(doc);
    if (c.n_layers > SS2_MAX_LAYERS || c.n_dec > SS2_MAX_DEC || sample_rate != SS2_SAMPLE_RATE) {
        fprintf(stderr, "[SheetSage] FATAL: unsupported config\n");
        exit(1);
    }
}

static void ss2_load_tokenizer(SheetSage2 * m, const char * json) {
    yyjson_doc * doc = yyjson_read(json, strlen(json), 0);
    if (!doc) {
        fprintf(stderr, "[SheetSage] FATAL: malformed tokenizer json\n");
        exit(1);
    }
    yyjson_val *   root = yyjson_doc_get_root(doc);
    SS2Tokenizer & t    = m->tok;
    t.n_tokens          = ss2_json_int(root, "n_tokens");
    t.pad               = ss2_json_int(root, "pad");
    t.sos               = ss2_json_int(root, "sos");
    t.eos               = ss2_json_int(root, "eos");
    t.out               = ss2_json_int(root, "out");
    yyjson_val * ranges = yyjson_obj_get(root, "ranges");

    struct {
        const char * kind;
        int *        start;
        int *        end;
    } kinds[] = {
        { "prompt",          &t.prompt0,    &t.prompt1    },
        { "subbeat_shift",   &t.shift0,     &t.shift1     },
        { "time",            &t.time0,      &t.time1      },
        { "meter",           &t.meter0,     &t.meter1     },
        { "eighth_position", &t.eighth0,    &t.eighth1    },
        { "structure",       &t.structure0, &t.structure1 },
        { "key",             &t.key0,       &t.key1       },
        { "majmin_chord",    &t.majmin0,    &t.majmin1    },
        { "full_chord",      &t.chord0,     &t.chord1     },
        { "pitch",           &t.pitch0,     &t.pitch1     },
        { "duration",        &t.duration0,  &t.duration1  },
    };

    for (auto & k : kinds) {
        yyjson_val * r = ss2_json_arr(ranges, k.kind);
        *k.start       = (int) yyjson_get_num(yyjson_arr_get(r, 0));
        *k.end         = (int) yyjson_get_num(yyjson_arr_get(r, 1));
    }
    ss2_json_strings(root, "prompts", &t.prompts);
    ss2_json_strings(root, "structures", &t.structures);
    ss2_json_strings(root, "majmin_chords", &t.majmin_chords);
    ss2_json_strings(root, "full_chords", &t.chords);
    ss2_json_strings(root, "full_chords_abc", &t.chords_abc);
    ss2_json_strings(root, "keys", &t.keys);
    ss2_json_strings(root, "keys_abc", &t.keys_abc);
    for (size_t i = 0; i < t.chords.size(); i++) {
        t.tables.chord_abc[t.chords[i]] = t.chords_abc[i];
    }
    for (size_t i = 0; i < t.keys.size(); i++) {
        t.tables.key_abc[t.keys[i]] = t.keys_abc[i];
    }
    yyjson_val * meters = ss2_json_arr(root, "meters");
    size_t       idx, max;
    yyjson_val * v;
    yyjson_arr_foreach(meters, idx, max, v) {
        t.meter_num.push_back((int) yyjson_get_num(yyjson_arr_get(v, 0)));
        t.meter_den.push_back((int) yyjson_get_num(yyjson_arr_get(v, 1)));
    }
    yyjson_arr_foreach(ss2_json_arr(root, "duration_templates"), idx, max, v) {
        t.duration_templates.push_back((int) yyjson_get_num(v));
    }
    yyjson_arr_foreach(ss2_json_arr(root, "duration_boundaries"), idx, max, v) {
        t.duration_boundaries.push_back((float) yyjson_get_num(v));
    }
    yyjson_doc_free(doc);
}

// weights, in the type the GGUF holds: F32 for the kernels, norms, tables
// and positions, the quant of the file for the linear projections
static struct ggml_tensor * ss2_t(WeightCtx * w, const GGUFModel & gf, const std::string & name) {
    return gf_load_tensor(w, gf, name);
}

static void ss2_load_convnext(WeightCtx * w, const GGUFModel & gf, SS2ConvNext * l, const std::string & p) {
    l->dw_w   = ss2_t(w, gf, p + ".depthwise_block.1.weight");
    l->dw_b   = ss2_t(w, gf, p + ".depthwise_block.1.bias");
    l->ln_w   = ss2_t(w, gf, p + ".pointwise_block.0.weight");
    l->ln_b   = ss2_t(w, gf, p + ".pointwise_block.0.bias");
    l->up_w   = ss2_t(w, gf, p + ".pointwise_block.1.weight");
    l->up_b   = ss2_t(w, gf, p + ".pointwise_block.1.bias");
    l->grn_w  = ss2_t(w, gf, p + ".pointwise_block.3.weight");
    l->grn_b  = ss2_t(w, gf, p + ".pointwise_block.3.bias");
    l->down_w = ss2_t(w, gf, p + ".pointwise_block.4.weight");
    l->down_b = ss2_t(w, gf, p + ".pointwise_block.4.bias");
}

static void ss2_load_layer(WeightCtx * w, const GGUFModel & gf, SS2Layer * l, const std::string & p) {
    l->ffn1_ln_w    = ss2_t(w, gf, p + ".ffn1_layer_norm.weight");
    l->ffn1_ln_b    = ss2_t(w, gf, p + ".ffn1_layer_norm.bias");
    l->ffn1_w1      = ss2_t(w, gf, p + ".ffn1.w_1.weight");
    l->ffn1_b1      = ss2_t(w, gf, p + ".ffn1.w_1.bias");
    l->ffn1_w2      = ss2_t(w, gf, p + ".ffn1.w_2.weight");
    l->ffn1_b2      = ss2_t(w, gf, p + ".ffn1.w_2.bias");
    l->attn_ln_w    = ss2_t(w, gf, p + ".attn_layer_norm.weight");
    l->attn_ln_b    = ss2_t(w, gf, p + ".attn_layer_norm.bias");
    l->q_w          = ss2_t(w, gf, p + ".attn.query_proj.weight");
    l->q_b          = ss2_t(w, gf, p + ".attn.query_proj.bias");
    l->k_w          = ss2_t(w, gf, p + ".attn.key_proj.weight");
    l->k_b          = ss2_t(w, gf, p + ".attn.key_proj.bias");
    l->v_w          = ss2_t(w, gf, p + ".attn.value_proj.weight");
    l->v_b          = ss2_t(w, gf, p + ".attn.value_proj.bias");
    l->o_w          = ss2_t(w, gf, p + ".attn.out_proj.weight");
    l->o_b          = ss2_t(w, gf, p + ".attn.out_proj.bias");
    l->conv_ln_w    = ss2_t(w, gf, p + ".conv_module.layer_norm.weight");
    l->conv_ln_b    = ss2_t(w, gf, p + ".conv_module.layer_norm.bias");
    l->conv_pw1     = ss2_t(w, gf, p + ".conv_module.conv_block.1.weight");
    l->conv_dw      = ss2_t(w, gf, p + ".conv_module.conv_block.3.weight");
    l->conv_dw_ln_w = ss2_t(w, gf, p + ".conv_module.conv_block.4.1.weight");
    l->conv_dw_ln_b = ss2_t(w, gf, p + ".conv_module.conv_block.4.1.bias");
    l->conv_pw2     = ss2_t(w, gf, p + ".conv_module.conv_block.6.weight");
    l->ffn2_ln_w    = ss2_t(w, gf, p + ".ffn2_layer_norm.weight");
    l->ffn2_ln_b    = ss2_t(w, gf, p + ".ffn2_layer_norm.bias");
    l->ffn2_w1      = ss2_t(w, gf, p + ".ffn2.w_1.weight");
    l->ffn2_b1      = ss2_t(w, gf, p + ".ffn2.w_1.bias");
    l->ffn2_w2      = ss2_t(w, gf, p + ".ffn2.w_2.weight");
    l->ffn2_b2      = ss2_t(w, gf, p + ".ffn2.w_2.bias");
    l->final_ln_w   = ss2_t(w, gf, p + ".final_layer_norm.weight");
    l->final_ln_b   = ss2_t(w, gf, p + ".final_layer_norm.bias");
}

static void ss2_load_dec_layer(WeightCtx * w, const GGUFModel & gf, SS2DecLayer * l, const std::string & p) {
    l->sa_q_w     = ss2_t(w, gf, p + ".self_attn.q_proj.weight");
    l->sa_q_b     = ss2_t(w, gf, p + ".self_attn.q_proj.bias");
    l->sa_k_w     = ss2_t(w, gf, p + ".self_attn.k_proj.weight");
    l->sa_k_b     = ss2_t(w, gf, p + ".self_attn.k_proj.bias");
    l->sa_v_w     = ss2_t(w, gf, p + ".self_attn.v_proj.weight");
    l->sa_v_b     = ss2_t(w, gf, p + ".self_attn.v_proj.bias");
    l->sa_o_w     = ss2_t(w, gf, p + ".self_attn.out_proj.weight");
    l->sa_o_b     = ss2_t(w, gf, p + ".self_attn.out_proj.bias");
    l->sa_ln_w    = ss2_t(w, gf, p + ".self_attn_layer_norm.weight");
    l->sa_ln_b    = ss2_t(w, gf, p + ".self_attn_layer_norm.bias");
    l->ca_q_w     = ss2_t(w, gf, p + ".encoder_attn.q_proj.weight");
    l->ca_q_b     = ss2_t(w, gf, p + ".encoder_attn.q_proj.bias");
    l->ca_k_w     = ss2_t(w, gf, p + ".encoder_attn.k_proj.weight");
    l->ca_k_b     = ss2_t(w, gf, p + ".encoder_attn.k_proj.bias");
    l->ca_v_w     = ss2_t(w, gf, p + ".encoder_attn.v_proj.weight");
    l->ca_v_b     = ss2_t(w, gf, p + ".encoder_attn.v_proj.bias");
    l->ca_o_w     = ss2_t(w, gf, p + ".encoder_attn.out_proj.weight");
    l->ca_o_b     = ss2_t(w, gf, p + ".encoder_attn.out_proj.bias");
    l->ca_ln_w    = ss2_t(w, gf, p + ".encoder_attn_layer_norm.weight");
    l->ca_ln_b    = ss2_t(w, gf, p + ".encoder_attn_layer_norm.bias");
    l->fc1_w      = ss2_t(w, gf, p + ".fc1.weight");
    l->fc1_b      = ss2_t(w, gf, p + ".fc1.bias");
    l->fc2_w      = ss2_t(w, gf, p + ".fc2.weight");
    l->fc2_b      = ss2_t(w, gf, p + ".fc2.bias");
    l->final_ln_w = ss2_t(w, gf, p + ".final_layer_norm.weight");
    l->final_ln_b = ss2_t(w, gf, p + ".final_layer_norm.bias");
}

// Copy a host table out of the GGUF
static void ss2_host_table(const GGUFModel & gf, const char * name, std::vector<float> * out, size_t n) {
    const float * data = (const float *) gf_get_data(gf, name);
    if (!data) {
        fprintf(stderr, "[SheetSage] FATAL: tensor %s missing\n", name);
        exit(1);
    }
    out->assign(data, data + n);
}

static bool ss2_load(SheetSage2 * m, const char * gguf_path) {
    *m           = {};
    GGUFModel gf = {};
    if (!gf_load(&gf, gguf_path)) {
        fprintf(stderr, "[SheetSage] FATAL: cannot load %s\n", gguf_path);
        return false;
    }
    ss2_load_config(m, gf_get_str(gf, "sheetsage2.config_json"));
    ss2_load_tokenizer(m, gf_get_str(gf, "sheetsage2.tokenizer_json"));
    const SS2Config & c = m->cfg;

    BackendPair bp    = backend_init("SheetSage");
    m->backend        = bp.backend;
    m->cpu_backend    = bp.cpu_backend;
    m->sched          = backend_sched_new(bp, SS2_GRAPH_NODES);
    m->use_flash_attn = bp.has_gpu;

    ss2_host_table(gf, "encoder.feature_extractor.spectrogram.window", &m->window, (size_t) c.win);
    ss2_host_table(gf, "encoder.feature_extractor.mel_scale.fb", &m->mel_fb, (size_t) (c.n_fft / 2 + 1) * c.n_mels);
    ss2_host_table(gf, "encoder.feature_extractor.mel_mean", &m->mel_mean, (size_t) c.n_mels);
    ss2_host_table(gf, "encoder.feature_extractor.mel_std", &m->mel_std, (size_t) c.n_mels);
    for (int k = 0; k < c.n_mels; k++) {
        int lo = c.n_fft / 2 + 1, hi = 0;
        for (int b = 0; b < c.n_fft / 2 + 1; b++) {
            if (m->mel_fb[(size_t) b * c.n_mels + k] != 0.0f) {
                lo = std::min(lo, b);
                hi = std::max(hi, b + 1);
            }
        }
        m->mel_lo.push_back(lo);
        m->mel_hi.push_back(hi);
    }

    int n_sub = 0;
    for (int i = 0; i < SS2_MAX_SUB; i++) {
        n_sub += c.sub_depths[i];
    }
    wctx_init(&m->wctx, 8 + 4 * SS2_MAX_SUB + 10 * n_sub + 31 * c.n_layers + 26 * c.n_dec);

    for (int i = 0; i < SS2_MAX_SUB; i++) {
        std::string p = "encoder.subsampling_module." + std::to_string(i);
        if (i > 0) {
            m->sub[i].rs_ln_w = ss2_t(&m->wctx, gf, p + ".resampling_layer.0.weight");
            m->sub[i].rs_ln_b = ss2_t(&m->wctx, gf, p + ".resampling_layer.0.bias");
            m->sub[i].rs_w    = ss2_t(&m->wctx, gf, p + ".resampling_layer.2.weight");
            m->sub[i].rs_b    = ss2_t(&m->wctx, gf, p + ".resampling_layer.2.bias");
        }
        for (int d = 0; d < c.sub_depths[i]; d++) {
            ss2_load_convnext(&m->wctx, gf, &m->sub[i].layers[d], p + ".convnext_layers." + std::to_string(d));
        }
    }
    for (int l = 0; l < c.n_layers; l++) {
        ss2_load_layer(&m->wctx, gf, &m->layers[l], "encoder.layers." + std::to_string(l));
    }
    m->layer_weight = ss2_t(&m->wctx, gf, "layer_weight");
    m->proj_w       = ss2_t(&m->wctx, gf, "encoder_projection.weight");
    m->proj_b       = ss2_t(&m->wctx, gf, "encoder_projection.bias");
    m->embed        = ss2_t(&m->wctx, gf, "token_embedding.weight");
    m->positions    = ss2_t(&m->wctx, gf, "decoder.embed_positions.weight");
    m->emb_ln_w     = ss2_t(&m->wctx, gf, "decoder.layernorm_embedding.weight");
    m->emb_ln_b     = ss2_t(&m->wctx, gf, "decoder.layernorm_embedding.bias");
    for (int l = 0; l < c.n_dec; l++) {
        ss2_load_dec_layer(&m->wctx, gf, &m->dec[l], "decoder.layers." + std::to_string(l));
    }
    if (!wctx_alloc(&m->wctx, m->backend)) {
        return false;
    }
    gf_close(&gf);

    if (!graph_arena_init(&m->arena, SS2_GRAPH_NODES)) {
        return false;
    }
    fprintf(stderr, "[SheetSage] Loaded: %d conformer layers, %d decoder layers, vocab %d, window %.0f s\n", c.n_layers,
            c.n_dec, c.vocab, (double) c.window_seconds);
    return true;
}

static void ss2_free(SheetSage2 * m) {
    graph_arena_free(&m->arena);
    wctx_free(&m->wctx);
    if (m->sched) {
        ggml_backend_sched_free(m->sched);
    }
    backend_release(m->backend, m->cpu_backend);
}

// Mel frontend on the host, the torchaudio pipeline of the checkpoint:
// centered reflect padded STFT, power spectrum, mel filterbank, dB, the last
// frame dropped, per bin normalization. Output [T, n_mels] time major.

// In place radix 2 FFT on interleaved complex pairs, n a power of two
static void ss2_fft(float * re, float * im, int n) {
    for (int i = 1, j = 0; i < n; i++) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) {
            j ^= bit;
        }
        j ^= bit;
        if (i < j) {
            std::swap(re[i], re[j]);
            std::swap(im[i], im[j]);
        }
    }
    for (int len = 2; len <= n; len <<= 1) {
        double ang = -2.0 * M_PI / len;
        float  wr  = (float) cos(ang);
        float  wi  = (float) sin(ang);
        for (int i = 0; i < n; i += len) {
            float cr = 1.0f, ci = 0.0f;
            for (int j = 0; j < len / 2; j++) {
                int   a = i + j, b = i + j + len / 2;
                float xr = re[b] * cr - im[b] * ci;
                float xi = re[b] * ci + im[b] * cr;
                re[b]    = re[a] - xr;
                im[b]    = im[a] - xi;
                re[a] += xr;
                im[a] += xi;
                float nr = cr * wr - ci * wi;
                ci       = cr * wi + ci * wr;
                cr       = nr;
            }
        }
    }
}

static void ss2_mel(const SheetSage2 * m, const float * audio, int n_samples, std::vector<float> * mel, int * T) {
    const SS2Config & c      = m->cfg;
    int               half   = c.n_fft / 2;
    int               bins   = half + 1;
    // Centered frames over the reflect padded signal, the last one dropped
    int               frames = n_samples / c.hop;
    *T                       = frames;
    mel->assign((size_t) frames * c.n_mels, 0.0f);

    std::vector<float> re(c.n_fft), im(c.n_fft), power(bins);
    for (int f = 0; f < frames; f++) {
        int start = f * c.hop - half;
        for (int i = 0; i < c.n_fft; i++) {
            int idx = start + i;
            if (idx < 0) {
                idx = -idx;
            } else if (idx >= n_samples) {
                idx = 2 * (n_samples - 1) - idx;
            }
            re[i] = audio[idx] * m->window[i];
            im[i] = 0.0f;
        }
        ss2_fft(re.data(), im.data(), c.n_fft);
        for (int b = 0; b < bins; b++) {
            power[b] = re[b] * re[b] + im[b] * im[b];
        }
        float * row = mel->data() + (size_t) f * c.n_mels;
        for (int k = 0; k < c.n_mels; k++) {
            double acc = 0.0;
            for (int b = m->mel_lo[(size_t) k]; b < m->mel_hi[(size_t) k]; b++) {
                acc += (double) power[b] * m->mel_fb[(size_t) b * c.n_mels + k];
            }
            float db = 10.0f * log10f(fmaxf((float) acc, 1e-10f));
            row[k]   = (db - m->mel_mean[k]) / fmaxf(m->mel_std[k], 1e-5f);
        }
    }
}

// graph pieces, activations [C, T] with the channel on ne0

static struct ggml_tensor * ss2_linear(struct ggml_context * ctx,
                                       struct ggml_tensor *  w,
                                       struct ggml_tensor *  b,
                                       struct ggml_tensor *  x) {
    struct ggml_tensor * y = ggml_mul_mat(ctx, w, x);
    return b ? ggml_add(ctx, y, b) : y;
}

static struct ggml_tensor * ss2_layer_norm(struct ggml_context * ctx,
                                           struct ggml_tensor *  x,
                                           struct ggml_tensor *  w,
                                           struct ggml_tensor *  b,
                                           float                 eps) {
    return ggml_add(ctx, ggml_mul(ctx, ggml_norm(ctx, x, eps), w), b);
}

// Depthwise convolution along time, same padding, as the sum over the taps
// of the padded activation shifted by the tap times the per channel weight:
// exact F32 on every backend, no time major layout needed. The kernel
// [K, 1, C] turns into one [C] weight vector per tap.
static struct ggml_tensor * ss2_depthwise(struct ggml_context * ctx, struct ggml_tensor * x, struct ggml_tensor * k) {
    int                  K  = (int) k->ne[0];
    int64_t              C  = x->ne[0];
    int64_t              T  = x->ne[1];
    struct ggml_tensor * xp = ggml_pad_ext(ctx, x, 0, 0, (K - 1) / 2, (K - 1) / 2, 0, 0, 0, 0);    // [C, T + K - 1]
    struct ggml_tensor * kt = ggml_cont(ctx, ggml_transpose(ctx, ggml_reshape_2d(ctx, k, K, C)));  // [C, K]
    struct ggml_tensor * y  = NULL;
    for (int j = 0; j < K; j++) {
        struct ggml_tensor * shifted = ggml_view_2d(ctx, xp, C, T, xp->nb[1], (size_t) j * xp->nb[1]);
        struct ggml_tensor * tap     = ggml_view_1d(ctx, kt, C, (size_t) j * kt->nb[1]);
        struct ggml_tensor * term    = ggml_mul(ctx, shifted, tap);
        y                            = y ? ggml_add(ctx, y, term) : term;
    }
    return y;
}

// Global response norm: the L2 magnitude of every channel over the whole
// window, scaled by the mean magnitude, gates the features
static struct ggml_tensor * ss2_grn(struct ggml_context * ctx,
                                    struct ggml_tensor *  x,
                                    struct ggml_tensor *  w,
                                    struct ggml_tensor *  b) {
    struct ggml_tensor * sq    = ggml_cont(ctx, ggml_transpose(ctx, ggml_sqr(ctx, x)));  // [T, C]
    struct ggml_tensor * mag   = ggml_sqrt(ctx, ggml_sum_rows(ctx, sq));                 // [1, C]
    mag                        = ggml_reshape_1d(ctx, mag, x->ne[0]);                    // [C]
    struct ggml_tensor * nrm   = ggml_div(ctx, mag, ggml_scale_bias(ctx, ggml_mean(ctx, mag), 1.0f, 1e-6f));
    struct ggml_tensor * gated = ggml_mul(ctx, x, nrm);
    return ggml_add(ctx, ggml_add(ctx, ggml_mul(ctx, gated, w), b), x);
}

static struct ggml_tensor * ss2_build_convnext(struct ggml_context * ctx,
                                               const SS2ConvNext *   l,
                                               struct ggml_tensor *  x,
                                               float                 eps) {
    struct ggml_tensor * h = ggml_add(ctx, ss2_depthwise(ctx, x, l->dw_w), l->dw_b);
    h                      = ss2_layer_norm(ctx, h, l->ln_w, l->ln_b, eps);
    h                      = ggml_gelu_erf(ctx, ss2_linear(ctx, l->up_w, l->up_b, h));
    h                      = ss2_grn(ctx, h, l->grn_w, l->grn_b);
    h                      = ss2_linear(ctx, l->down_w, l->down_b, h);
    return ggml_add(ctx, x, h);
}

// Resampling: LayerNorm then a kernel 2 stride 2 convolution, which is a
// matmul over pairs of consecutive frames once the [C, T] activation is seen
// as [2C, T / 2]
static struct ggml_tensor * ss2_build_resample(struct ggml_context * ctx,
                                               const SS2SubBlock *   b,
                                               struct ggml_tensor *  x,
                                               float                 eps) {
    struct ggml_tensor * h     = ss2_layer_norm(ctx, x, b->rs_ln_w, b->rs_ln_b, eps);
    int64_t              C_in  = h->ne[0];
    int64_t              C_out = b->rs_w->ne[2];
    h                          = ggml_reshape_2d(ctx, h, 2 * C_in, h->ne[1] / 2);
    // Kernel [2, C_in, C_out] reordered as [C_in, 2, C_out] so the pair index is outer
    struct ggml_tensor * w     = ggml_cont(ctx, ggml_permute(ctx, b->rs_w, 1, 0, 2, 3));
    w                          = ggml_reshape_2d(ctx, w, 2 * C_in, C_out);
    return ss2_linear(ctx, w, b->rs_b, h);
}

static struct ggml_tensor * ss2_build_ffn(struct ggml_context * ctx,
                                          struct ggml_tensor *  x,
                                          struct ggml_tensor *  ln_w,
                                          struct ggml_tensor *  ln_b,
                                          struct ggml_tensor *  w1,
                                          struct ggml_tensor *  b1,
                                          struct ggml_tensor *  w2,
                                          struct ggml_tensor *  b2,
                                          float                 eps) {
    struct ggml_tensor * h = ss2_layer_norm(ctx, x, ln_w, ln_b, eps);
    h                      = ggml_gelu_erf(ctx, ss2_linear(ctx, w1, b1, h));
    return ss2_linear(ctx, w2, b2, h);
}

static struct ggml_tensor * ss2_build_attn(struct ggml_context * ctx,
                                           const SS2Config &     c,
                                           const SS2Layer *      l,
                                           struct ggml_tensor *  x,
                                           struct ggml_tensor *  positions,
                                           bool                  flash) {
    int                  D = c.hidden / c.n_heads;
    int64_t              T = x->ne[1];
    struct ggml_tensor * h = ss2_layer_norm(ctx, x, l->attn_ln_w, l->attn_ln_b, c.eps);
    struct ggml_tensor * q = ggml_reshape_3d(ctx, ss2_linear(ctx, l->q_w, l->q_b, h), D, c.n_heads, T);
    struct ggml_tensor * k = ggml_reshape_3d(ctx, ss2_linear(ctx, l->k_w, l->k_b, h), D, c.n_heads, T);
    struct ggml_tensor * v = ggml_reshape_3d(ctx, ss2_linear(ctx, l->v_w, l->v_b, h), D, c.n_heads, T);
    q = ggml_rope_ext(ctx, q, positions, NULL, D, GGML_ROPE_TYPE_NEOX, 0, c.rope_base, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f);
    k = ggml_rope_ext(ctx, k, positions, NULL, D, GGML_ROPE_TYPE_NEOX, 0, c.rope_base, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f);
    q = ggml_cont(ctx, ggml_permute(ctx, q, 0, 2, 1, 3));  // [D, T, H]
    k = ggml_cont(ctx, ggml_permute(ctx, k, 0, 2, 1, 3));
    v = ggml_cont(ctx, ggml_permute(ctx, v, 0, 2, 1, 3));
    float                scale = 1.0f / sqrtf((float) D);
    struct ggml_tensor * out;
    if (flash) {
        k   = ggml_cast(ctx, k, GGML_TYPE_F16);
        v   = ggml_cast(ctx, v, GGML_TYPE_F16);
        out = ggml_flash_attn_ext(ctx, q, k, v, NULL, scale, 0.0f, 0.0f);  // [D, H, T]
        ggml_prec_set_acc(out, GGML_PREC_F32);
    } else {
        struct ggml_tensor * scores = ggml_soft_max_ext(ctx, ggml_mul_mat(ctx, k, q), NULL, scale, 0.0f);
        struct ggml_tensor * vt     = ggml_cont(ctx, ggml_transpose(ctx, v));
        out                         = ggml_cont(ctx, ggml_permute(ctx, ggml_mul_mat(ctx, vt, scores), 0, 2, 1, 3));
    }
    out = ggml_reshape_2d(ctx, out, c.hidden, T);
    return ss2_linear(ctx, l->o_w, l->o_b, out);
}

static struct ggml_tensor * ss2_build_conv_module(struct ggml_context * ctx,
                                                  const SS2Config &     c,
                                                  const SS2Layer *      l,
                                                  struct ggml_tensor *  x) {
    struct ggml_tensor * h  = ss2_layer_norm(ctx, x, l->conv_ln_w, l->conv_ln_b, c.eps);
    // Pointwise [C, 2C] then GLU: the first half gated by the sigmoid of the second
    struct ggml_tensor * pw = ggml_mul_mat(ctx, ggml_reshape_2d(ctx, l->conv_pw1, c.hidden, 2 * c.hidden), h);
    struct ggml_tensor * a  = ggml_view_2d(ctx, pw, c.hidden, pw->ne[1], pw->nb[1], 0);
    struct ggml_tensor * g  = ggml_view_2d(ctx, pw, c.hidden, pw->ne[1], pw->nb[1], (size_t) c.hidden * pw->nb[0]);
    h                       = ggml_mul(ctx, ggml_cont(ctx, a), ggml_sigmoid(ctx, ggml_cont(ctx, g)));
    h                       = ss2_depthwise(ctx, h, l->conv_dw);
    h                       = ss2_layer_norm(ctx, h, l->conv_dw_ln_w, l->conv_dw_ln_b, c.eps);
    h                       = ggml_gelu_erf(ctx, h);
    return ggml_mul_mat(ctx, ggml_reshape_2d(ctx, l->conv_pw2, c.hidden, c.hidden), h);
}

static struct ggml_tensor * ss2_build_conformer(struct ggml_context * ctx,
                                                const SS2Config &     c,
                                                const SS2Layer *      l,
                                                struct ggml_tensor *  x,
                                                struct ggml_tensor *  positions,
                                                bool                  flash) {
    x = ggml_add(ctx, x,
                 ggml_scale(ctx,
                            ss2_build_ffn(ctx, x, l->ffn1_ln_w, l->ffn1_ln_b, l->ffn1_w1, l->ffn1_b1, l->ffn1_w2,
                                          l->ffn1_b2, c.eps),
                            0.5f));
    x = ggml_add(ctx, x, ss2_build_attn(ctx, c, l, x, positions, flash));
    x = ggml_add(ctx, x, ss2_build_conv_module(ctx, c, l, x));
    x = ggml_add(ctx, x,
                 ggml_scale(ctx,
                            ss2_build_ffn(ctx, x, l->ffn2_ln_w, l->ffn2_ln_b, l->ffn2_w1, l->ffn2_b1, l->ffn2_w2,
                                          l->ffn2_b2, c.eps),
                            0.5f));
    return ss2_layer_norm(ctx, x, l->final_ln_w, l->final_ln_b, c.eps);
}

// Encoder: mel [n_mels, T_mel] -> memory [d_model, T] with T = T_mel / 4, and
// the probes the harness reads (subsampled input, backbone output, mix)
struct SS2Encoded {
    std::vector<float> memory;  // [T, d_model] time major
    int                T;
};

static bool ss2_encode(SheetSage2 *               m,
                       const std::vector<float> & mel,
                       int                        T_mel,
                       SS2Encoded *               out,
                       const DebugDumper *        dbg) {
    const SS2Config & c = m->cfg;
    Timer             timer;
    ggml_backend_sched_reset(m->sched);
    struct ggml_context * ctx = graph_arena_begin(&m->arena);
    struct ggml_cgraph *  gf  = ggml_new_graph_custom(ctx, SS2_GRAPH_NODES, false);

    struct ggml_tensor * in_mel = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, c.n_mels, T_mel);
    ggml_set_name(in_mel, "mel");
    ggml_set_input(in_mel);
    int                  T      = T_mel / 4;
    struct ggml_tensor * in_pos = ggml_new_tensor_1d(ctx, GGML_TYPE_I32, T);
    ggml_set_name(in_pos, "positions");
    ggml_set_input(in_pos);

    struct ggml_tensor * x = in_mel;
    for (int i = 0; i < SS2_MAX_SUB; i++) {
        if (i > 0) {
            x = ss2_build_resample(ctx, &m->sub[i], x, c.sub_eps);
        }
        for (int d = 0; d < c.sub_depths[i]; d++) {
            x = ss2_build_convnext(ctx, &m->sub[i].layers[d], x, c.sub_eps);
        }
    }
    ggml_set_name(x, "subsampled");
    ggml_set_output(x);

    // The mix accumulates every state weighted by the softmax of layer_weight
    struct ggml_tensor * weights = ggml_soft_max(ctx, m->layer_weight);
    struct ggml_tensor * mixed   = ggml_mul(ctx, x, ggml_view_1d(ctx, weights, 1, 0));
    for (int l = 0; l < c.n_layers; l++) {
        x = ss2_build_conformer(ctx, c, &m->layers[l], x, in_pos, m->use_flash_attn);
        mixed =
            ggml_add(ctx, mixed, ggml_mul(ctx, x, ggml_view_1d(ctx, weights, 1, (size_t) (l + 1) * weights->nb[0])));
    }
    ggml_set_name(x, "backbone");
    ggml_set_output(x);
    ggml_set_name(mixed, "mixed");
    ggml_set_output(mixed);
    struct ggml_tensor * memory = ss2_linear(ctx, m->proj_w, m->proj_b, mixed);
    ggml_set_name(memory, "memory");
    ggml_set_output(memory);
    ggml_build_forward_expand(gf, memory);

    if (!ggml_backend_sched_alloc_graph(m->sched, gf)) {
        fprintf(stderr, "[SheetSage] FATAL: encoder graph alloc failed\n");
        return false;
    }
    ggml_backend_tensor_set(in_mel, mel.data(), 0, mel.size() * sizeof(float));
    std::vector<int32_t> pos(T);
    for (int i = 0; i < T; i++) {
        pos[i] = i;
    }
    ggml_backend_tensor_set(in_pos, pos.data(), 0, pos.size() * sizeof(int32_t));
    ggml_backend_sched_graph_compute(m->sched, gf);

    out->T = T;
    out->memory.resize((size_t) T * c.d_model);
    ggml_backend_tensor_get(memory, out->memory.data(), 0, out->memory.size() * sizeof(float));
    if (dbg->enabled) {
        const char * names[] = { "subsampled", "backbone", "mixed", "memory" };
        for (const char * name : names) {
            struct ggml_tensor * t = ggml_graph_get_tensor(gf, name);
            std::vector<float>   buf((size_t) t->ne[0] * t->ne[1]);
            ggml_backend_tensor_get(t, buf.data(), 0, buf.size() * sizeof(float));
            debug_dump_2d(dbg, name, buf.data(), (int) t->ne[1], (int) t->ne[0]);
        }
    }
    fprintf(stderr, "[SheetSage] Encoded: %d frames, %d nodes, %.0f ms\n", T, ggml_graph_n_nodes(gf), timer.ms());
    return true;
}

// Decoder: a BART stack over the memory of one window. The cross attention
// keys and values of every layer are projected once per window, the self
// attention keys and values accumulate in a cache row by row, and one graph
// per token reads both. Post layer norm like BART.
struct SS2Decoder {
    struct ggml_context * ctx;
    ggml_backend_buffer_t buf;
    struct ggml_tensor *  mem_k[SS2_MAX_DEC];   // [D, T, H] f16 per layer
    struct ggml_tensor *  mem_v[SS2_MAX_DEC];
    struct ggml_tensor *  self_k[SS2_MAX_DEC];  // [D, max_out, H] f32 per layer
    struct ggml_tensor *  self_v[SS2_MAX_DEC];
    int                   T;                    // memory frames
    int                   pos;                  // tokens written to the self attention cache
};

static bool ss2_decoder_alloc(SheetSage2 * m, SS2Decoder * d, int T) {
    const SS2Config & c        = m->cfg;
    int               D        = c.d_model / c.n_dec_heads;
    *d                         = {};
    d->T                       = T;
    struct ggml_init_params ip = { ggml_tensor_overhead() * 4 * SS2_MAX_DEC + 1024, NULL, true };
    d->ctx                     = ggml_init(ip);
    for (int l = 0; l < c.n_dec; l++) {
        d->mem_k[l]  = ggml_new_tensor_3d(d->ctx, GGML_TYPE_F16, D, T, c.n_dec_heads);
        d->mem_v[l]  = ggml_new_tensor_3d(d->ctx, GGML_TYPE_F16, D, T, c.n_dec_heads);
        d->self_k[l] = ggml_new_tensor_3d(d->ctx, GGML_TYPE_F32, D, c.max_out, c.n_dec_heads);
        d->self_v[l] = ggml_new_tensor_3d(d->ctx, GGML_TYPE_F32, D, c.max_out, c.n_dec_heads);
    }
    d->buf = ggml_backend_alloc_ctx_tensors(d->ctx, m->backend);
    if (!d->buf) {
        fprintf(stderr, "[SheetSage] FATAL: decoder buffer alloc failed\n");
        return false;
    }
    return true;
}

static void ss2_decoder_free(SS2Decoder * d) {
    if (d->buf) {
        ggml_backend_buffer_free(d->buf);
    }
    if (d->ctx) {
        ggml_free(d->ctx);
    }
    *d = {};
}

// Heads of a [d_model, N] projection as [D, N, H]
static struct ggml_tensor * ss2_heads(struct ggml_context * ctx, struct ggml_tensor * x, int D, int H) {
    return ggml_cont(ctx, ggml_permute(ctx, ggml_reshape_3d(ctx, x, D, H, x->ne[1]), 0, 2, 1, 3));
}

// Project the memory of a window into the cross attention keys and values
// of every layer, and reset the self attention cache
static bool ss2_decoder_prepare(SheetSage2 * m, SS2Decoder * d, const std::vector<float> & memory) {
    const SS2Config & c = m->cfg;
    int               D = c.d_model / c.n_dec_heads;
    ggml_backend_sched_reset(m->sched);
    struct ggml_context * ctx = graph_arena_begin(&m->arena);
    struct ggml_cgraph *  gf  = ggml_new_graph_custom(ctx, SS2_GRAPH_NODES, false);
    struct ggml_tensor *  mem = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, c.d_model, d->T);
    ggml_set_name(mem, "memory");
    ggml_set_input(mem);
    for (int l = 0; l < c.n_dec; l++) {
        const SS2DecLayer *  ly = &m->dec[l];
        struct ggml_tensor * k  = ss2_heads(ctx, ss2_linear(ctx, ly->ca_k_w, ly->ca_k_b, mem), D, c.n_dec_heads);
        struct ggml_tensor * v  = ss2_heads(ctx, ss2_linear(ctx, ly->ca_v_w, ly->ca_v_b, mem), D, c.n_dec_heads);
        ggml_build_forward_expand(gf, ggml_cpy(ctx, k, d->mem_k[l]));
        ggml_build_forward_expand(gf, ggml_cpy(ctx, v, d->mem_v[l]));
    }
    if (!ggml_backend_sched_alloc_graph(m->sched, gf)) {
        fprintf(stderr, "[SheetSage] FATAL: memory projection alloc failed\n");
        return false;
    }
    ggml_backend_tensor_set(mem, memory.data(), 0, memory.size() * sizeof(float));
    ggml_backend_sched_graph_compute(m->sched, gf);
    d->pos = 0;
    return true;
}

// One decoder step: token at position d->pos -> logits [vocab]. The keys
// and values of the token land in the cache before the attention reads it.
static bool ss2_decode_step(SheetSage2 * m, SS2Decoder * d, int token, float * logits) {
    const SS2Config & c   = m->cfg;
    int               D   = c.d_model / c.n_dec_heads;
    int               H   = c.n_dec_heads;
    int               n   = d->pos + 1;  // cache rows the step attends to
    float             scl = 1.0f / sqrtf((float) D);
    if (n > c.max_out) {
        fprintf(stderr, "[SheetSage] FATAL: decoder position %d exceeds %d\n", d->pos, c.max_out);
        return false;
    }
    ggml_backend_sched_reset(m->sched);
    struct ggml_context * ctx = graph_arena_begin(&m->arena);
    struct ggml_cgraph *  gf  = ggml_new_graph_custom(ctx, SS2_GRAPH_NODES, false);

    struct ggml_tensor * in_tok = ggml_new_tensor_1d(ctx, GGML_TYPE_I32, 1);
    ggml_set_name(in_tok, "token");
    ggml_set_input(in_tok);
    struct ggml_tensor * in_pos = ggml_new_tensor_1d(ctx, GGML_TYPE_I32, 1);
    ggml_set_name(in_pos, "position");
    ggml_set_input(in_pos);
    struct ggml_tensor * in_row = ggml_new_tensor_1d(ctx, GGML_TYPE_I64, 1);
    ggml_set_name(in_row, "row");
    ggml_set_input(in_row);

    // Token embedding plus the learned position, offset by two like BART
    struct ggml_tensor * h =
        ggml_add(ctx, ggml_get_rows(ctx, m->embed, in_tok), ggml_get_rows(ctx, m->positions, in_pos));
    h = ss2_layer_norm(ctx, h, m->emb_ln_w, m->emb_ln_b, 1e-5f);

    for (int l = 0; l < c.n_dec; l++) {
        const SS2DecLayer *  ly = &m->dec[l];
        // Self attention over the cache, the new row written first
        struct ggml_tensor * q  = ggml_scale(ctx, ss2_linear(ctx, ly->sa_q_w, ly->sa_q_b, h), scl);
        struct ggml_tensor * k  = ss2_linear(ctx, ly->sa_k_w, ly->sa_k_b, h);
        struct ggml_tensor * v  = ss2_linear(ctx, ly->sa_v_w, ly->sa_v_b, h);
        q                       = ss2_heads(ctx, q, D, H);  // [D, 1, H]
        ggml_build_forward_expand(gf, ggml_set_rows(ctx, d->self_k[l], ss2_heads(ctx, k, D, H), in_row));
        ggml_build_forward_expand(gf, ggml_set_rows(ctx, d->self_v[l], ss2_heads(ctx, v, D, H), in_row));
        struct ggml_tensor * ck = ggml_view_3d(ctx, d->self_k[l], D, n, H, d->self_k[l]->nb[1], d->self_k[l]->nb[2], 0);
        struct ggml_tensor * cv = ggml_view_3d(ctx, d->self_v[l], D, n, H, d->self_v[l]->nb[1], d->self_v[l]->nb[2], 0);
        struct ggml_tensor * scores = ggml_soft_max(ctx, ggml_mul_mat(ctx, ck, q));  // [n, 1, H]
        struct ggml_tensor * vt     = ggml_cont(ctx, ggml_transpose(ctx, cv));       // [n, D, H]
        struct ggml_tensor * att    = ggml_mul_mat(ctx, vt, scores);                 // [D, 1, H]
        att = ggml_reshape_2d(ctx, ggml_cont(ctx, ggml_permute(ctx, att, 0, 2, 1, 3)), c.d_model, 1);
        h   = ss2_layer_norm(ctx, ggml_add(ctx, h, ss2_linear(ctx, ly->sa_o_w, ly->sa_o_b, att)), ly->sa_ln_w,
                             ly->sa_ln_b, 1e-5f);

        // Cross attention over the memory
        q                       = ggml_scale(ctx, ss2_linear(ctx, ly->ca_q_w, ly->ca_q_b, h), scl);
        q                       = ss2_heads(ctx, q, D, H);
        struct ggml_tensor * mk = d->mem_k[l];
        struct ggml_tensor * mv = d->mem_v[l];
        scores                  = ggml_soft_max(ctx, ggml_mul_mat(ctx, mk, q));  // [T, 1, H]
        vt                      = ggml_cont(ctx, ggml_transpose(ctx, mv));       // [T, D, H] f16
        att                     = ggml_mul_mat(ctx, vt, scores);
        att = ggml_reshape_2d(ctx, ggml_cont(ctx, ggml_permute(ctx, att, 0, 2, 1, 3)), c.d_model, 1);
        h   = ss2_layer_norm(ctx, ggml_add(ctx, h, ss2_linear(ctx, ly->ca_o_w, ly->ca_o_b, att)), ly->ca_ln_w,
                             ly->ca_ln_b, 1e-5f);

        struct ggml_tensor * ff = ggml_gelu_erf(ctx, ss2_linear(ctx, ly->fc1_w, ly->fc1_b, h));
        ff                      = ss2_linear(ctx, ly->fc2_w, ly->fc2_b, ff);
        h                       = ss2_layer_norm(ctx, ggml_add(ctx, h, ff), ly->final_ln_w, ly->final_ln_b, 1e-5f);
    }
    struct ggml_tensor * lgt = ggml_mul_mat(ctx, m->embed, h);  // [vocab, 1]
    ggml_set_name(lgt, "logits");
    ggml_set_output(lgt);
    ggml_build_forward_expand(gf, lgt);

    if (!ggml_backend_sched_alloc_graph(m->sched, gf)) {
        fprintf(stderr, "[SheetSage] FATAL: decoder graph alloc failed\n");
        return false;
    }
    int32_t tok = token;
    int32_t pos = d->pos + 2;
    int64_t row = d->pos;
    ggml_backend_tensor_set(in_tok, &tok, 0, sizeof(tok));
    ggml_backend_tensor_set(in_pos, &pos, 0, sizeof(pos));
    ggml_backend_tensor_set(in_row, &row, 0, sizeof(row));
    ggml_backend_sched_graph_compute(m->sched, gf);
    ggml_backend_tensor_get(lgt, logits, 0, (size_t) c.vocab * sizeof(float));
    d->pos++;
    return true;
}

// The grammar of the event stream, the state machine the reference decodes
// under: an event opens with subbeat shifts, then its fields in a fixed
// order, a meter wants its eighth position, a pitch wants its duration or
// another pitch, and the stream may end once an event has a payload.
enum SS2Kind {
    SS2_KIND_SPECIAL,
    SS2_KIND_PROMPT,
    SS2_KIND_SHIFT,
    SS2_KIND_TIME,
    SS2_KIND_METER,
    SS2_KIND_EIGHTH,
    SS2_KIND_STRUCTURE,
    SS2_KIND_KEY,
    SS2_KIND_MAJMIN,
    SS2_KIND_CHORD,
    SS2_KIND_PITCH,
    SS2_KIND_DURATION,
};

static SS2Kind ss2_kind(const SS2Tokenizer & t, int token) {
    if (token >= t.prompt0 && token < t.prompt1) {
        return SS2_KIND_PROMPT;
    }
    if (token >= t.shift0 && token < t.shift1) {
        return SS2_KIND_SHIFT;
    }
    if (token >= t.time0 && token < t.time1) {
        return SS2_KIND_TIME;
    }
    if (token >= t.meter0 && token < t.meter1) {
        return SS2_KIND_METER;
    }
    if (token >= t.eighth0 && token < t.eighth1) {
        return SS2_KIND_EIGHTH;
    }
    if (token >= t.structure0 && token < t.structure1) {
        return SS2_KIND_STRUCTURE;
    }
    if (token >= t.key0 && token < t.key1) {
        return SS2_KIND_KEY;
    }
    if (token >= t.majmin0 && token < t.majmin1) {
        return SS2_KIND_MAJMIN;
    }
    if (token >= t.chord0 && token < t.chord1) {
        return SS2_KIND_CHORD;
    }
    if (token >= t.pitch0 && token < t.pitch1) {
        return SS2_KIND_PITCH;
    }
    if (token >= t.duration0 && token < t.duration1) {
        return SS2_KIND_DURATION;
    }
    return SS2_KIND_SPECIAL;
}

// Field order of an event, the index a field must exceed to follow
enum SS2Field {
    SS2_FIELD_NONE = -1,
    SS2_FIELD_TIMESTAMP,
    SS2_FIELD_RHYTHM,
    SS2_FIELD_STRUCTURE,
    SS2_FIELD_KEY,
    SS2_FIELD_CHORD,
    SS2_FIELD_MELODY
};

struct SS2Grammar {
    bool in_shift      = true;
    int  shift_run     = 0;
    int  payload_count = 0;
    int  last_field    = SS2_FIELD_NONE;

    enum { NONE, RHYTHM_AFTER_METER, MELODY_AFTER_PITCH } incomplete = NONE;
};

static void ss2_allow(std::vector<char> & allowed, int start, int end) {
    for (int i = start; i < end; i++) {
        allowed[i] = 1;
    }
}

// The tokens the next step may draw
static void ss2_grammar_allowed(const SS2Tokenizer & t, const SS2Grammar & g, std::vector<char> & allowed) {
    std::fill(allowed.begin(), allowed.end(), 0);
    if (g.payload_count > 0) {
        allowed[t.eos] = 1;
    }
    if ((g.payload_count > 0 || g.in_shift) && g.shift_run < 4) {
        ss2_allow(allowed, t.shift0, t.shift1);
    }
    if (g.incomplete == SS2Grammar::RHYTHM_AFTER_METER) {
        ss2_allow(allowed, t.eighth0, t.eighth1);
        return;
    }
    if (g.incomplete == SS2Grammar::MELODY_AFTER_PITCH) {
        ss2_allow(allowed, t.duration0, t.duration1);
        ss2_allow(allowed, t.pitch0, t.pitch1);
        return;
    }
    if (g.last_field < SS2_FIELD_TIMESTAMP) {
        ss2_allow(allowed, t.time0, t.time1);
    }
    if (g.last_field < SS2_FIELD_RHYTHM) {
        ss2_allow(allowed, t.meter0, t.meter1);
        ss2_allow(allowed, t.eighth0, t.eighth1);
    }
    if (g.last_field < SS2_FIELD_STRUCTURE) {
        ss2_allow(allowed, t.structure0, t.structure1);
    }
    if (g.last_field < SS2_FIELD_KEY) {
        ss2_allow(allowed, t.key0, t.key1);
    }
    if (g.last_field < SS2_FIELD_CHORD) {
        ss2_allow(allowed, t.chord0, t.chord1);
    }
    if (g.last_field <= SS2_FIELD_MELODY) {
        ss2_allow(allowed, t.pitch0, t.pitch1);
    }
}

// Feed a drawn token, true when the stream ends
static bool ss2_grammar_update(const SS2Tokenizer & t, SS2Grammar & g, int token) {
    if (token == t.eos) {
        return true;
    }
    SS2Kind kind = ss2_kind(t, token);
    if (kind == SS2_KIND_SHIFT) {
        if (!g.in_shift && g.payload_count > 0) {
            g.payload_count = 0;
            g.last_field    = SS2_FIELD_NONE;
            g.incomplete    = SS2Grammar::NONE;
        }
        g.in_shift = true;
        g.shift_run++;
        return false;
    }
    g.in_shift  = false;
    g.shift_run = 0;
    g.payload_count++;
    g.incomplete = SS2Grammar::NONE;
    switch (kind) {
        case SS2_KIND_TIME:
            g.last_field = SS2_FIELD_TIMESTAMP;
            break;
        case SS2_KIND_METER:
            g.last_field = SS2_FIELD_RHYTHM;
            g.incomplete = SS2Grammar::RHYTHM_AFTER_METER;
            break;
        case SS2_KIND_EIGHTH:
            g.last_field = SS2_FIELD_RHYTHM;
            break;
        case SS2_KIND_STRUCTURE:
            g.last_field = SS2_FIELD_STRUCTURE;
            break;
        case SS2_KIND_KEY:
            g.last_field = SS2_FIELD_KEY;
            break;
        case SS2_KIND_CHORD:
            g.last_field = SS2_FIELD_CHORD;
            break;
        case SS2_KIND_PITCH:
            g.last_field = SS2_FIELD_MELODY;
            g.incomplete = SS2Grammar::MELODY_AFTER_PITCH;
            break;
        case SS2_KIND_DURATION:
            g.last_field = SS2_FIELD_MELODY;
            break;
        default:
            fprintf(stderr, "[SheetSage] FATAL: unexpected token %d in the event stream\n", token);
            exit(1);
    }
    return false;
}

// Greedy generation of one window: the prefix (sos, the task prompts, out,
// and the re-encoded events of the overlap on a later window) is fed, the
// grammar advanced through its events, then every step draws the best
// allowed token until the stream ends, a timestamp reaches stop_time, or
// the budget runs out. The sequence always ends with eos.
static bool ss2_generate(SheetSage2 *             m,
                         SS2Decoder *             d,
                         const std::vector<int> & prefix,
                         double                   stop_time,
                         std::vector<int> *       tokens,
                         const DebugDumper *      dbg) {
    const SS2Config &    c = m->cfg;
    const SS2Tokenizer & t = m->tok;
    Timer                timer;
    std::vector<float>   logits((size_t) c.vocab);
    std::vector<char>    allowed((size_t) c.vocab);
    *tokens = prefix;
    for (size_t i = 0; i + 1 < prefix.size(); i++) {
        if (!ss2_decode_step(m, d, prefix[i], logits.data())) {
            return false;
        }
    }
    SS2Grammar g;
    size_t     out_index = 0;
    while (out_index < prefix.size() && prefix[out_index] != t.out) {
        out_index++;
    }
    for (size_t i = out_index + 1; i < prefix.size(); i++) {
        ss2_grammar_update(t, g, prefix[i]);
    }
    int token = prefix.back();
    for (int step = 0; (int) tokens->size() < c.max_out; step++) {
        if (!ss2_decode_step(m, d, token, logits.data())) {
            return false;
        }
        if (dbg->enabled && step < 4) {
            char name[32];
            snprintf(name, sizeof(name), "logits_%d", step);
            debug_dump_1d(dbg, name, logits.data(), c.vocab);
        }
        ss2_grammar_allowed(t, g, allowed);
        int   best  = -1;
        float score = -INFINITY;
        for (int i = 0; i < c.vocab; i++) {
            if (allowed[i] && logits[i] > score) {
                score = logits[i];
                best  = i;
            }
        }
        token = best;
        tokens->push_back(token);
        if (ss2_grammar_update(t, g, token)) {
            break;
        }
        if (stop_time >= 0 && ss2_kind(t, token) == SS2_KIND_TIME &&
            (double) (token - t.time0) / c.time_hz >= stop_time) {
            tokens->push_back(t.eos);
            break;
        }
        if ((step % 100) == 0) {
            fprintf(stderr, "[SheetSage] Decoding %d/%d\n", step, c.max_out);
        }
    }
    if (tokens->back() != t.eos) {
        tokens->push_back(t.eos);
    }
    fprintf(stderr, "[SheetSage] Decoded: %zu tokens, %.1f s (%.1f ms/token)\n", tokens->size(), timer.ms() / 1000.0,
            timer.ms() / (double) tokens->size());
    return true;
}

// The token stream of a window becomes timed events: subbeat shifts
// accumulate the step, the fields of an event follow in the order the
// grammar imposes, the timestamps anchor a step to seconds map that places
// every event and every note end, then the events are offset by the window
// start and clipped to the song like the reference stitching does.
enum SS2FieldIndex { SS2_F_TIMESTAMP, SS2_F_RHYTHM, SS2_F_STRUCTURE, SS2_F_KEY, SS2_F_CHORD, SS2_F_MELODY };

static bool ss2_decode_events(const SS2Config &        c,
                              const SS2Tokenizer &     t,
                              const std::vector<int> & tokens,
                              double                   window_start,
                              double                   accept_start,
                              double                   accept_end,
                              double                   song_duration,
                              int                      base_subbeat,
                              std::vector<NotEvent> *  events) {
    events->clear();
    size_t out_index = 0;
    for (size_t i = 1; i < tokens.size(); i++) {
        if (tokens[i] == t.out) {
            out_index = i;
            break;
        }
    }
    if (tokens.empty() || tokens[0] != t.sos || out_index == 0) {
        fprintf(stderr, "[SheetSage] FATAL: token stream without prefix\n");
        return false;
    }
    std::vector<double> anchor_steps, anchor_times;
    size_t              position = out_index + 1;
    int                 step     = 0;
    while (position < tokens.size() && tokens[position] != t.eos) {
        while (position < tokens.size() && ss2_kind(t, tokens[position]) == SS2_KIND_SHIFT) {
            step += tokens[position] - t.shift0;
            position++;
        }
        NotEvent e;
        e.subbeat      = step;
        double stamp   = 0.0;
        bool   payload = false;
        while (position < tokens.size()) {
            int     token = tokens[position];
            SS2Kind kind  = ss2_kind(t, token);
            if (kind == SS2_KIND_SHIFT || token == t.eos) {
                break;
            }
            payload = true;
            switch (kind) {
                case SS2_KIND_TIME:
                    e.has_timestamp = true;
                    stamp           = (double) (token - t.time0) / c.time_hz;
                    e.field_tokens[SS2_F_TIMESTAMP].push_back(token);
                    break;
                case SS2_KIND_METER:
                    e.has_meter = true;
                    e.meter_num = t.meter_num[(size_t) (token - t.meter0)];
                    e.meter_den = t.meter_den[(size_t) (token - t.meter0)];
                    e.field_tokens[SS2_F_RHYTHM].push_back(token);
                    break;
                case SS2_KIND_EIGHTH:
                    e.eighth = token - t.eighth0;
                    e.field_tokens[SS2_F_RHYTHM].push_back(token);
                    break;
                case SS2_KIND_STRUCTURE:
                    e.structure = t.structures[(size_t) (token - t.structure0)];
                    e.field_tokens[SS2_F_STRUCTURE].push_back(token);
                    break;
                case SS2_KIND_KEY:
                    e.key = t.keys[(size_t) (token - t.key0)];
                    e.field_tokens[SS2_F_KEY].push_back(token);
                    break;
                case SS2_KIND_MAJMIN:
                    e.chord = t.majmin_chords[(size_t) (token - t.majmin0)];
                    e.field_tokens[SS2_F_CHORD].push_back(token);
                    break;
                case SS2_KIND_CHORD:
                    e.chord = t.chords[(size_t) (token - t.chord0)];
                    e.field_tokens[SS2_F_CHORD].push_back(token);
                    break;
                case SS2_KIND_PITCH:
                    {
                        int pitch_id = token - t.pitch0;
                        int bin      = 0;
                        e.field_tokens[SS2_F_MELODY].push_back(token);
                        if (position + 1 < tokens.size() && ss2_kind(t, tokens[position + 1]) == SS2_KIND_DURATION) {
                            bin = tokens[position + 1] - t.duration0;
                            e.field_tokens[SS2_F_MELODY].push_back(tokens[position + 1]);
                            position++;
                        }
                        e.melody.push_back(
                            { pitch_id % 128, pitch_id >= 128, t.duration_templates[(size_t) bin], 0.0 });
                        break;
                    }
                default:
                    fprintf(stderr, "[SheetSage] FATAL: token %d has no field\n", token);
                    return false;
            }
            position++;
        }
        if (!payload) {
            continue;
        }
        if (e.has_timestamp) {
            // A later timestamp at the same step replaces the earlier one
            if (!anchor_steps.empty() && anchor_steps.back() == step) {
                anchor_times.back() = stamp;
            } else {
                anchor_steps.push_back(step);
                anchor_times.push_back(stamp);
            }
        }
        events->push_back(e);
    }

    // Steps to seconds: linear between anchors, the median step length
    // beyond them, an eighth of a second per step without any
    double step_seconds = 0.125;
    if (anchor_steps.size() >= 2) {
        std::vector<double> rates;
        for (size_t i = 0; i + 1 < anchor_steps.size(); i++) {
            rates.push_back((anchor_times[i + 1] - anchor_times[i]) /
                            std::max(anchor_steps[i + 1] - anchor_steps[i], 1.0));
        }
        double median = not_median(rates);
        if (std::isfinite(median) && median > 0) {
            step_seconds = median;
        }
    }
    double window_length = c.window_seconds;
    auto   lookup        = [&](double s) {
        if (anchor_steps.empty()) {
            return std::min(window_length, std::max(0.0, s * 0.125));
        }
        if (s <= anchor_steps.front()) {
            return std::min(window_length,
                                     std::max(0.0, anchor_times.front() + (s - anchor_steps.front()) * step_seconds));
        }
        if (s >= anchor_steps.back()) {
            return std::min(window_length,
                                     std::max(0.0, anchor_times.back() + (s - anchor_steps.back()) * step_seconds));
        }
        size_t hi = 1;
        while (anchor_steps[hi] < s) {
            hi++;
        }
        double a = anchor_steps[hi - 1], b = anchor_steps[hi];
        return anchor_times[hi - 1] + (anchor_times[hi] - anchor_times[hi - 1]) * (s - a) / (b - a);
    };
    std::vector<NotEvent> accepted;
    for (NotEvent & e : *events) {
        double abs_time = window_start + lookup(e.subbeat);
        if (abs_time < accept_start - 1e-4 || abs_time >= accept_end - 1e-4 || abs_time >= song_duration - 1e-4) {
            continue;
        }
        e.time           = std::min(song_duration, std::max(0.0, abs_time));
        e.global_subbeat = base_subbeat + e.subbeat;
        for (NotNote & n : e.melody) {
            double end = window_start + lookup(e.subbeat + n.duration_steps);
            n.end_time = std::min(song_duration, std::max(e.time + 0.04, end));
        }
        accepted.push_back(e);
    }
    *events = accepted;
    return true;
}

// The prefix of a later window: the stitched events between the window
// start and the accepted end, re-encoded with local timestamps and steps,
// the first one completed with the structure, key, chord and meter in force
// before it, so the decoder continues a stream it has already seen.
static std::vector<int> ss2_overlap_prefix(const SS2Tokenizer &          t,
                                           const std::vector<int> &      task_prefix,
                                           const std::vector<NotEvent> & stitched,
                                           double                        window_start,
                                           double                        prefix_end,
                                           int *                         base_subbeat) {
    std::vector<const NotEvent *> source;
    for (const NotEvent & e : stitched) {
        if (e.time >= window_start - 1e-4 && e.time < prefix_end - 1e-4) {
            source.push_back(&e);
        }
    }
    std::stable_sort(source.begin(), source.end(), [](const NotEvent * a, const NotEvent * b) {
        return std::tie(a->global_subbeat, a->time) < std::tie(b->global_subbeat, b->time);
    });
    size_t first = 0;
    while (first < source.size() && !source[first]->has_timestamp &&
           source[first]->field_tokens[SS2_F_RHYTHM].empty()) {
        first++;
    }
    if (first == source.size()) {
        return {};
    }
    source.erase(source.begin(), source.begin() + (long) first);
    *base_subbeat = source[0]->global_subbeat;

    // The context in force before the first prefix event
    std::vector<int> context[6];
    for (const NotEvent & e : stitched) {
        if (e.time > source[0]->time + 1e-6) {
            continue;
        }
        for (int f : { SS2_F_STRUCTURE, SS2_F_KEY, SS2_F_CHORD }) {
            if (!e.field_tokens[f].empty()) {
                context[f] = e.field_tokens[f];
            }
        }
        for (int token : e.field_tokens[SS2_F_RHYTHM]) {
            if (ss2_kind(t, token) == SS2_KIND_METER) {
                context[SS2_F_RHYTHM] = { token };
                break;
            }
        }
    }

    std::vector<int> out      = task_prefix;
    int              previous = 0;
    for (size_t i = 0; i < source.size(); i++) {
        const NotEvent & e     = *source[i];
        int              step  = std::max(0, e.global_subbeat - *base_subbeat);
        int              shift = step - previous;
        previous               = step;
        while (shift > t.shift1 - t.shift0 - 1) {
            out.push_back(t.shift1 - 1);
            shift -= t.shift1 - t.shift0 - 1;
        }
        out.push_back(t.shift0 + shift);
        std::vector<int> fields[6];
        for (int f = 0; f < 6; f++) {
            fields[f] = e.field_tokens[f];
        }
        if (!fields[SS2_F_TIMESTAMP].empty()) {
            int time_id             = (int) lround((e.time - window_start) * (t.time1 - t.time0) / 300.0);
            time_id                 = std::max(0, std::min(time_id, t.time1 - t.time0 - 1));
            fields[SS2_F_TIMESTAMP] = { t.time0 + time_id };
        }
        if (i == 0) {
            for (int f : { SS2_F_STRUCTURE, SS2_F_KEY, SS2_F_CHORD }) {
                if (fields[f].empty() && !context[f].empty()) {
                    fields[f] = context[f];
                }
            }
            bool has_meter = false, has_eighth = false;
            for (int token : fields[SS2_F_RHYTHM]) {
                has_meter  = has_meter || ss2_kind(t, token) == SS2_KIND_METER;
                has_eighth = has_eighth || ss2_kind(t, token) == SS2_KIND_EIGHTH;
            }
            if (has_eighth && !has_meter && !context[SS2_F_RHYTHM].empty()) {
                fields[SS2_F_RHYTHM].insert(fields[SS2_F_RHYTHM].begin(), context[SS2_F_RHYTHM][0]);
            }
        }
        for (int f = 0; f < 6; f++) {
            out.insert(out.end(), fields[f].begin(), fields[f].end());
        }
    }
    return out;
}

// Transcribe a whole song: 24 kHz mono samples -> ABC. Windows of the model
// length with the overlap and lookahead of the reference, each window
// prefixed with the events of the overlap, the accepted events stitched in
// time order, then the notation. melody_only drops the chords.
static bool ss2_transcribe(SheetSage2 *        m,
                           const float *       audio,
                           int                 n_samples,
                           bool                melody_only,
                           std::string *       abc,
                           std::string *       error,
                           const DebugDumper * dbg) {
    const SS2Config & c         = m->cfg;
    const double      length    = c.window_seconds;
    const double      overlap   = 200.0;
    const double      lookahead = 100.0;
    const double      duration  = (double) n_samples / SS2_SAMPLE_RATE;
    const int         window    = (int) lround(length * SS2_SAMPLE_RATE);
    if (n_samples < 1025) {
        return not_fail(error, "Audio must contain at least 1025 samples at 24 kHz");
    }
    Timer total;

    std::vector<int> task_prefix = { m->tok.sos };
    for (const char * name : { "timestamp", "downbeat_meter", "structure", "key", "chord_full", "melody_full" }) {
        for (size_t i = 0; i < m->tok.prompts.size(); i++) {
            if (m->tok.prompts[i] == name) {
                task_prefix.push_back(m->tok.prompt0 + (int) i);
            }
        }
    }
    task_prefix.push_back(m->tok.out);

    std::vector<NotEvent> stitched;
    double                start = 0.0, accepted = 0.0;
    for (int index = 0;; index++) {
        bool   last       = start + length >= duration - 1e-6;
        double accept_end = last ? duration : start + length - lookahead;
        double stop_time  = last ? std::min(duration - start, length) : length - lookahead;
        fprintf(stderr, "[SheetSage] Window %d: %.1f s to %.1f s, accepting to %.1f s\n", index, start,
                std::min(duration, start + length), accept_end);

        // The segment padded with silence to the window
        std::vector<float> segment((size_t) window, 0.0f);
        int                offset = (int) lround(start * SS2_SAMPLE_RATE);
        int                avail  = std::min(window, n_samples - offset);
        memcpy(segment.data(), audio + offset, (size_t) avail * sizeof(float));

        std::vector<float> mel;
        int                T_mel = 0;
        ss2_mel(m, segment.data(), window, &mel, &T_mel);
        SS2Encoded enc;
        if (!ss2_encode(m, mel, T_mel, &enc, dbg)) {
            return false;
        }
        SS2Decoder dec;
        if (!ss2_decoder_alloc(m, &dec, enc.T) || !ss2_decoder_prepare(m, &dec, enc.memory)) {
            return false;
        }
        std::vector<int> prefix = task_prefix;
        int              base   = 0;
        if (index > 0) {
            std::vector<int> overlap_prefix = ss2_overlap_prefix(m->tok, task_prefix, stitched, start, accepted, &base);
            if (!overlap_prefix.empty()) {
                if ((int) overlap_prefix.size() >= c.max_out - 128) {
                    ss2_decoder_free(&dec);
                    return not_fail(error, "Overlap prefix fills the context");
                }
                prefix = overlap_prefix;
            } else {
                base = 0;
            }
        }
        std::vector<int> tokens;
        bool             ok = ss2_generate(m, &dec, prefix, stop_time, &tokens, dbg);
        ss2_decoder_free(&dec);
        if (!ok) {
            return false;
        }
        if (dbg->enabled) {
            std::vector<float> ids(tokens.begin(), tokens.end());
            char               name[32];
            snprintf(name, sizeof(name), "tokens_%d", index);
            debug_dump_1d(dbg, name, ids.data(), (int) ids.size());
        }
        std::vector<NotEvent> events;
        if (!ss2_decode_events(c, m->tok, tokens, start, accepted, accept_end, duration, base, &events)) {
            return false;
        }
        stitched.insert(stitched.end(), events.begin(), events.end());
        std::stable_sort(stitched.begin(), stitched.end(), [](const NotEvent & a, const NotEvent & b) {
            return std::tie(a.time, a.global_subbeat) < std::tie(b.time, b.global_subbeat);
        });
        if (last) {
            break;
        }
        accepted = accept_end;
        start    = std::min(start + (length - overlap), duration - length);
    }
    bool ok = notation_abc(stitched, duration, m->tok.tables, melody_only, abc, error);
    fprintf(stderr, "[SheetSage] Transcribed: %.1f s of audio, %zu events, %.1f s%s\n", duration, stitched.size(),
            total.ms() / 1000.0, ok ? "" : ", no score");
    return ok;
}

// Decoded planar stereo to the 24 kHz mono waveform the model reads: the
// channels averaged, the rate converted
static bool ss2_mono_24k(float * planar, int T, int sr, std::vector<float> * out) {
    std::vector<float> mono((size_t) T);
    for (int i = 0; i < T; i++) {
        mono[(size_t) i] = 0.5f * (planar[i] + planar[T + i]);
    }
    free(planar);
    if (sr == SS2_SAMPLE_RATE) {
        *out = mono;
        return true;
    }
    int     n_out     = 0;
    float * resampled = audio_resample(mono.data(), T, sr, SS2_SAMPLE_RATE, 1, &n_out);
    if (!resampled) {
        return false;
    }
    out->assign(resampled, resampled + n_out);
    free(resampled);
    return true;
}
