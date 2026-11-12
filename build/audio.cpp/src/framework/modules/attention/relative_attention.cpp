#include "attention_internal.h"

namespace engine::modules {

using namespace attention::internal;

RelativeSelfAttentionModule::RelativeSelfAttentionModule(RelativeAttentionConfig config) : config_(config) {
    validate_relative_attention_config(config_);
}

const RelativeAttentionConfig & RelativeSelfAttentionModule::config() const noexcept {
    return config_;
}

core::TensorValue RelativeSelfAttentionModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const std::optional<core::TensorValue> & pos_emb,
    const RelativeAttentionWeights & weights,
    const std::optional<core::TensorValue> & attention_mask,
    const std::optional<core::TensorValue> & query_keep_mask,
    const std::optional<core::TensorValue> & projected_pos_emb) const {
    if (config_.left_context >= 0 || config_.right_context >= 0) {
        if (!pos_emb.has_value()) {
            throw std::runtime_error("Local relative attention requires pos_emb");
        }
        return build_windowed_relative_attention_impl(
            ctx,
            input,
            input,
            *pos_emb,
            config_,
            require_relative_attention_weights(weights, config_.use_bias),
            attention_mask,
            query_keep_mask);
    }
    return build_global_relative_attention_impl(
        ctx,
        input,
        input,
        pos_emb,
        config_,
        require_relative_attention_weights(weights, config_.use_bias),
        attention_mask,
        query_keep_mask,
        projected_pos_emb);
}

StreamingRelativeSelfAttentionModule::StreamingRelativeSelfAttentionModule(RelativeAttentionConfig config) : config_(config) {
    validate_relative_attention_config(config_);
}

const RelativeAttentionConfig & StreamingRelativeSelfAttentionModule::config() const noexcept {
    return config_;
}

