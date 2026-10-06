#pragma once
// Local addition: LoRA adapters for YuE2, read straight from .safetensors and
// merged into the weights while the model loads (weight + strength x alpha/rank
// x B @ A, computed in F32, then stored in the weight's own type: F32, BF16,
// F16, or re-quantized for Q8_0/Q6_K/Q5_K). The music (AR) and sound (NAR)
// halves take separate strengths, so each half's store key names only its own.
//
// The same rules as the other console's loras.py (keep them in step):
//   unfused  model.layers.N.{self_attn,mlp,nar_self_attn,nar_mlp}.<proj>.lora_A/lora_B
//            (+ .weight / .default.weight, base_model.model. prefix, bare layers.N.)
//   fused    text_encoders.* = music half, diffusion_model.* = sound half, qkv_proj
//            and gate_up_proj split by the rows of B (exact for shared A and for
//            block-diagonal files)
//   lora_A/lora_B or lora_down/lora_up, per-module .alpha, .diff / .diff_b deltas,
//   full .weight/.bias replacements of llm2vae / vae2llm / time_embedder.
//   Scale: .alpha / rank, else metadata alpha / rank, else adapter_config.json
//   beside the file (alpha|lora_alpha over r|rank, rsLoRA: sqrt), else 1.
//   Every tensor must land on the model, or the file is refused with the reason.

#include "ggml.h"
#include "yyjson.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

// ------------------------------------------------------------ safetensors

struct StTensor {
    std::string          dtype;
    std::vector<int64_t> shape;
    uint64_t             begin = 0, end = 0;  // byte range in the file (absolute)
};

struct StFile {
    std::string                     path;
    std::map<std::string, StTensor> tensors;
    std::map<std::string, std::string> meta;
};

static std::string lora_read_text(const std::filesystem::path & p) {
    std::ifstream     f(p, std::ios::binary);
    std::stringstream s;
    s << f.rdbuf();
    return s.str();
}

static bool st_read_header(const std::string & path, StFile * out, std::string * error) {
    std::ifstream f(path, std::ios::binary);
    uint64_t      size = 0;
    if (!f.read(reinterpret_cast<char *>(&size), 8) || size == 0 || size > (100ull << 20)) {
        *error = "not a safetensors file";
        return false;
    }
    std::string header(size, '\0');
    if (!f.read(&header[0], (std::streamsize) size)) {
        *error = "not a safetensors file";
        return false;
    }
    yyjson_doc * doc = yyjson_read(header.data(), header.size(), 0);
    if (!doc || !yyjson_is_obj(yyjson_doc_get_root(doc))) {
        if (doc) {
            yyjson_doc_free(doc);
        }
        *error = "not a safetensors file";
        return false;
    }
    out->path = path;
    out->tensors.clear();
    out->meta.clear();
    size_t       idx, max;
    yyjson_val * key, *val;
    yyjson_obj_foreach(yyjson_doc_get_root(doc), idx, max, key, val) {
        std::string name = yyjson_get_str(key);
        if (name == "__metadata__") {
            size_t       i2, m2;
            yyjson_val * k2, *v2;
            yyjson_obj_foreach(val, i2, m2, k2, v2) {
                if (yyjson_is_str(v2)) {
                    out->meta[yyjson_get_str(k2)] = yyjson_get_str(v2);
                }
            }
            continue;
        }
        StTensor     t;
        yyjson_val * dt = yyjson_obj_get(val, "dtype");
        yyjson_val * sh = yyjson_obj_get(val, "shape");
        yyjson_val * of = yyjson_obj_get(val, "data_offsets");
        if (!dt || !sh || !of || !yyjson_is_arr(sh) || yyjson_arr_size(of) != 2) {
            yyjson_doc_free(doc);
            *error = "bad tensor entry " + name;
            return false;
        }
        t.dtype = yyjson_get_str(dt);
        size_t       si, sm;
        yyjson_val * d;
        yyjson_arr_foreach(sh, si, sm, d) {
            t.shape.push_back(yyjson_get_sint(d));
        }
        t.begin = 8 + size + (uint64_t) yyjson_get_uint(yyjson_arr_get(of, 0));
        t.end   = 8 + size + (uint64_t) yyjson_get_uint(yyjson_arr_get(of, 1));
        out->tensors[name] = t;
    }
    yyjson_doc_free(doc);
    return true;
}

