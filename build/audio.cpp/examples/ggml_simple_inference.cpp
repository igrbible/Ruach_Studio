#include "ggml.h"
#include "ggml-cpu.h"

#include <cstdint>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

void set_tensor_row_major(struct ggml_tensor * tensor, const std::vector<float> & values) {
    if (values.size() != ggml_nelements(tensor)) {
        throw std::runtime_error("tensor data size mismatch");
    }

    for (int64_t i = 0; i < static_cast<int64_t>(values.size()); ++i) {
        ggml_set_f32_1d(tensor, static_cast<int>(i), values[static_cast<size_t>(i)]);
    }
}

std::vector<float> read_tensor(const struct ggml_tensor * tensor) {
    std::vector<float> values(static_cast<size_t>(ggml_nelements(tensor)));
    for (int64_t i = 0; i < static_cast<int64_t>(values.size()); ++i) {
        values[static_cast<size_t>(i)] = ggml_get_f32_1d(tensor, static_cast<int>(i));
    }
    return values;
}

void print_tensor(const std::string & name, const struct ggml_tensor * tensor) {
    const auto values = read_tensor(tensor);
    const int64_t cols = tensor->ne[0];
    const int64_t rows = tensor->ne[1];

    std::cout << name << " (" << rows << "x" << cols << ")\n";
    for (int64_t row = 0; row < rows; ++row) {
        std::cout << "  [";
        for (int64_t col = 0; col < cols; ++col) {
            const auto index = static_cast<size_t>(row * cols + col);
            std::cout << std::fixed << std::setprecision(4) << values[index];
            if (col + 1 < cols) {
                std::cout << ", ";
            }
        }
        std::cout << "]\n";
    }
}

} // namespace

int main() {
    ggml_time_init();
    ggml_cpu_init();

    constexpr size_t memory_size = 1024 * 1024;
    struct ggml_init_params params = {
        /*.mem_size   =*/ memory_size,
        /*.mem_buffer =*/ nullptr,
        /*.no_alloc   =*/ false,
    };

    struct ggml_context * ctx = ggml_init(params);
    if (ctx == nullptr) {
        std::cerr << "Failed to initialize ggml context.\n";
        return 1;
    }

    // Tiny 3 -> 4 -> 2 classifier with hard-coded weights.
    struct ggml_tensor * input = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 3, 1);
    struct ggml_tensor * w1    = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 3, 4);
    struct ggml_tensor * b1    = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 4, 1);
    struct ggml_tensor * w2    = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 4, 2);
    struct ggml_tensor * b2    = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, 2, 1);

    set_tensor_row_major(input, {
        0.6f, -1.2f, 0.3f
    });

    set_tensor_row_major(w1, {
         0.5f, -0.3f,  0.8f,
        -0.2f,  0.4f,  0.1f,
         0.7f,  0.2f, -0.5f,
        -0.4f,  0.9f,  0.2f
    });

    set_tensor_row_major(b1, {
        0.1f, -0.2f, 0.05f, 0.3f
    });

    set_tensor_row_major(w2, {
         1.2f, -0.3f,  0.5f,  0.1f,
        -0.4f,  0.6f,  0.2f,  1.1f
    });

    set_tensor_row_major(b2, {
        -0.1f, 0.2f
    });

    struct ggml_tensor * hidden_linear = ggml_add(ctx, ggml_mul_mat(ctx, w1, input), b1);
    struct ggml_tensor * hidden_relu   = ggml_relu(ctx, hidden_linear);
    struct ggml_tensor * logits        = ggml_add(ctx, ggml_mul_mat(ctx, w2, hidden_relu), b2);
    struct ggml_tensor * probs         = ggml_soft_max(ctx, logits);

    struct ggml_cgraph * graph = ggml_new_graph(ctx);
    ggml_build_forward_expand(graph, probs);
    ggml_graph_compute_with_ctx(ctx, graph, 1);

    print_tensor("input", input);
    print_tensor("hidden_relu", hidden_relu);
    print_tensor("logits", logits);
    print_tensor("probabilities", probs);

    const auto probabilities = read_tensor(probs);
    size_t best_class = 0;
    for (size_t i = 1; i < probabilities.size(); ++i) {
        if (probabilities[i] > probabilities[best_class]) {
            best_class = i;
        }
    }

    std::cout << "predicted_class = " << best_class << '\n';

    ggml_free(ctx);
    return 0;
}
