// test-lora (local addition): LoRA harness for tools/test_lora_parity.py.
//   test-lora catalog <lora-dir>
//       the catalog as JSON, the same fields as /props loras
//   test-lora merge <model.gguf> <lora-dir> <out-dir> <id>:<music>:<sound>[,...] <tensor>...
//       merges the set into each named weight, writes it as raw little-endian F32
//       (dequantized when the model is quantized) to <out-dir>/<tensor>.f32
//   test-lora dump <model.gguf> <out-dir> <tensor>...
//       the weights as stored, dequantized, to <out-dir>/<tensor>.plain.f32
//   test-lora time <model.gguf> <lora-dir> <id>:<music>:<sound>[,...]
//       merges every weight the set touches, in the model's own type, and times it
#include "gguf-weights.h"

#include <chrono>
#include <cstdio>
#include <string>
#include <vector>

static bool parse_set(const std::string & dir, const std::string & spec, std::vector<std::tuple<std::string, double, double>> * out) {
    size_t at = 0;
    while (at <= spec.size()) {
        size_t      comma = spec.find(',', at);
        std::string item  = spec.substr(at, comma == std::string::npos ? std::string::npos : comma - at);
        size_t      c2 = item.rfind(':'), c1 = c2 == std::string::npos ? c2 : item.rfind(':', c2 - 1);
        if (c1 == std::string::npos) {
            fprintf(stderr, "bad set item '%s' (id:music:sound)\n", item.c_str());
            return false;
        }
        out->emplace_back(dir + "/" + item.substr(0, c1), atof(item.substr(c1 + 1, c2 - c1 - 1).c_str()),
                          atof(item.substr(c2 + 1).c_str()));
        if (comma == std::string::npos) {
            break;
        }
        at = comma + 1;
    }
    return true;
}

static int open_set(const char * model, const char * dir, const char * spec, GGUFModel * gf, LoraSet * set) {
    std::vector<std::tuple<std::string, double, double>> list;
    std::string                                          error;
    if (!parse_set(dir, spec, &list) || !lora_set_open(list, set, &error)) {
        fprintf(stderr, "open: %s\n", error.c_str());
        return 1;
    }
    if (!gf_load(gf, model)) {
        return 1;
    }
    if (!lora_bind(set, gf_lora_rows, (void *) gf, &error)) {
        fprintf(stderr, "bind: %s\n", error.c_str());
        return 1;
    }
    return 0;
}