// A whole tensor as F32 (F32, BF16 and F16 files)
static bool st_read_f32(const StFile & f, const std::string & name, std::vector<float> * out, std::string * error) {
    auto it = f.tensors.find(name);
    if (it == f.tensors.end()) {
        *error = "missing tensor " + name;
        return false;
    }
    const StTensor & t     = it->second;
    size_t           bytes = (size_t) (t.end - t.begin);
    int64_t          n     = 1;
    for (int64_t d : t.shape) {
        n *= d;
    }
    size_t width = t.dtype == "F32" ? 4 : (t.dtype == "BF16" || t.dtype == "F16") ? 2 : 0;
    if (!width || bytes != (size_t) n * width) {
        *error = name + ": unsupported dtype " + t.dtype;
        return false;
    }
    std::vector<uint8_t> raw(bytes);
    std::ifstream        in(f.path, std::ios::binary);
    in.seekg((std::streamoff) t.begin);
    if (!in.read(reinterpret_cast<char *>(raw.data()), (std::streamsize) bytes)) {
        *error = "cannot read " + name;
        return false;
    }
    out->resize((size_t) n);
    if (width == 4) {
        memcpy(out->data(), raw.data(), bytes);
    } else if (t.dtype == "BF16") {
        const uint16_t * p = reinterpret_cast<const uint16_t *>(raw.data());
        for (int64_t i = 0; i < n; i++) {
            uint32_t u = (uint32_t) p[i] << 16;
            memcpy(&(*out)[i], &u, 4);
        }
    } else {
        ggml_fp16_to_fp32_row(reinterpret_cast<const ggml_fp16_t *>(raw.data()), out->data(), n);
    }
    return true;
}

// ------------------------------------------------------------ layout rules

struct LoraGroup {
    enum Kind { LORA, DIFF, DIFF_B, REPLACE } kind = LORA;
    std::string              module;
    int                      half = 0;  // 0 music (AR), 1 sound (NAR)
    std::vector<std::string> targets;   // model Linear names, in the row order of B
    std::string              a, b, alpha, key, leaf;
    int64_t                  rank = 0, in = 0, out = 0;
    double                   scale = 1.0;  // when there is no per-module alpha
};

struct LoraFile {
    std::string            path;
    StFile                 st;
    std::vector<LoraGroup> groups;
    std::string            error;  // empty when it loads
};

static bool lora_starts(const std::string & s, const std::string & p) {
    return s.compare(0, p.size(), p) == 0;
}

static bool lora_ends(const std::string & s, const std::string & p) {
    return s.size() >= p.size() && s.compare(s.size() - p.size(), p.size(), p) == 0;
}

static const char * const LORA_OUTSIDE[] = { "llm2vae", "vae2llm", "time_embedder.mlp.0", "time_embedder.mlp.2" };

static bool lora_outside(const std::string & n) {
    for (const char * o : LORA_OUTSIDE) {
        if (n == o) {
            return true;
        }
    }
    return false;
}

