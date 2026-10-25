#pragma once
// adapter.h: LoRA adapters merged into the backbone weights at load
//
// An adapter is a .safetensors file, or a folder holding one next to an
// optional adapter_config.json. A request stacks any number of them, each
// with its own strength, and each applies to the halves its keys name: the
// AR (self_attn, mlp) or the NAR (nar_self_attn, nar_mlp, vae2llm, llm2vae).
//
// The keys of every published trainer normalize to the GGUF names:
//   native       layers.N.nar_mlp.up_proj.lora_A
//                model.layers.N.self_attn.q_proj.lora_down.weight
//   ComfyUI      text_encoders.model.layers.N.self_attn.qkv_proj.lora_up.weight   (AR)
//   AI Toolkit   diffusion_model.model.layers.N.mlp.gate_up_proj.lora_A.weight    (NAR)
//                diffusion_model.llm2vae.diff, diffusion_model.llm2vae.diff_b
//   sliders      adapters.model-layers-N-self_attn-k_proj.lora_down.weight
//   companions   companion.layers.N.nar_self_attn.q_proj.lora_A, io.vae2llm.weight
// Under diffusion_model the NAR projections carry the AR module names. The
// fused qkv_proj and gate_up_proj split back onto q | k | v and gate | up by
// rows of B: (B @ A)[r0:r1] = B[r0:r1] @ A, exact for a shared A and for a
// block diagonal fusion alike.
//
// Terms on one tensor W, s the strength of the adapter:
//   LoRA   W += s * alpha / rank * B @ A   alpha from the module .alpha, then
//                                          adapter_config.json, then the
//                                          __metadata__, else the rank
//   diff   W += s * D
//   full   W += s * (F - W)                vae2llm and llm2vae replacements
//
// A key that names nothing of the backbone refuses the whole adapter: a LoKr
// factor, a DoRA magnitude or an extra conditioning branch would otherwise
// merge into a partial, plausible and wrong model.
//
// The merge engine, adapter_apply, takes terms from any source: the request
// adapters here, the LoRA factors a transcriber head carries for MERT. It
// runs between the GGUF loads of a model and its wctx_alloc, on the staged
// PendingCopy of each tensor, so the QKV and gate/up fusions concatenate
// adapted rows. Per tensor: the base dequantized on the host, every term
// summed in one backend graph, the sum quantized back to the GGUF type on
// the host, rows split across threads.

#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml.h"
#include "gguf-weights.h"
#include "safetensors.h"
#include "timer.h"
#include "weight-ctx.h"

#include <sys/stat.h>

#include <algorithm>
#include <map>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#ifdef _WIN32
#    include <io.h>
#else
#    include <dirent.h>
#endif

enum {
    ADAPTER_AR  = 1,
    ADAPTER_NAR = 2,
};

// One adapter of a request, resolved to its file
struct AdapterUse {
    std::string path;
    float       scale;

    bool operator==(const AdapterUse & o) const { return path == o.path && scale == o.scale; }
};

// One adapter of the directory: its name in requests, its file, the halves it changes
struct AdapterEntry {
    std::string name;
    std::string path;
    int         halves;
};

enum AdapterRole {
    ROLE_A,
    ROLE_B,
    ROLE_ALPHA,
    ROLE_DIFF,
    ROLE_FULL,
};

struct AdapterKey {
    std::string module;  // "model.layers.3.nar_self_attn.qkv_proj", "vae2llm"
    AdapterRole role;
    bool        bias;    // targets module.bias
    int         half;
};

static bool adapter_strip(std::string * s, const char * prefix) {
    size_t n = strlen(prefix);
    if (s->compare(0, n, prefix) != 0) {
        return false;
    }
    s->erase(0, n);
    return true;
}

static bool adapter_cut(std::string * s, const char * suffix) {
    size_t n = strlen(suffix);
    if (s->size() <= n || s->compare(s->size() - n, n, suffix) != 0) {
        return false;
    }
    s->resize(s->size() - n);
    return true;
}

