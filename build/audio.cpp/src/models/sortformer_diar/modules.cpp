#include "engine/models/sortformer_diar/modules.h"

#include "engine/framework/modules/activation_modules.h"
#include "engine/framework/modules/primitive_modules.h"
#include "engine/framework/modules/structural_modules.h"

#include <cmath>
#include <stdexcept>

namespace engine::models::sortformer_diar {

namespace {

core::TensorValue reshape_heads(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & tensor,
    int64_t num_heads,
    int64_t head_dim) {
    return core::reshape_tensor(
        ctx,
        tensor,
        core::TensorShape::from_dims(
            {tensor.shape.dims[0], tensor.shape.dims[1], num_heads, head_dim}));
}

core::TensorValue ensure_contiguous(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & tensor) {
    return core::ensure_backend_addressable_layout(ctx, tensor);
}

}  // namespace

SortformerMaskedSelfAttentionModule::SortformerMaskedSelfAttentionModule(modules::AttentionConfig config)
    : config_(config) {
    if (config_.hidden_size <= 0 || config_.num_heads <= 0) {
        throw std::runtime_error("Sortformer masked self-attention requires positive hidden_size and num_heads");
    }
    if (config_.hidden_size % config_.num_heads != 0) {
        throw std::runtime_error("Sortformer masked self-attention hidden_size must be divisible by num_heads");
    }
}

core::TensorValue SortformerMaskedSelfAttentionModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const SortformerMaskedSelfAttentionWeights & weights,
    const core::TensorValue & attention_mask) const {
    core::validate_rank_between(input, 3, 3, "input");
    core::validate_last_dim(input, config_.hidden_size, "input");
    core::validate_rank_between(attention_mask, 2, 4, "attention_mask");
    const int64_t frames = input.shape.dims[1];
    if (attention_mask.shape.rank == 2 &&
        (attention_mask.shape.dims[0] != frames || attention_mask.shape.dims[1] != frames)) {
        throw std::runtime_error("Sortformer 2D attention mask shape must be [frames, frames]");
    }
    if (attention_mask.shape.rank == 4 &&
        (attention_mask.shape.dims[0] != input.shape.dims[0] ||
         attention_mask.shape.dims[1] != 1 ||
         attention_mask.shape.dims[2] != frames ||
         attention_mask.shape.dims[3] != frames)) {
        throw std::runtime_error("Sortformer 4D attention mask shape must be [batch, 1, frames, frames]");
    }

    const int64_t head_dim = config_.hidden_size / config_.num_heads;
    const float attn_scale = 1.0f / std::sqrt(std::sqrt(static_cast<float>(head_dim)));

    auto q = modules::LinearModule({config_.hidden_size, config_.hidden_size, weights.query.bias.has_value()})
                 .build(ctx, input, weights.query);
    auto k = modules::LinearModule({config_.hidden_size, config_.hidden_size, weights.key.bias.has_value()})
                 .build(ctx, input, weights.key);
    auto v = modules::LinearModule({config_.hidden_size, config_.hidden_size, weights.value.bias.has_value()})
                 .build(ctx, input, weights.value);

    q = reshape_heads(ctx, q, config_.num_heads, head_dim);
    k = reshape_heads(ctx, k, config_.num_heads, head_dim);
    v = reshape_heads(ctx, v, config_.num_heads, head_dim);

    auto q_heads = modules::TransposeModule({{0, 2, 1, 3}, 4}).build(ctx, q);
    auto k_heads = modules::TransposeModule({{0, 2, 1, 3}, 4}).build(ctx, k);
    auto v_heads = modules::TransposeModule({{0, 2, 1, 3}, 4}).build(ctx, v);

    q_heads = ensure_contiguous(ctx, q_heads);
    k_heads = ensure_contiguous(ctx, k_heads);
    q_heads = core::wrap_tensor(ggml_scale(ctx.ggml, q_heads.tensor, attn_scale), q_heads.shape, GGML_TYPE_F32);
    k_heads = core::wrap_tensor(ggml_scale(ctx.ggml, k_heads.tensor, attn_scale), k_heads.shape, GGML_TYPE_F32);

    auto k_transposed = modules::TransposeModule({{0, 1, 3, 2}, 4}).build(ctx, k_heads);
    auto scores = modules::MatMulModule().build(ctx, q_heads, k_transposed);
    auto attn = core::wrap_tensor(
        ggml_soft_max_ext(ctx.ggml, ensure_contiguous(ctx, scores).tensor, attention_mask.tensor, 1.0f, 0.0f),
        scores.shape,
        GGML_TYPE_F32);
    auto context = modules::MatMulModule().build(ctx, attn, v_heads);
    context = modules::TransposeModule({{0, 2, 1, 3}, 4}).build(ctx, context);
    context = ensure_contiguous(ctx, context);
    context = core::reshape_tensor(
        ctx,
        context,
        core::TensorShape::from_dims({input.shape.dims[0], input.shape.dims[1], config_.hidden_size}));
    return modules::LinearModule({config_.hidden_size, config_.hidden_size, weights.output.bias.has_value()})
        .build(ctx, context, weights.output);
}