// A LoRA module name -> half and model Linear names; false with the reason
static bool lora_resolve(const std::string & module, int * half, std::vector<std::string> * targets, std::string * error) {
    std::string name = module;
    int         h    = -1;
    if (lora_starts(name, "base_model.model.")) {
        name = name.substr(17);
    }
    if (lora_starts(name, "text_encoders.")) {
        name = name.substr(14);
        h    = 0;
    } else if (lora_starts(name, "diffusion_model.")) {
        name = name.substr(16);
        h    = 1;
    }
    if (lora_starts(name, "layers.")) {
        name = "model." + name;
    }
    targets->clear();
    if (lora_outside(name)) {
        *half = 1;
        targets->push_back(name);
        return true;
    }
    // model.layers.<N>.<branch>.<proj>
    if (!lora_starts(name, "model.layers.")) {
        *error = "does not know where to put " + module;
        return false;
    }
    std::string rest = name.substr(13);
    size_t      d1   = rest.find('.');
    size_t      d2   = d1 == std::string::npos ? d1 : rest.find('.', d1 + 1);
    if (d1 == std::string::npos || d2 == std::string::npos || rest.find('.', d2 + 1) != std::string::npos || d1 == 0 ||
        rest.find_first_not_of("0123456789") != d1) {
        *error = "does not know where to put " + module;
        return false;
    }
    std::string index = rest.substr(0, d1), branch = rest.substr(d1 + 1, d2 - d1 - 1), proj = rest.substr(d2 + 1);
    bool        nar_branch = lora_starts(branch, "nar_");
    if (h == 1 && !nar_branch) {
        branch = branch == "self_attn" ? "nar_self_attn" : branch == "mlp" ? "nar_mlp" : branch;
    } else if (h == 0 && nar_branch) {
        *error = "music-half key names a sound layer: " + module;
        return false;
    } else if (h < 0) {
        h = nar_branch ? 1 : 0;
    }
    std::vector<std::string> projs;
    if (proj == "qkv_proj") {
        projs = { "q_proj", "k_proj", "v_proj" };
    } else if (proj == "gate_up_proj") {
        projs = { "gate_proj", "up_proj" };
    } else {
        projs = { proj };
    }
    static const std::set<std::string> attn = { "q_proj", "k_proj", "v_proj", "o_proj" };
    static const std::set<std::string> mlp  = { "gate_proj", "up_proj", "down_proj" };
    const std::set<std::string> *      ok   = (branch == "self_attn" || branch == "nar_self_attn") ? &attn :
                                              (branch == "mlp" || branch == "nar_mlp")             ? &mlp :
                                                                                                     nullptr;
    for (const std::string & p : projs) {
        if (!ok || !ok->count(p)) {
            *error = "does not know where to put " + module;
            return false;
        }
        targets->push_back("model.layers." + index + "." + branch + "." + p);
    }
    *half = h;
    return true;
}

static bool lora_number(const std::string & s, double * v) {
    if (s.empty()) {
        return false;
    }
    char * end = nullptr;
    double x   = strtod(s.c_str(), &end);
    if (!end || *end || !std::isfinite(x)) {
        return false;
    }
    *v = x;
    return true;
}

// alpha / rank from adapter_config.json beside the file
static bool lora_sidecar(const std::string & path, double * alpha, double * rank, bool * rs) {
    std::filesystem::path cfg = std::filesystem::path(path).parent_path() / "adapter_config.json";
    if (!std::filesystem::is_regular_file(cfg)) {
        return false;
    }
    std::string  text = lora_read_text(cfg);
    yyjson_doc * doc  = yyjson_read(text.data(), text.size(), 0);
    if (!doc) {
        return false;
    }
    yyjson_val * root = yyjson_doc_get_root(doc);
    yyjson_val * a    = yyjson_obj_get(root, "lora_alpha");
    if (!a) {
        a = yyjson_obj_get(root, "alpha");
    }
    yyjson_val * r = yyjson_obj_get(root, "r");
    if (!r) {
        r = yyjson_obj_get(root, "rank");
    }
    yyjson_val * u  = yyjson_obj_get(root, "use_rslora");
    bool         ok = a && r && yyjson_is_num(a) && yyjson_is_num(r) && yyjson_get_num(r) > 0;
    if (ok) {
        *alpha = yyjson_get_num(a);
        *rank  = yyjson_get_num(r);
        *rs    = u && yyjson_is_true(u);
    }
    yyjson_doc_free(doc);
    return ok;
}