// Normalizes one safetensors key, false for a key outside the backbone
static bool adapter_parse_key(std::string key, AdapterKey * out) {
    static const struct {
        const char * suffix;
        AdapterRole  role;
        bool         bias;
    } roles[] = {
        { ".lora_A.weight",    ROLE_A,     false },
        { ".lora_B.weight",    ROLE_B,     false },
        { ".lora_down.weight", ROLE_A,     false },
        { ".lora_up.weight",   ROLE_B,     false },
        { ".lora_A",           ROLE_A,     false },
        { ".lora_B",           ROLE_B,     false },
        { ".alpha",            ROLE_ALPHA, false },
        { ".diff_b",           ROLE_DIFF,  true  },
        { ".diff",             ROLE_DIFF,  false },
        { ".weight",           ROLE_FULL,  false },
        { ".bias",             ROLE_FULL,  true  },
    };

    bool found = false;
    for (const auto & r : roles) {
        if (adapter_cut(&key, r.suffix)) {
            out->role = r.role;
            out->bias = r.bias;
            found     = true;
            break;
        }
    }
    if (!found) {
        return false;
    }

    // Containers, two of them naming the half
    int hint = 0;
    if (adapter_strip(&key, "text_encoders.")) {
        hint = ADAPTER_AR;
    } else if (adapter_strip(&key, "diffusion_model.")) {
        hint = ADAPTER_NAR;
    } else if (adapter_strip(&key, "adapters.")) {
        std::replace(key.begin(), key.end(), '-', '.');
    } else if (!adapter_strip(&key, "companion.")) {
        adapter_strip(&key, "io.");
    }

    if (key == "vae2llm" || key == "llm2vae") {
        out->module = key;
        out->half   = ADAPTER_NAR;
        return hint != ADAPTER_AR;
    }
    if (out->bias || out->role == ROLE_FULL || out->role == ROLE_DIFF) {
        return false;
    }

    if (key.compare(0, 7, "layers.") == 0) {
        key = "model." + key;
    }
    std::string tail = key;
    if (!adapter_strip(&tail, "model.layers.")) {
        return false;
    }
    size_t dot = tail.find('.');
    if (dot == 0 || dot == std::string::npos || tail.find_first_not_of("0123456789") != dot) {
        return false;
    }
    std::string site = tail.substr(dot + 1);
    bool        nar  = adapter_strip(&site, "nar_");
    if (nar && hint == ADAPTER_AR) {
        return false;
    }
    nar = nar || hint == ADAPTER_NAR;

    static const char * sites[] = {
        "self_attn.q_proj", "self_attn.k_proj", "self_attn.v_proj",   "self_attn.o_proj", "mlp.gate_proj",
        "mlp.up_proj",      "mlp.down_proj",    "self_attn.qkv_proj", "mlp.gate_up_proj",
    };
    if (std::find_if(std::begin(sites), std::end(sites), [&](const char * s) { return site == s; }) ==
        std::end(sites)) {
        return false;
    }
    out->module = "model.layers." + tail.substr(0, dot) + "." + (nar ? "nar_" : "") + site;
    out->half   = nar ? ADAPTER_NAR : ADAPTER_AR;
    return true;
}

// Halves an adapter changes, 0 with the reason when it cannot merge
static int adapter_inspect(const std::string & path, std::string * error) {
    STFile st;
    if (!st_open(&st, path.c_str())) {
        *error = "unreadable safetensors";
        return 0;
    }
    int halves = 0;
    for (const STEntry & e : st.entries) {
        AdapterKey k;
        if (!adapter_parse_key(e.name, &k)) {
            *error = "unsupported tensor " + e.name;
            halves = 0;
            break;
        }
        halves |= k.half;
    }
    st_close(&st);
    if (halves == 0 && error->empty()) {
        *error = "no tensor of the backbone";
    }
    return halves;
}

static bool adapter_is_dir(const std::string & path) {
    struct stat sb;
    return stat(path.c_str(), &sb) == 0 && (sb.st_mode & S_IFMT) == S_IFDIR;
}

// Names in a directory, sorted, dot entries excluded
static std::vector<std::string> adapter_list(const std::string & dir) {
    std::vector<std::string> names;
#ifdef _WIN32
    struct _finddata_t fd;
    intptr_t           h = _findfirst((dir + "\\*").c_str(), &fd);
    if (h != -1) {
        do {
            if (fd.name[0] != '.') {
                names.push_back(fd.name);
            }
        } while (_findnext(h, &fd) == 0);
        _findclose(h);
    }
#else
    if (DIR * d = opendir(dir.c_str())) {
        while (struct dirent * e = readdir(d)) {
            if (e->d_name[0] != '.') {
                names.push_back(e->d_name);
            }
        }
        closedir(d);
    }
#endif
    std::sort(names.begin(), names.end());
    return names;
}

