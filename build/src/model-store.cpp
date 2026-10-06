// model-store.cpp: centralised ownership of GGML modules.
//
// A single hashmap keyed by ModelKey holds every GPU module the pipeline
// touches. Each entry carries the type-erased pointer, a refcount, and a
// deleter that knows how to free the underlying struct. On require, the
// store either hits the cache (refcount++) or evicts the other groups
// (STRICT) and loads the module. On release, the refcount drops; in
// STRICT with refcount == 0 the module is unloaded on the spot.
//
// The tokenizer (CPU-resident) lives in a separate map with the same
// keying scheme minus the eviction logic.

#include "model-store.h"

#include "timer.h"

#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>
#include <unordered_map>

namespace {

// Coexistence groups: modules the pipeline interleaves too finely to
// evict between. AR is the LM alone, SYNTH pairs the NAR and the VAE per
// song.
enum ModelGroup {
    GROUP_AR,
    GROUP_SYNTH,
    GROUP_TRANSCRIBE,
};

static ModelGroup group_of(ModelKind kind) {
    return kind == MODEL_LM ? GROUP_AR : (kind == MODEL_SS2 ? GROUP_TRANSCRIBE : GROUP_SYNTH);
}

struct ModelKeyHash {
    size_t operator()(const ModelKey & k) const noexcept {
        size_t h = std::hash<int>{}(static_cast<int>(k.kind));
        h ^= std::hash<std::string>{}(k.path) + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2);
        h ^= std::hash<std::string>{}(k.lora_sig) + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2);
        return h;
    }
};

struct ModelKeyEq {
    bool operator()(const ModelKey & a, const ModelKey & b) const noexcept {
        return a.kind == b.kind && a.path == b.path && a.lora_sig == b.lora_sig;
    }
};

// A loaded GPU module. The store owns ptr and calls deleter when unloading.
// bytes is the resident weight buffer size at load time, used for logging
// and the observability accessors. label is a short human-readable name.
struct GpuEntry {
    void * ptr;
    size_t bytes;
    int    refcount;
    void (*deleter)(void *);
    const char * label;
};

// Reverse lookup: handle pointer -> key, so store_release can find the
// entry from just the pointer without the caller carrying the key around.
using HandleMap = std::unordered_map<void *, ModelKey>;

// CPU-resident entry. No eviction, no refcount. Keyed by path only.
struct CpuEntry {
    void * ptr;
    void (*deleter)(void *);
};

}  // namespace

struct ModelStore {
    EvictPolicy policy;

    std::unordered_map<ModelKey, GpuEntry, ModelKeyHash, ModelKeyEq> gpu;
    HandleMap                                                        handle_to_key;

    // CPU resident tokenizers, keyed by backbone GGUF path. Small, never evicted.
    std::unordered_map<std::string, CpuEntry> bpe_by_path;
};

// Evicts every GPU entry that conflicts with the key we are about to
// load: any entry in another coexistence group, and any entry of the
// same kind under a different key (a quantization swap). Aborts if a
// conflicting module still has refcount > 0: that would mean two
// mutually exclusive modules are live at once, which violates the
// contract in STRICT mode.
static void evict_conflicts(ModelStore * s, const ModelKey & keep) {
    for (auto it = s->gpu.begin(); it != s->gpu.end();) {
        ModelKeyEq eq;
        bool       conflicts =
            group_of(it->first.kind) != group_of(keep.kind) || (it->first.kind == keep.kind && !eq(it->first, keep));
        if (!conflicts) {
            ++it;
            continue;
        }
        GpuEntry & e = it->second;
        if (e.refcount > 0) {
            fprintf(stderr, "[Store] FATAL: evicting %s (refcount=%d) to make room in STRICT mode\n", e.label,
                    e.refcount);
            abort();
        }
        fprintf(stderr, "[Store] Evict %s (%.1f MB)\n", e.label, (float) e.bytes / (1024.0f * 1024.0f));
        s->handle_to_key.erase(e.ptr);
        e.deleter(e.ptr);
        it = s->gpu.erase(it);
    }
}

namespace {

template <typename T>
static T * install_entry(ModelStore *     s,
                         const ModelKey & k,
                         T *              obj,
                         size_t           bytes,
                         const char *     label,
                         void (*deleter)(void *)) {
    GpuEntry e;
    e.ptr      = obj;
    e.bytes    = bytes;
    e.refcount = 1;
    e.deleter  = deleter;
    e.label    = label;
    s->gpu.emplace(k, e);
    s->handle_to_key.emplace(obj, k);
    return obj;
}

template <typename T> static T * cache_hit(ModelStore * s, const ModelKey & k) {
    auto it = s->gpu.find(k);
    if (it == s->gpu.end()) {
        return nullptr;
    }
    it->second.refcount++;
    return static_cast<T *>(it->second.ptr);
}

}  // namespace