static bool lora_plan(const std::string & path, LoraFile * lf) {
    lf->path = path;
    lf->groups.clear();
    lf->error.clear();
    if (!st_read_header(path, &lf->st, &lf->error)) {
        return false;
    }
    const auto & T = lf->st.tensors;
    if (T.empty()) {
        lf->error = "the file holds no tensors";
        return false;
    }
    static const std::pair<const char *, const char *> AB[] = {
        { ".lora_A.default.weight", ".lora_B.default.weight" },
        { ".lora_A.weight",         ".lora_B.weight"         },
        { ".lora_A",                ".lora_B"                },
        { ".lora_down.weight",      ".lora_up.weight"        },
    };
    std::set<std::string> used;
    double                meta_alpha = 0, sc_alpha = 0, sc_rank = 0;
    bool                  has_meta   = false, sc_rs = false;
    auto                  ma         = lf->st.meta.find("alpha");
    if (ma == lf->st.meta.end()) {
        ma = lf->st.meta.find("lora_alpha");
    }
    if (ma != lf->st.meta.end()) {
        has_meta = lora_number(ma->second, &meta_alpha);
    }
    bool has_sidecar = lora_sidecar(path, &sc_alpha, &sc_rank, &sc_rs);
    for (const auto & kv : T) {
        const std::string & key = kv.first;
        for (const auto & ab : AB) {
            if (!lora_ends(key, ab.first)) {
                continue;
            }
            std::string module = key.substr(0, key.size() - strlen(ab.first));
            std::string b_key  = module + ab.second;
            auto        bi     = T.find(b_key);
            if (bi == T.end()) {
                lf->error = key + " has no matching " + ab.second;
                return false;
            }
            const auto & as = kv.second.shape;
            const auto & bs = bi->second.shape;
            if (as.size() != 2 || bs.size() != 2 || bs[1] != as[0]) {
                lf->error = "mismatched LoRA matrices for " + module;
                return false;
            }
            LoraGroup g;
            if (!lora_resolve(module, &g.half, &g.targets, &lf->error)) {
                return false;
            }
            g.kind   = LoraGroup::LORA;
            g.module = module;
            g.a      = key;
            g.b      = b_key;
            g.rank   = as[0];
            g.in     = as[1];
            g.out    = bs[0];
            if (T.count(module + ".alpha")) {
                g.alpha = module + ".alpha";
                used.insert(g.alpha);
            } else if (has_meta) {
                g.scale = meta_alpha / (double) g.rank;
            } else if (has_sidecar) {
                g.scale = sc_rs ? sc_alpha / std::sqrt(sc_rank) : sc_alpha / sc_rank;
            }
            lf->groups.push_back(g);
            used.insert(key);
            used.insert(b_key);
            break;
        }
    }
    for (const auto & kv : T) {
        const std::string & key = kv.first;
        if (used.count(key)) {
            continue;
        }
        if (lora_ends(key, ".diff") || lora_ends(key, ".diff_b")) {
            LoraGroup g;
            g.kind   = lora_ends(key, ".diff_b") ? LoraGroup::DIFF_B : LoraGroup::DIFF;
            g.module = key.substr(0, key.rfind('.'));
            g.key    = key;
            if (!lora_resolve(g.module, &g.half, &g.targets, &lf->error)) {
                return false;
            }
            lf->groups.push_back(g);
            used.insert(key);
            continue;
        }
        std::string base = lora_starts(key, "diffusion_model.") ? key.substr(16) : key;
        size_t      dot  = base.rfind('.');
        if (dot != std::string::npos) {
            std::string stem = base.substr(0, dot), leaf = base.substr(dot + 1);
            if (lora_outside(stem) && (leaf == "weight" || leaf == "bias")) {
                LoraGroup g;
                g.kind    = LoraGroup::REPLACE;
                g.module  = stem;
                g.half    = 1;
                g.targets = { stem };
                g.key     = key;
                g.leaf    = leaf;
                lf->groups.push_back(g);
                used.insert(key);
            }
        }
    }
    std::vector<std::string> left;
    for (const auto & kv : T) {
        if (!used.count(kv.first)) {
            left.push_back(kv.first);
        }
    }
    if (!left.empty()) {
        lf->error = std::to_string(left.size()) + " tensors do not land on the model, e.g. " + left.front();
        return false;
    }
    if (lf->groups.empty()) {
        lf->error = "no LoRA pairs found";
        return false;
    }
    return true;
}