static bool adapter_is_safetensors(const std::string & name) {
    std::string s = name;
    return adapter_cut(&s, ".safetensors");
}

// The adapters of a directory: its .safetensors files, and its folders
// holding one. Entries that cannot merge are logged and left out.
static std::vector<AdapterEntry> adapter_scan(const std::string & dir) {
    std::vector<AdapterEntry> out;
    for (const std::string & name : adapter_list(dir)) {
        std::string path = dir + "/" + name;
        if (adapter_is_dir(path)) {
            std::string file;
            for (const std::string & inner : adapter_list(path)) {
                if (adapter_is_safetensors(inner)) {
                    file = path + "/" + inner;
                    break;
                }
            }
            path = file;
        } else if (!adapter_is_safetensors(name)) {
            continue;
        }
        if (path.empty()) {
            continue;
        }
        std::string error;
        int         halves = adapter_inspect(path, &error);
        if (!halves) {
            fprintf(stderr, "[Adapter] Skip %s: %s\n", name.c_str(), error.c_str());
            continue;
        }
        fprintf(stderr, "[Adapter] %s:%s%s\n", name.c_str(), halves & ADAPTER_AR ? " AR" : "",
                halves & ADAPTER_NAR ? " NAR" : "");
        out.push_back({ name, path, halves });
    }
    return out;
}

static const AdapterEntry * adapter_find(const std::vector<AdapterEntry> & entries, const std::string & name) {
    for (const AdapterEntry & e : entries) {
        if (e.name == name) {
            return &e;
        }
    }
    return nullptr;
}

// Alpha of the whole file: adapter_config.json next to it, then the
// __metadata__, 0 when neither has one
static float adapter_file_alpha(const std::string & path, const STFile & st) {
    std::string config = path.substr(0, path.find_last_of("/\\") + 1) + "adapter_config.json";
    if (FILE * f = fopen(config.c_str(), "rb")) {
        std::string json;
        char        buf[4096];
        size_t      n;
        while ((n = fread(buf, 1, sizeof(buf), f)) > 0) {
            json.append(buf, n);
        }
        fclose(f);
        float alpha = st_json_number(json, "lora_alpha");
        if (alpha == 0.0f) {
            alpha = st_json_number(json, "alpha");
        }
        if (alpha != 0.0f) {
            return alpha;
        }
    }
    auto it = st.metadata.find("alpha");
    return it == st.metadata.end() ? 0.0f : strtof(it->second.c_str(), NULL);
}

static int64_t adapter_numel(const STEntry & e) {
    int64_t n = 1;
    for (int i = 0; i < e.n_dims; i++) {
        n *= e.shape[i];
    }
    return n;
}

// A tensor a term reads: its data, F32, F16 or BF16 rows of ne0 elements
struct AdapterTensor {
    const void *   data;
    enum ggml_type type;
    int64_t        ne0, ne1;
};

// One term on one GGUF tensor
struct AdapterTerm {
    AdapterRole   role;  // ROLE_A for a LoRA pair, ROLE_DIFF, ROLE_FULL
    AdapterTensor a;     // A [rank, in], or D, or F
    AdapterTensor b;     // B [out, rank], rows [row0, row0 + rows) land on the tensor
    int64_t       row0;
    float         scale;
};

// The terms of a merge, by GGUF tensor name
using AdapterTerms = std::map<std::string, std::vector<AdapterTerm>>;

// Elements [first, first + n) of a term tensor as F32
static void adapter_f32(const AdapterTensor & t, int64_t first, int64_t n, float * dst) {
    const uint8_t * src = (const uint8_t *) t.data + first * ggml_type_size(t.type);
    if (t.type == GGML_TYPE_F32) {
        memcpy(dst, src, (size_t) n * 4);
    } else {
        ggml_get_type_traits(t.type)->to_float(src, dst, n);
    }
}