ModelStore * store_create(EvictPolicy policy) {
    auto * s  = new ModelStore();
    s->policy = policy;
    fprintf(stderr, "[Store] Created (policy=%s)\n", policy == EVICT_STRICT ? "STRICT" : "NEVER");
    return s;
}

EvictPolicy store_policy(const ModelStore * s) {
    return s->policy;
}

void store_free(ModelStore * s) {
    if (!s) {
        return;
    }
    // GPU modules: release every entry regardless of refcount (shutdown).
    for (auto & kv : s->gpu) {
        GpuEntry & e = kv.second;
        e.deleter(e.ptr);
    }
    s->gpu.clear();
    s->handle_to_key.clear();

    // CPU modules.
    for (auto & kv : s->bpe_by_path) {
        kv.second.deleter(kv.second.ptr);
    }
    delete s;
}

// Each require_* follows the same shape: check cache, evict conflicts,
// load, install entry. The deleter is a plain C function that matches the
// module's free path, avoiding template plumbing.
static void del_lm(void * p) {
    qw3lm_free(static_cast<Qwen3LM *>(p));
    delete static_cast<Qwen3LM *>(p);
}

static void del_nar(void * p) {
    nar_free(static_cast<Yue2NAR *>(p));
    delete static_cast<Yue2NAR *>(p);
}

static void del_vae(void * p) {
    vae_ggml_free(static_cast<VAEGGML *>(p));
    delete static_cast<VAEGGML *>(p);
}

static void del_ss2(void * p) {
    ss2_free(static_cast<SheetSage2 *>(p));
    delete static_cast<SheetSage2 *>(p);
}

// Weight buffer size helpers: the two halves expose a WeightCtx at
// m->wctx.buffer, the VAE exposes m->buf directly.
static size_t bytes_of_lm(const Qwen3LM * m) {
    return m && m->wctx.buffer ? ggml_backend_buffer_get_size(m->wctx.buffer) : 0;
}

static size_t bytes_of_nar(const Yue2NAR * m) {
    return m && m->wctx.buffer ? ggml_backend_buffer_get_size(m->wctx.buffer) : 0;
}

static size_t bytes_of_vae(const VAEGGML * m) {
    return m && m->buf ? ggml_backend_buffer_get_size(m->buf) : 0;
}

static size_t bytes_of_ss2(const SheetSage2 * m) {
    return m && m->wctx.buffer ? ggml_backend_buffer_get_size(m->wctx.buffer) : 0;
}

// Local addition: with models kept loaded, a half loaded with other LoRAs (or
// another file) is swapped out when idle rather than kept beside the new one.
static void evict_same_kind_idle(ModelStore * s, const ModelKey & keep) {
    ModelKeyEq eq;
    for (auto it = s->gpu.begin(); it != s->gpu.end();) {
        if (it->first.kind == keep.kind && !eq(it->first, keep) && it->second.refcount == 0) {
            fprintf(stderr, "[Store] Swap out %s (%.1f MB)\n", it->second.label, (float) it->second.bytes / (1024.0f * 1024.0f));
            s->handle_to_key.erase(it->second.ptr);
            it->second.deleter(it->second.ptr);
            it = s->gpu.erase(it);
        } else {
            ++it;
        }
    }
}

// Local addition: load with the key's LoRAs merged; a failed merge discards the load
template <typename T> static bool load_with_loras(const ModelKey & k, T * m, bool (*load)(T *, const char *),
                                                   void (*unload)(T *)) {
    g_gf_lora = k.lora.get();
    g_gf_lora_error.clear();
    Timer t;
    bool  ok = load(m, k.path.c_str());
    g_gf_lora = nullptr;
    if (ok && !g_gf_lora_error.empty()) {
        fprintf(stderr, "[LoRA] FATAL: %s\n", g_gf_lora_error.c_str());
        unload(m);
        return false;
    }
    if (ok && k.lora) {
        fprintf(stderr, "[LoRA] Merged while loading (%.0f ms in all)\n", t.ms());
    }
    return ok;
}

Qwen3LM * store_require_lm(ModelStore * s, const ModelKey & k) {
    if (auto * hit = cache_hit<Qwen3LM>(s, k)) {
        return hit;
    }
    if (s->policy == EVICT_STRICT) {
        evict_conflicts(s, k);
    } else {
        evict_same_kind_idle(s, k);
    }
    Timer     t;
    Qwen3LM * m = new Qwen3LM();
    if (!load_with_loras<Qwen3LM>(k, m, qw3lm_load, qw3lm_free)) {
        delete m;
        return nullptr;
    }
    install_entry(s, k, m, bytes_of_lm(m), "LM", del_lm);
    fprintf(stderr, "[Store] Load LM: %.0f ms\n", t.ms());
    return m;
}