StreamingAttentionOutputs StreamingRelativeSelfAttentionModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorValue & pos_emb,
    const RelativeAttentionWeights & weights,
    const std::optional<core::TensorValue> & prefix_key,
    const std::optional<core::TensorValue> & prefix_value,
    const std::optional<core::TensorValue> & attention_mask) const {
    validate_sequence_input(input, config_.hidden_size, "input");
    if (prefix_key.has_value() != prefix_value.has_value()) {
        throw std::runtime_error("Streaming relative self-attention requires both prefix_key and prefix_value or neither");
    }
    if (prefix_key.has_value()) {
        validate_sequence_input(*prefix_key, config_.hidden_size, "prefix_key");
        validate_sequence_input(*prefix_value, config_.hidden_size, "prefix_value");
    }

    const LinearModule q_proj({config_.hidden_size, config_.hidden_size, config_.use_bias});
    const LinearModule k_proj({config_.hidden_size, config_.hidden_size, config_.use_bias});
    const LinearModule v_proj({config_.hidden_size, config_.hidden_size, config_.use_bias});
    const int64_t head_dim = config_.hidden_size / config_.num_heads;
    const float scale = 1.0f / std::sqrt(static_cast<float>(head_dim));
    const LinearModule p_proj({config_.hidden_size, config_.hidden_size, false});
    const LinearModule out_proj({config_.hidden_size, config_.hidden_size, config_.use_bias});
    const MatMulModule matmul;

    auto all_hidden = prefix_key.has_value() ? ConcatModule({1}).build(ctx, *prefix_key, input) : input;
    auto q = q_proj.build(ctx, input, LinearWeights{weights.attention.q_weight, weights.attention.q_bias});
    auto k = k_proj.build(ctx, all_hidden, LinearWeights{weights.attention.k_weight, weights.attention.k_bias});
    auto v = v_proj.build(ctx, all_hidden, LinearWeights{weights.attention.v_weight, weights.attention.v_bias});
    auto p = p_proj.build(ctx, pos_emb, LinearWeights{weights.pos_weight, std::nullopt});

    q = reshape_heads(ctx, q, config_.num_heads, head_dim);
    k = reshape_heads(ctx, k, config_.num_heads, head_dim);
    v = reshape_heads(ctx, v, config_.num_heads, head_dim);
    p = reshape_heads(ctx, p, config_.num_heads, head_dim);

    auto q_heads = permute_tensor(ctx, q, {0, 2, 1, 3});
    auto k_heads = permute_tensor(ctx, k, {0, 2, 1, 3});
    auto v_heads = permute_tensor(ctx, v, {0, 2, 1, 3});
    auto p_heads = permute_tensor(ctx, p, {0, 2, 1, 3});
    if (p_heads.shape.dims[0] == 1 && q_heads.shape.dims[0] > 1) {
        p_heads = RepeatModule(RepeatConfig{core::TensorShape::from_dims(
            {q_heads.shape.dims[0], p_heads.shape.dims[1], p_heads.shape.dims[2], p_heads.shape.dims[3]})}).build(ctx, p_heads);
    }

    if (config_.left_context >= 0 || config_.right_context >= 0) {
        auto output = build_windowed_relative_attention_impl(
            ctx,
            input,
            all_hidden,
            pos_emb,
            config_,
            require_relative_attention_weights(weights, config_.use_bias),
            attention_mask,
            std::nullopt);
        auto next_cache = update_hidden_cache(ctx, input, prefix_key, config_.cache_drop_size);
        return {output, next_cache, next_cache};
    }

    const int64_t key_frames = k_heads.shape.dims[2];
    const int64_t required_pos_frames = 2 * key_frames - 1;
    if (pos_emb.shape.dims[1] != required_pos_frames) {
        throw std::runtime_error("Streaming relative attention expects pos_emb frames == 2 * key_frames - 1");
    }

    auto q_u = add_attention_bias(ctx, q_heads, weights.pos_bias_u, config_.num_heads, head_dim);
    auto q_v = add_attention_bias(ctx, q_heads, weights.pos_bias_v, config_.num_heads, head_dim);
    auto k_transposed = permute_tensor(ctx, k_heads, {0, 1, 3, 2});
    auto p_transposed = permute_tensor(ctx, p_heads, {0, 1, 3, 2});
    auto matrix_ac = matmul.build(ctx, q_u, k_transposed);
    auto matrix_bd = matmul.build(ctx, q_v, p_transposed);
    matrix_bd = relative_shift(ctx, matrix_bd);
    matrix_bd = SliceModule({3, 0, key_frames}).build(ctx, matrix_bd);
    auto scores = core::wrap_tensor(ggml_add(ctx.ggml, matrix_ac.tensor, matrix_bd.tensor), matrix_ac.shape, GGML_TYPE_F32);

    core::TensorValue attn;
    if (attention_mask.has_value()) {
        attn = core::wrap_tensor(
            ggml_soft_max_ext(ctx.ggml, ensure_contiguous_layout(ctx, scores).tensor, attention_mask->tensor, scale, 0.0f),
            scores.shape,
            GGML_TYPE_F32);
    } else {
        scores = core::wrap_tensor(ggml_scale(ctx.ggml, scores.tensor, scale), scores.shape, GGML_TYPE_F32);
        attn = core::wrap_tensor(ggml_soft_max(ctx.ggml, ensure_contiguous_layout(ctx, scores).tensor), scores.shape, GGML_TYPE_F32);
    }

    auto context = matmul.build(ctx, attn, v_heads);
    context = permute_tensor(ctx, context, {0, 2, 1, 3});
    context = ensure_contiguous_layout(ctx, context);
    context = core::reshape_tensor(ctx, context, core::TensorShape::from_dims({input.shape.dims[0], input.shape.dims[1], config_.hidden_size}));
    auto output = out_proj.build(ctx, context, LinearWeights{weights.attention.out_weight, weights.attention.out_bias});
    auto next_cache = update_hidden_cache(ctx, input, prefix_key, config_.cache_drop_size);
    return {output, next_cache, next_cache};
}

}  // namespace engine::modules