// A safetensors tensor as a term tensor, false for a dtype a term cannot read
static bool adapter_st_tensor(const STFile & st, const STEntry & e, AdapterTensor * out) {
    enum ggml_type type = e.dtype == "F32"  ? GGML_TYPE_F32 :
                          e.dtype == "F16"  ? GGML_TYPE_F16 :
                          e.dtype == "BF16" ? GGML_TYPE_BF16 :
                                              GGML_TYPE_COUNT;
    if (type == GGML_TYPE_COUNT) {
        fprintf(stderr, "[Adapter] FATAL: %s has dtype %s\n", e.name.c_str(), e.dtype.c_str());
        return false;
    }
    int64_t ne0 = e.n_dims ? e.shape[e.n_dims - 1] : 1;
    *out        = { st_data(st, e), type, ne0, adapter_numel(e) / ne0 };
    return true;
}

// The module tensors of one adapter, by module and role
struct AdapterModule {
    const STEntry * a     = nullptr;
    const STEntry * b     = nullptr;
    const STEntry * alpha = nullptr;
    const STEntry * diff  = nullptr;
    const STEntry * full  = nullptr;
};

// Runs fn(r0, r1) over row ranges on every hardware thread
template <typename F> static void adapter_rows(int64_t nrows, F fn) {
    int64_t                  n     = std::min<int64_t>(std::max(1u, std::thread::hardware_concurrency()), nrows);
    int64_t                  chunk = (nrows + n - 1) / n;
    std::vector<std::thread> threads;
    for (int64_t r0 = 0; r0 < nrows; r0 += chunk) {
        threads.emplace_back(fn, r0, std::min(nrows, r0 + chunk));
    }
    for (auto & t : threads) {
        t.join();
    }
}

// Sums the terms into the staged copy of one GGUF tensor
static bool adapter_merge_tensor(WeightCtx *                      wctx,
                                 WeightCtx::PendingCopy *         pc,
                                 const struct ggml_tensor *       meta,
                                 const std::vector<AdapterTerm> & terms,
                                 ggml_backend_t                   backend) {
    const int64_t        ne0  = meta->ne[0];
    const int64_t        ne1  = ggml_nrows(meta);
    const enum ggml_type type = meta->type;
    const size_t         row  = ggml_row_size(type, ne0);

    std::vector<float> base((size_t) (ne0 * ne1));
    if (type == GGML_TYPE_F32) {
        memcpy(base.data(), pc->src, base.size() * 4);
    } else {
        const auto * traits = ggml_get_type_traits(type);
        adapter_rows(ne1, [&](int64_t r0, int64_t r1) {
            traits->to_float((const uint8_t *) pc->src + r0 * row, base.data() + r0 * ne0, (r1 - r0) * ne0);
        });
    }

    size_t                  n_inputs = 1 + 2 * terms.size();
    struct ggml_init_params params   = {
        (n_inputs + 4 * terms.size() + 2) * ggml_tensor_overhead() + ggml_graph_overhead(), NULL, true
    };
    struct ggml_context * ctx = ggml_init(params);
    struct ggml_tensor *  w   = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, ne0, ne1);
    struct ggml_tensor *  out = w;

    // Host data per input, uploaded once the context is allocated
    std::vector<std::pair<struct ggml_tensor *, std::vector<float>>> inputs;
    for (const AdapterTerm & t : terms) {
        if (t.role == ROLE_A) {
            const int64_t      rank = t.a.ne1;
            std::vector<float> a((size_t) (rank * ne0));
            std::vector<float> at(a.size());
            std::vector<float> b((size_t) (ne1 * rank));
            adapter_f32(t.a, 0, rank * ne0, a.data());
            adapter_f32(t.b, t.row0 * rank, ne1 * rank, b.data());
            for (int64_t r = 0; r < rank; r++) {
                for (int64_t i = 0; i < ne0; i++) {
                    at[i * rank + r] = a[r * ne0 + i];
                }
            }
            struct ggml_tensor * ta = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, rank, ne0);
            struct ggml_tensor * tb = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, rank, ne1);
            inputs.push_back({ ta, std::move(at) });
            inputs.push_back({ tb, std::move(b) });
            out = ggml_add(ctx, out, ggml_scale(ctx, ggml_mul_mat(ctx, ta, tb), t.scale));
        } else {
            std::vector<float> d((size_t) (ne0 * ne1));
            adapter_f32(t.a, 0, ne0 * ne1, d.data());
            struct ggml_tensor * td = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, ne0, ne1);
            inputs.push_back({ td, std::move(d) });
            struct ggml_tensor * delta = t.role == ROLE_DIFF ? td : ggml_sub(ctx, td, w);
            out                        = ggml_add(ctx, out, ggml_scale(ctx, delta, t.scale));
        }
    }

    struct ggml_cgraph * gf = ggml_new_graph(ctx);
    ggml_build_forward_expand(gf, out);
    ggml_backend_buffer_t buf = ggml_backend_alloc_ctx_tensors(ctx, backend);
    if (!buf) {
        fprintf(stderr, "[Adapter] FATAL: cannot allocate the merge graph\n");
        ggml_free(ctx);
        return false;
    }
    ggml_backend_tensor_set(w, base.data(), 0, base.size() * 4);
    for (auto & in : inputs) {
        ggml_backend_tensor_set(in.first, in.second.data(), 0, in.second.size() * 4);
    }
    ggml_backend_graph_compute(backend, gf);
    ggml_backend_tensor_get(out, base.data(), 0, base.size() * 4);
    ggml_backend_buffer_free(buf);
    ggml_free(ctx);

    wctx->staging.emplace_back(new float[(pc->nbytes + 3) / 4]);
    uint8_t * dst = (uint8_t *) wctx->staging.back().get();
    if (type == GGML_TYPE_F32) {
        memcpy(dst, base.data(), pc->nbytes);
    } else {
        ggml_quantize_init(type);
        adapter_rows(ne1, [&](int64_t r0, int64_t r1) {
            ggml_quantize_chunk(type, base.data(), dst, r0 * ne0, r1 - r0, ne0, NULL);
        });
    }
    pc->src = dst;
    return true;
}