Yue2NAR * store_require_nar(ModelStore * s, const ModelKey & k) {
    if (auto * hit = cache_hit<Yue2NAR>(s, k)) {
        return hit;
    }
    if (s->policy == EVICT_STRICT) {
        evict_conflicts(s, k);
    } else {
        evict_same_kind_idle(s, k);
    }
    Timer     t;
    Yue2NAR * m = new Yue2NAR();
    if (!load_with_loras<Yue2NAR>(k, m, nar_load, nar_free)) {
        delete m;
        return nullptr;
    }
    install_entry(s, k, m, bytes_of_nar(m), "NAR", del_nar);
    fprintf(stderr, "[Store] Load NAR: %.0f ms\n", t.ms());
    return m;
}

VAEGGML * store_require_vae(ModelStore * s, const ModelKey & k) {
    if (auto * hit = cache_hit<VAEGGML>(s, k)) {
        return hit;
    }
    if (s->policy == EVICT_STRICT) {
        evict_conflicts(s, k);
    }
    Timer     t;
    VAEGGML * m = new VAEGGML();
    vae_ggml_load(m, k.path.c_str());
    install_entry(s, k, m, bytes_of_vae(m), "VAE", del_vae);
    fprintf(stderr, "[Store] Load VAE: %.0f ms\n", t.ms());
    return m;
}

SheetSage2 * store_require_ss2(ModelStore * s, const ModelKey & k) {
    if (auto * hit = cache_hit<SheetSage2>(s, k)) {
        return hit;
    }
    if (s->policy == EVICT_STRICT) {
        evict_conflicts(s, k);
    }
    Timer        t;
    SheetSage2 * m = new SheetSage2();
    if (!ss2_load(m, k.path.c_str())) {
        delete m;
        return nullptr;
    }
    install_entry(s, k, m, bytes_of_ss2(m), "SS2", del_ss2);
    fprintf(stderr, "[Store] Load SS2: %.0f ms\n", t.ms());
    return m;
}

void store_release(ModelStore * s, void * handle) {
    if (!s || !handle) {
        return;
    }
    auto hit = s->handle_to_key.find(handle);
    if (hit == s->handle_to_key.end()) {
        fprintf(stderr, "[Store] WARNING: release of unknown handle %p\n", handle);
        return;
    }
    auto gpu_it = s->gpu.find(hit->second);
    if (gpu_it == s->gpu.end()) {
        fprintf(stderr, "[Store] WARNING: release of handle %p whose entry is gone\n", handle);
        s->handle_to_key.erase(hit);
        return;
    }
    GpuEntry & e = gpu_it->second;
    assert(e.refcount > 0);
    e.refcount--;
    if (e.refcount == 0 && s->policy == EVICT_STRICT) {
        fprintf(stderr, "[Store] Unload %s (%.1f MB)\n", e.label, (float) e.bytes / (1024.0f * 1024.0f));
        e.deleter(e.ptr);
        s->handle_to_key.erase(hit);
        s->gpu.erase(gpu_it);
    }
}

BPETokenizer * store_bpe(ModelStore * s, const char * lm_path) {
    std::string key = lm_path ? lm_path : "";
    auto        it  = s->bpe_by_path.find(key);
    if (it != s->bpe_by_path.end()) {
        return static_cast<BPETokenizer *>(it->second.ptr);
    }
    auto * bpe = new BPETokenizer();
    if (!load_bpe_from_gguf(bpe, lm_path)) {
        delete bpe;
        return nullptr;
    }
    CpuEntry e;
    e.ptr     = bpe;
    e.deleter = [](void * p) {
        delete static_cast<BPETokenizer *>(p);
    };
    s->bpe_by_path.emplace(key, e);
    return bpe;
}

void store_set_policy(ModelStore * s, EvictPolicy policy) {
    if (s->policy == policy) {
        return;
    }
    s->policy = policy;
    fprintf(stderr, "[Store] Policy now %s\n", policy == EVICT_STRICT ? "STRICT" : "NEVER");
    if (policy == EVICT_STRICT) {
        store_unload_idle(s);
    }
}

size_t store_unload_idle(ModelStore * s) {
    size_t freed = 0;
    for (auto it = s->gpu.begin(); it != s->gpu.end();) {
        GpuEntry & e = it->second;
        if (e.refcount > 0) {
            ++it;
            continue;
        }
        fprintf(stderr, "[Store] Unload %s (%.1f MB)\n", e.label, (float) e.bytes / (1024.0f * 1024.0f));
        freed += e.bytes;
        s->handle_to_key.erase(e.ptr);
        e.deleter(e.ptr);
        it = s->gpu.erase(it);
    }
    return freed;
}

size_t store_vram_bytes(const ModelStore * s) {
    if (!s) {
        return 0;
    }
    size_t total = 0;
    for (const auto & kv : s->gpu) {
        total += kv.second.bytes;
    }
    return total;
}

int store_gpu_module_count(const ModelStore * s) {
    if (!s) {
        return 0;
    }
    return (int) s->gpu.size();
}