// ------------------------------------------------------------ catalog

struct LoraInfo {
    std::string id, name, trigger, hint, mode, layout, error;
    bool        ar = false, nar = false;
    int64_t     rank = 0, pairs = 0;
    double      size_mb = 0;
};

static std::string lora_json_str(const std::filesystem::path & p, const char * field) {
    if (!std::filesystem::is_regular_file(p)) {
        return "";
    }
    std::string  text = lora_read_text(p);
    yyjson_doc * doc  = yyjson_read(text.data(), text.size(), 0);
    std::string  out;
    if (doc) {
        yyjson_val * v = yyjson_obj_get(yyjson_doc_get_root(doc), field);
        if (v && yyjson_is_str(v)) {
            out = yyjson_get_str(v);
        }
        yyjson_doc_free(doc);
    }
    size_t a = out.find_first_not_of(" \t\r\n"), b = out.find_last_not_of(" \t\r\n");
    return a == std::string::npos ? "" : out.substr(a, b - a + 1);
}

static LoraInfo lora_describe(const std::filesystem::path & path, const std::filesystem::path & root) {
    LoraInfo info;
    info.id                             = path.lexically_relative(root).generic_string();
    std::filesystem::path folder        = path.parent_path();
    info.size_mb                        = std::round((double) std::filesystem::file_size(path) / 1e5) / 10.0;
    std::string named                   = lora_json_str(folder / "lora.json", "name");
    static const std::set<std::string> generic = { "lora", "adapter_model", "pytorch_lora_weights", "model", "adapter" };
    std::string                         stem    = path.stem().string();
    std::string                         lower   = stem;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    std::vector<std::string> parts;
    for (const auto & part : path.lexically_relative(root)) {
        parts.push_back(part.string());
    }
    if (!named.empty()) {
        info.name = named;
    } else if (generic.count(lower) && parts.size() > 1) {
        for (size_t i = 0; i + 1 < parts.size(); i++) {
            info.name += (i ? " / " : "") + parts[i];
        }
    } else {
        info.name = stem;
    }
    LoraFile lf;
    if (!lora_plan(path.string(), &lf)) {
        info.error = lf.error;
        return info;
    }
    for (const LoraGroup & g : lf.groups) {
        (g.half ? info.nar : info.ar) = true;
        info.rank = std::max(info.rank, g.rank);
        if (lora_ends(g.module, "qkv_proj") || lora_ends(g.module, "gate_up_proj")) {
            info.layout = "fused";
        }
    }
    if (info.layout.empty()) {
        info.layout = "unfused";
    }
    info.pairs = (int64_t) lf.groups.size();
    // trigger: lora.json, the file's metadata, training_config.json, the tag list
    info.trigger = lora_json_str(folder / "lora.json", "trigger");
    auto & meta  = lf.st.meta;
    if (info.trigger.empty() && meta.count("trigger_word")) {
        info.trigger = meta["trigger_word"];
        size_t a = info.trigger.find_first_not_of(" \t"), b = info.trigger.find_last_not_of(" \t");
        info.trigger = a == std::string::npos ? "" : info.trigger.substr(a, b - a + 1);
    }
    if (info.trigger.empty()) {
        info.trigger = lora_json_str(folder / "training_config.json", "trigger_word");
    }
    if (info.trigger.empty() && meta.count("ss_tag_frequency")) {
        const std::string & tf  = meta["ss_tag_frequency"];
        yyjson_doc *        doc = yyjson_read(tf.data(), tf.size(), 0);
        if (doc) {
            yyjson_val * tags = yyjson_doc_get_root(doc);
            if (yyjson_is_obj(tags) && yyjson_obj_size(tags) > 0) {
                size_t       i, m;
                yyjson_val * k, *v;
                yyjson_obj_foreach(tags, i, m, k, v) {
                    std::string t = yyjson_get_str(k);
                    size_t      u = t.find('_');
                    if (u != std::string::npos && u > 0 && t.find_first_not_of("0123456789") == u) {
                        t = t.substr(u + 1);
                    }
                    info.trigger = t;
                    break;
                }
            }
            yyjson_doc_free(doc);
        }
    }
    info.hint = lora_json_str(folder / "training_config.json", "style_description");
    std::string mode = meta.count("intended_cot") ? meta["intended_cot"] : meta.count("source_cot") ? meta["source_cot"] : "";
    info.mode        = (mode == "off" || mode == "none") ? "direct" : mode;
    return info;
}