// Sums every term into the staged copy of its GGUF tensor, between the GGUF
// loads of a model and its wctx_alloc
static bool adapter_apply(WeightCtx * wctx, const GGUFModel & gf, ggml_backend_t backend, const AdapterTerms & terms) {
    std::unordered_map<const void *, size_t> staged;
    for (size_t i = 0; i < wctx->pending.size(); i++) {
        staged[wctx->pending[i].src] = i;
    }
    for (const auto & kv : terms) {
        const struct ggml_tensor * meta = ggml_get_tensor(gf.meta, kv.first.c_str());
        if (!meta) {
            fprintf(stderr, "[Adapter] FATAL: %s is not in the GGUF\n", kv.first.c_str());
            return false;
        }
        for (const AdapterTerm & t : kv.second) {
            bool fits = t.role == ROLE_A ?
                            t.a.ne0 == meta->ne[0] && t.b.ne0 == t.a.ne1 && t.row0 + ggml_nrows(meta) <= t.b.ne1 :
                            t.a.ne0 * t.a.ne1 == ggml_nelements(meta);
            if (!fits) {
                fprintf(stderr, "[Adapter] FATAL: a term does not fit %s\n", kv.first.c_str());
                return false;
            }
        }
        int64_t idx = gguf_find_tensor(gf.gguf, kv.first.c_str());
        auto    it  = staged.find(gf.mapping + gf.data_offset + gguf_get_tensor_offset(gf.gguf, idx));
        if (it == staged.end()) {
            fprintf(stderr, "[Adapter] FATAL: %s is not staged by this model\n", kv.first.c_str());
            return false;
        }
        if (!adapter_merge_tensor(wctx, &wctx->pending[it->second], meta, kv.second, backend)) {
            return false;
        }
    }
    return true;
}

// The GGUF tensors behind one adapter module and the B rows each receives
static std::vector<std::pair<std::string, int64_t>> adapter_targets(const GGUFModel & gf, const AdapterKey & k) {
    std::string suffix = k.bias ? ".bias" : ".weight";
    std::string parts[3];
    int         n    = 0;
    std::string base = k.module;
    if (adapter_cut(&base, "qkv_proj")) {
        parts[n++] = base + "q_proj";
        parts[n++] = base + "k_proj";
        parts[n++] = base + "v_proj";
    } else if (adapter_cut(&base, "gate_up_proj")) {
        parts[n++] = base + "gate_proj";
        parts[n++] = base + "up_proj";
    } else {
        parts[n++] = k.module;
    }
    std::vector<std::pair<std::string, int64_t>> out;
    int64_t                                      row0 = 0;
    for (int i = 0; i < n; i++) {
        std::string                name = parts[i] + suffix;
        const struct ggml_tensor * t    = ggml_get_tensor(gf.meta, name.c_str());
        if (!t) {
            return {};
        }
        out.push_back({ name, row0 });
        row0 += ggml_nrows(t);
    }
    return out;
}