int main(int argc, char ** argv) {
    std::string mode = argc > 1 ? argv[1] : "";
    if (mode == "catalog" && argc == 3) {
        yyjson_mut_doc * doc = yyjson_mut_doc_new(nullptr);
        yyjson_mut_val * list = yyjson_mut_arr(doc);
        for (const LoraInfo & l : lora_catalog(argv[2])) {
            yyjson_mut_val * item = yyjson_mut_obj(doc);
            yyjson_mut_obj_add_strcpy(doc, item, "id", l.id.c_str());
            yyjson_mut_obj_add_strcpy(doc, item, "name", l.name.c_str());
            yyjson_mut_obj_add_real(doc, item, "size_mb", l.size_mb);
            yyjson_mut_val * halves = yyjson_mut_arr(doc);
            if (l.ar) {
                yyjson_mut_arr_add_str(doc, halves, "ar");
            }
            if (l.nar) {
                yyjson_mut_arr_add_str(doc, halves, "nar");
            }
            yyjson_mut_obj_add_val(doc, item, "halves", halves);
            if (!l.error.empty()) {
                yyjson_mut_obj_add_strcpy(doc, item, "error", l.error.c_str());
            } else {
                yyjson_mut_obj_add_int(doc, item, "rank", l.rank);
                yyjson_mut_obj_add_strcpy(doc, item, "layout", l.layout.c_str());
                yyjson_mut_obj_add_int(doc, item, "pairs", l.pairs);
                yyjson_mut_obj_add_strcpy(doc, item, "trigger", l.trigger.c_str());
                yyjson_mut_obj_add_strcpy(doc, item, "hint", l.hint.c_str());
                yyjson_mut_obj_add_strcpy(doc, item, "mode", l.mode.c_str());
            }
            yyjson_mut_arr_append(list, item);
        }
        yyjson_mut_doc_set_root(doc, list);
        char * json = yyjson_mut_write(doc, 0, nullptr);
        printf("%s\n", json);
        free(json);
        yyjson_mut_doc_free(doc);
        return 0;
    }
    if (mode == "merge" && argc >= 7) {
        GGUFModel gf;
        LoraSet   set;
        if (open_set(argv[2], argv[3], argv[5], &gf, &set)) {
            return 1;
        }
        g_gf_lora = &set;
        for (int i = 6; i < argc; i++) {
            std::string          name = argv[i];
            struct ggml_tensor * src  = ggml_get_tensor(gf.meta, name.c_str());
            if (!src) {
                fprintf(stderr, "no tensor %s\n", name.c_str());
                return 1;
            }
            WeightCtx wctx;
            wctx_init(&wctx, 4);
            size_t       bytes  = 0;
            enum ggml_type type = gf_lora_type(src->type);
            const void * merged = gf_lora_stage(&wctx, gf, name, src, gf_get_data(gf, name.c_str()), type, &bytes, type != src->type);
            if (!merged) {
                fprintf(stderr, "%s: not merged (%s)\n", name.c_str(), g_gf_lora_error.empty() ? "no LoRA touches it" : g_gf_lora_error.c_str());
                return 1;
            }
            int64_t            n = ggml_nelements(src);
            std::vector<float> f32((size_t) n);
            if (type == GGML_TYPE_F32) {
                memcpy(f32.data(), merged, (size_t) n * sizeof(float));
            } else {
                ggml_get_type_traits(type)->to_float(merged, f32.data(), n);
            }
            std::string path = std::string(argv[4]) + "/" + name + ".f32";
            FILE *      f    = fopen(path.c_str(), "wb");
            fwrite(f32.data(), sizeof(float), f32.size(), f);
            fclose(f);
            printf("{\"name\": \"%s\", \"type\": \"%s\", \"stored\": \"%s\", \"elements\": %lld}\n", name.c_str(), ggml_type_name(src->type), ggml_type_name(type), (long long) n);
            ggml_free(wctx.ctx);
        }
        gf_close(&gf);
        return 0;
    }
    if (mode == "dump" && argc >= 5) {   // the weights as they are, dequantized, for a baseline
        GGUFModel gf;
        if (!gf_load(&gf, argv[2])) {
            return 1;
        }
        for (int i = 4; i < argc; i++) {
            struct ggml_tensor * src = ggml_get_tensor(gf.meta, argv[i]);
            if (!src) {
                fprintf(stderr, "no tensor %s\n", argv[i]);
                return 1;
            }
            int64_t            n = ggml_nelements(src);
            std::vector<float> f32((size_t) n);
            if (src->type == GGML_TYPE_F32) {
                memcpy(f32.data(), gf_get_data(gf, argv[i]), (size_t) n * sizeof(float));
            } else {
                ggml_get_type_traits(src->type)->to_float(gf_get_data(gf, argv[i]), f32.data(), n);
            }
            std::string path = std::string(argv[3]) + "/" + argv[i] + ".plain.f32";
            FILE *      f    = fopen(path.c_str(), "wb");
            fwrite(f32.data(), sizeof(float), f32.size(), f);
            fclose(f);
        }
        gf_close(&gf);
        return 0;
    }
    if (mode == "time" && argc == 5) {
        GGUFModel gf;
        LoraSet   set;
        if (open_set(argv[2], argv[3], argv[4], &gf, &set)) {
            return 1;
        }
        g_gf_lora  = &set;
        auto   t0  = std::chrono::steady_clock::now();
        size_t n   = 0, bytes_all = 0;
        for (const auto & kv : set.index) {
            struct ggml_tensor * src = ggml_get_tensor(gf.meta, kv.first.c_str());
            WeightCtx            wctx;
            wctx_init(&wctx, 4);
            size_t bytes = 0;
            enum ggml_type type = gf_lora_type(src->type);
            if (!gf_lora_stage(&wctx, gf, kv.first, src, gf_get_data(gf, kv.first.c_str()), type, &bytes, type != src->type)) {
                fprintf(stderr, "%s: %s\n", kv.first.c_str(), g_gf_lora_error.c_str());
                return 1;
            }
            n++;
            bytes_all += bytes;
            ggml_free(wctx.ctx);
        }
        double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        printf("{\"weights\": %zu, \"mb\": %.1f, \"seconds\": %.2f}\n", n, (double) bytes_all / 1e6, s);
        gf_close(&gf);
        return 0;
    }
    fprintf(stderr, "usage: test-lora catalog <dir> | merge <gguf> <dir> <out> <set> <tensor>... | time <gguf> <dir> <set>\n");
    return 2;
}