// Every .safetensors under root (links followed, dot folders skipped), sorted by id
static std::vector<LoraInfo> lora_catalog(const std::string & root_dir) {
    std::vector<LoraInfo> out;
    std::filesystem::path root(root_dir);
    std::error_code       ec;
    if (root_dir.empty() || !std::filesystem::is_directory(root, ec)) {
        return out;
    }
    std::vector<std::filesystem::path> found;
    auto opts = std::filesystem::directory_options::follow_directory_symlink |
                std::filesystem::directory_options::skip_permission_denied;
    for (auto it = std::filesystem::recursive_directory_iterator(root, opts, ec);
         it != std::filesystem::recursive_directory_iterator(); it.increment(ec)) {
        if (ec) {
            break;
        }
        std::string name = it->path().filename().string();
        if (!name.empty() && name[0] == '.') {
            if (it->is_directory(ec)) {
                it.disable_recursion_pending();
            }
            continue;
        }
        if (it->is_regular_file(ec) && lora_ends(name, ".safetensors")) {
            found.push_back(it->path());
        }
    }
    std::sort(found.begin(), found.end(), [&](const auto & a, const auto & b) {
        return a.lexically_relative(root).generic_string() < b.lexically_relative(root).generic_string();
    });
    for (const auto & p : found) {
        out.push_back(lora_describe(p, root));
    }
    return out;
}

// ------------------------------------------------------------ a set to merge

struct LoraContribution {
    const LoraFile *  file;
    const LoraGroup * group;
    int64_t           row0, rows;  // slice of B (or of a fused delta) for this weight
    double            strength;
};

struct LoraSet {
    std::vector<std::shared_ptr<LoraFile>> files;
    std::vector<std::pair<double, double>> strengths;  // (music, sound) per file
    std::string                            sig[2];     // store-key signature per half
    // GGUF tensor name (".weight"/".bias") -> what to add, built by lora_bind
    std::unordered_map<std::string, std::vector<LoraContribution>> index;
    bool                                                           bound = false;
    std::mutex                                                     mtx;
};

// Build a set from (path, music, sound) choices; false with the reason
static bool lora_set_open(const std::vector<std::tuple<std::string, double, double>> & choices, LoraSet * set,
                          std::string * error) {
    for (const auto & c : choices) {
        auto lf = std::make_shared<LoraFile>();
        if (!lora_plan(std::get<0>(c), lf.get())) {
            *error = std::get<0>(c) + ": " + lf->error;
            return false;
        }
        std::error_code ec;
        auto            mtime = std::filesystem::last_write_time(std::get<0>(c), ec).time_since_epoch().count();
        for (int h = 0; h < 2; h++) {
            double s = h ? std::get<2>(c) : std::get<1>(c);
            bool   has = false;
            for (const auto & g : lf->groups) {
                has |= g.half == h;
            }
            if (s != 0.0 && has) {
                char buf[64];
                snprintf(buf, sizeof(buf), "@%.4f:%lld;", s, (long long) mtime);
                set->sig[h] += std::get<0>(c) + buf;
            }
        }
        set->files.push_back(lf);
        set->strengths.push_back({ std::get<1>(c), std::get<2>(c) });
    }
    return true;
}