// Merges the terms of every adapter that fall on one half into the staged
// weights of a loader, between its GGUF loads and its wctx_alloc
static bool adapter_merge(WeightCtx *                     wctx,
                          const GGUFModel &               gf,
                          ggml_backend_t                  backend,
                          int                             half,
                          const std::vector<AdapterUse> & adapters) {
    if (adapters.empty()) {
        return true;
    }
    Timer               timer;
    std::vector<STFile> files(adapters.size());
    bool                ok = true;
    AdapterTerms        terms;

    for (size_t f = 0; f < adapters.size() && ok; f++) {
        const AdapterUse & use = adapters[f];
        STFile &           st  = files[f];
        if (!st_open(&st, use.path.c_str())) {
            ok = false;
            break;
        }
        float file_alpha = adapter_file_alpha(use.path, st);

        std::map<std::pair<std::string, bool>, AdapterModule> modules;
        std::map<std::pair<std::string, bool>, AdapterKey>    keys;
        for (const STEntry & e : st.entries) {
            AdapterKey k;
            if (!adapter_parse_key(e.name, &k)) {
                fprintf(stderr, "[Adapter] FATAL: %s: unsupported tensor %s\n", use.path.c_str(), e.name.c_str());
                ok = false;
                break;
            }
            if (k.half != half) {
                continue;
            }
            auto            id    = std::make_pair(k.module, k.bias);
            AdapterModule & m     = modules[id];
            keys[id]              = k;
            const STEntry ** slot = k.role == ROLE_A     ? &m.a :
                                    k.role == ROLE_B     ? &m.b :
                                    k.role == ROLE_ALPHA ? &m.alpha :
                                    k.role == ROLE_DIFF  ? &m.diff :
                                                           &m.full;
            *slot                 = &e;
        }

        for (auto & kv : modules) {
            if (!ok) {
                break;
            }
            const AdapterModule & m = kv.second;
            const AdapterKey &    k = keys[kv.first];
            auto                  t = adapter_targets(gf, k);
            if (t.empty()) {
                fprintf(stderr, "[Adapter] FATAL: %s: %s is not in the GGUF\n", use.path.c_str(), k.module.c_str());
                ok = false;
                break;
            }
            int64_t rows = 0;
            for (auto & target : t) {
                rows += ggml_nrows(ggml_get_tensor(gf.meta, target.first.c_str()));
            }
            if (m.a || m.b) {
                AdapterTensor a, b;
                if (!m.a || !m.b || !adapter_st_tensor(st, *m.a, &a) || !adapter_st_tensor(st, *m.b, &b) ||
                    b.ne1 != rows) {
                    fprintf(stderr, "[Adapter] FATAL: %s: %s has no matching A and B\n", use.path.c_str(),
                            k.module.c_str());
                    ok = false;
                    break;
                }
                float rank  = (float) a.ne1;
                float alpha = file_alpha != 0.0f ? file_alpha : rank;
                if (m.alpha && adapter_numel(*m.alpha) == 1) {
                    AdapterTensor s;
                    if (!adapter_st_tensor(st, *m.alpha, &s)) {
                        ok = false;
                        break;
                    }
                    adapter_f32(s, 0, 1, &alpha);
                }
                for (auto & target : t) {
                    terms[target.first].push_back({ ROLE_A, a, b, target.second, use.scale * alpha / rank });
                }
            }
            for (const STEntry * e : { m.diff, m.full }) {
                AdapterTensor d;
                if (!e) {
                    continue;
                }
                if (t.size() != 1 || !adapter_st_tensor(st, *e, &d)) {
                    fprintf(stderr, "[Adapter] FATAL: %s: %s does not match its tensor\n", use.path.c_str(),
                            e->name.c_str());
                    ok = false;
                    break;
                }
                terms[t[0].first].push_back({ e == m.diff ? ROLE_DIFF : ROLE_FULL, d, {}, 0, use.scale });
            }
        }
    }

    ok = ok && adapter_apply(wctx, gf, backend, terms);
    for (STFile & st : files) {
        st_close(&st);
    }
    if (ok) {
        fprintf(stderr, "[Adapter] %s: %zu adapters, %zu tensors merged, %.0f ms\n", half == ADAPTER_AR ? "AR" : "NAR",
                adapters.size(), terms.size(), timer.ms());
    }
    return ok;
}
