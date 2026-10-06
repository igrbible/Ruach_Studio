// test-slider-unit.cpp: one slider's correction in isolation (local addition)
//
// Feeds the same input rows to slider_delta for a few (layer, projection)
// pairs and dumps the corrections, so the adapter math is compared against a
// plain reference without the backbone's own rounding around it.
//
// usage: test-slider-unit slider.gguf strength n_layers x.bin n_rows out_prefix L:P [L:P ...]
//        x.bin holds n_rows rows of 2048 float32; P is q, k, v or o.

#include "backend.h"
#include "ggml-alloc.h"
#include "sliders.h"

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

int main(int argc, char ** argv) {
    if (argc < 8) {
        fprintf(stderr, "usage: %s slider.gguf strength n_layers x.bin n_rows out_prefix L:P ...\n", argv[0]);
        return 1;
    }
    const int in = 2048;
    int       n  = atoi(argv[5]);
    std::vector<float> x((size_t) in * n);
    FILE *             f = fopen(argv[4], "rb");
    if (!f || fread(x.data(), sizeof(float), x.size(), f) != x.size()) {
        fprintf(stderr, "cannot read %s\n", argv[4]);
        return 1;
    }
    fclose(f);

    BackendPair bp = backend_init("Unit");
    SliderSet   set;
    if (!sliders_load(&set, bp.backend, { { argv[1], (float) atof(argv[2]) } }, atoi(argv[3]))) {
        return 1;
    }
    for (int a = 7; a < argc; a++) {
        std::string spec = argv[a];
        int         l    = atoi(spec.substr(0, spec.find(':')).c_str());
        char        pc   = spec.back();
        int         p    = pc == 'q' ? SLIDER_Q : pc == 'k' ? SLIDER_K : pc == 'v' ? SLIDER_V : SLIDER_O;

        struct ggml_init_params ip  = { ggml_tensor_overhead() * 256 + ggml_graph_overhead(), NULL, true };
        struct ggml_context *   ctx = ggml_init(ip);
        struct ggml_tensor *    xt  = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, in, n);
        ggml_set_input(xt);
        struct ggml_tensor * d = slider_delta(ctx, &set, l, p, xt);
        ggml_set_output(d);
        struct ggml_cgraph * gf = ggml_new_graph(ctx);
        ggml_build_forward_expand(gf, d);
        ggml_gallocr_t alloc = ggml_gallocr_new(ggml_backend_get_default_buffer_type(bp.backend));
        ggml_gallocr_alloc_graph(alloc, gf);
        ggml_backend_tensor_set(xt, x.data(), 0, x.size() * sizeof(float));
        ggml_backend_graph_compute(bp.backend, gf);
        std::vector<float> out((size_t) ggml_nelements(d));
        ggml_backend_tensor_get(d, out.data(), 0, out.size() * sizeof(float));
        std::string path = std::string(argv[6]) + "_" + std::to_string(l) + pc + ".bin";
        FILE *      o    = fopen(path.c_str(), "wb");
        fwrite(out.data(), sizeof(float), out.size(), o);
        fclose(o);
        ggml_gallocr_free(alloc);
        ggml_free(ctx);
    }
    sliders_free(&set);
    return 0;
}