// Rows of a model weight, from the GGUF's metadata (ne[1]; 1-D biases have ne[0] rows)
using LoraRowsFn = int64_t (*)(void * ctx, const std::string & name, int64_t * cols);

// Index every contribution by GGUF tensor name and check the shapes; false with the reason
static bool lora_bind(LoraSet * set, LoraRowsFn rows_of, void * ctx, std::string * error) {
    std::lock_guard<std::mutex> lock(set->mtx);
    if (set->bound) {
        return true;
    }
    for (size_t f = 0; f < set->files.size(); f++) {
        const LoraFile * lf = set->files[f].get();
        for (const LoraGroup & g : lf->groups) {
            double s = g.half ? set->strengths[f].second : set->strengths[f].first;
            if (s == 0.0) {
                continue;
            }
            bool    bias = g.kind == LoraGroup::DIFF_B || (g.kind == LoraGroup::REPLACE && g.leaf == "bias");
            int64_t off  = 0;
            for (const std::string & t : g.targets) {
                std::string name = t + (bias ? ".bias" : ".weight");
                int64_t     cols = 0, rows = rows_of(ctx, name, &cols);
                if (rows <= 0) {
                    *error = "the model has no " + name;
                    return false;
                }
                if (g.kind == LoraGroup::LORA && g.in != cols) {
                    *error = g.module + ": A takes " + std::to_string(g.in) + " inputs, " + name + " has " +
                             std::to_string(cols);
                    return false;
                }
                set->index[name].push_back({ lf, &g, off, rows, s });
                off += rows;
            }
            if (g.kind == LoraGroup::LORA && off != g.out) {
                *error = g.module + ": B has " + std::to_string(g.out) + " rows, the model's targets take " +
                         std::to_string(off);
                return false;
            }
        }
    }
    set->bound = true;
    return true;
}

static bool lora_touches(const LoraSet * set, const std::string & name) {
    return set && set->index.count(name) > 0;
}

// One contribution, read and scaled once per weight
struct LoraPrepared {
    LoraGroup::Kind    kind;
    int64_t            rank = 0;
    std::vector<float> a, b;  // LORA: A [rank x cols], B slice [rows x rank] scaled by strength x alpha/rank
    std::vector<float> d;     // DIFF / DIFF_B: the delta slice [rows x cols] x strength; REPLACE: full x strength
    double             strength = 0;
};

static bool lora_prepare(LoraSet * set, const std::string & name, int64_t rows, int64_t cols,
                         std::vector<LoraPrepared> * out, std::string * error) {
    out->clear();
    auto it = set->index.find(name);
    if (it == set->index.end()) {
        return true;
    }
    for (const LoraContribution & c : it->second) {
        const LoraGroup & g = *c.group;
        LoraPrepared      p;
        p.kind     = g.kind;
        p.strength = c.strength;
        if (g.kind == LoraGroup::LORA) {
            std::vector<float> b;
            if (!st_read_f32(c.file->st, g.a, &p.a, error) || !st_read_f32(c.file->st, g.b, &b, error)) {
                return false;
            }
            double scale = g.scale;
            if (!g.alpha.empty()) {
                std::vector<float> al;
                if (!st_read_f32(c.file->st, g.alpha, &al, error) || al.size() != 1) {
                    return false;
                }
                scale = al[0] / (double) g.rank;
            }
            p.rank = g.rank;
            p.b.resize((size_t) (rows * g.rank));
            const double factor = scale * c.strength;
            for (int64_t i = 0; i < rows * g.rank; i++) {
                p.b[(size_t) i] = (float) (b[(size_t) (c.row0 * g.rank + i)] * factor);
            }
        } else {
            std::vector<float> d;
            if (!st_read_f32(c.file->st, g.key, &d, error)) {
                return false;
            }
            if ((int64_t) d.size() < (c.row0 + rows) * cols || (g.kind == LoraGroup::REPLACE && (int64_t) d.size() != rows * cols)) {
                *error = g.key + ": shape does not match " + name;
                return false;
            }
            p.d.assign(d.begin() + c.row0 * cols, d.begin() + (c.row0 + rows) * cols);
        }
        out->push_back(std::move(p));
    }
    return true;
}