SortformerPostNormTransformerEncoderBlockModule::SortformerPostNormTransformerEncoderBlockModule(
    int64_t hidden_size,
    int64_t num_heads,
    int64_t intermediate_size,
    float eps)
    : hidden_size_(hidden_size),
      num_heads_(num_heads),
      intermediate_size_(intermediate_size),
      eps_(eps) {
    if (hidden_size_ <= 0 || num_heads_ <= 0 || intermediate_size_ <= 0) {
        throw std::runtime_error("Sortformer transformer block dimensions must be positive");
    }
}

core::TensorValue SortformerPostNormTransformerEncoderBlockModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorValue & attention_mask,
    const SortformerTransformerBlockWeights & weights) const {
    auto self_attn = SortformerMaskedSelfAttentionModule({hidden_size_, num_heads_, true}).build(
        ctx,
        input,
        weights.self_attention,
        attention_mask);
    auto attn_residual = modules::AddModule().build(ctx, input, self_attn);
    auto attn_norm = modules::LayerNormModule({hidden_size_, eps_, true, true}).build(
        ctx,
        attn_residual,
        weights.self_attention_norm);

    auto ff = modules::LinearModule({hidden_size_, intermediate_size_, weights.feed_forward_fc1.bias.has_value()})
                  .build(ctx, attn_norm, weights.feed_forward_fc1);
    ff = modules::ReluModule().build(ctx, ff);
    ff = modules::LinearModule({intermediate_size_, hidden_size_, weights.feed_forward_fc2.bias.has_value()})
             .build(ctx, ff, weights.feed_forward_fc2);
    ff = modules::AddModule().build(ctx, attn_norm, ff);
    return modules::LayerNormModule({hidden_size_, eps_, true, true}).build(
        ctx,
        ff,
        weights.feed_forward_norm);
}

SortformerPostNormTransformerStackModule::SortformerPostNormTransformerStackModule(
    int64_t hidden_size,
    int64_t num_heads,
    int64_t intermediate_size,
    int64_t num_layers,
    float eps)
    : hidden_size_(hidden_size),
      num_heads_(num_heads),
      intermediate_size_(intermediate_size),
      num_layers_(num_layers),
      eps_(eps) {
    if (num_layers_ <= 0) {
        throw std::runtime_error("Sortformer transformer stack requires positive num_layers");
    }
}

core::TensorValue SortformerPostNormTransformerStackModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorValue & attention_mask,
    const SortformerTransformerStackWeights & weights) const {
    if (static_cast<int64_t>(weights.layers.size()) != num_layers_) {
        throw std::runtime_error("Sortformer transformer stack layer count mismatch");
    }
    auto output = input;
    for (const auto & layer_weights : weights.layers) {
        output = SortformerPostNormTransformerEncoderBlockModule(
            hidden_size_, num_heads_, intermediate_size_, eps_)
                     .build(ctx, output, attention_mask, layer_weights);
    }
    return output;
}

}  // namespace engine::models::sortformer_diar