// The hot loop: out[r] += sum_k b[r][k] * a[k], for rows r0..r1 (AVX2/FMA build with a fallback)
#if defined(__GNUC__) && (defined(__x86_64__) || defined(__i386__)) && !defined(__clang__)
__attribute__((target_clones("arch=x86-64-v3", "default")))
#endif
static void lora_rows_update(float * w, int64_t r0, int64_t r1, int64_t cols, const float * b, int64_t rank,
                             const float * a) {
    for (int64_t r = r0; r < r1; r++) {
        float * __restrict__       out = w + r * cols;
        const float * __restrict__ br  = b + r * rank;
        for (int64_t k = 0; k < rank; k++) {
            const float                coef = br[k];
            const float * __restrict__ ar   = a + k * cols;
            for (int64_t i = 0; i < cols; i++) {
                out[i] += coef * ar[i];
            }
        }
    }
}

// Rows r0..r1 of w (the weight in F32; `base` the original, for replacements) get every contribution
static void lora_apply_rows(const std::vector<LoraPrepared> & ps, float * w, const float * base, int64_t r0, int64_t r1,
                            int64_t cols) {
    for (const LoraPrepared & p : ps) {
        if (p.kind == LoraGroup::LORA) {
            lora_rows_update(w, r0, r1, cols, p.b.data(), p.rank, p.a.data());
        } else {
            const float s = (float) p.strength;
            for (int64_t i = r0 * cols; i < r1 * cols; i++) {
                w[i] += s * (p.kind == LoraGroup::REPLACE ? p.d[(size_t) i] - base[i] : p.d[(size_t) i]);
            }
        }
    }
}

// Split rows over up to 8 threads (fewer for small weights)
template <typename F> static void lora_parallel_rows(int64_t rows, F fn) {
    int     n_threads = (int) std::min<unsigned>(8, std::max(1u, std::thread::hardware_concurrency()));
    n_threads         = (int) std::min<int64_t>(n_threads, std::max<int64_t>(1, rows / 32));
    int64_t step      = (rows + n_threads - 1) / n_threads;
    std::vector<std::thread> pool;
    for (int t = 0; t < n_threads; t++) {
        int64_t r0 = t * step, r1 = std::min(rows, r0 + step);
        if (r0 < r1) {
            pool.emplace_back(fn, r0, r1);
        }
    }
    for (auto & th : pool) {
        th.join();
    }
}

// Add every contribution for `name` into w (F32, rows x cols, the weight already in it)
static bool lora_merge(LoraSet * set, const std::string & name, float * w, int64_t rows, int64_t cols, std::string * error) {
    std::vector<LoraPrepared> ps;
    if (!lora_prepare(set, name, rows, cols, &ps, error)) {
        return false;
    }
    std::vector<float> base;
    for (const auto & p : ps) {
        if (p.kind == LoraGroup::REPLACE) {
            base.assign(w, w + rows * cols);
            break;
        }
    }
    lora_parallel_rows(rows, [&](int64_t r0, int64_t r1) { lora_apply_rows(ps, w, base.data(), r0, r1, cols); });
    for (int64_t i = 0; i < rows * cols; i++) {
        if (!std::isfinite(w[i])) {
            *error = "the merge made " + name + " non-finite; lower the strength";
            return false;
        }
    }
    return true;
}
