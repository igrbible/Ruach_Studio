#include "engine/framework/modules/attention/longformer_attention.h"

#include "attention_internal.h"
#include "../tensor_layout_utils.h"

#include "ggml.h"

#include <cmath>
#include <stdexcept>
#include <vector>

namespace engine::modules {

namespace adetail = engine::modules::attention::internal;

namespace {

constexpr float kInfVal = 10000.0f;

void validate_config(const RelativeAttentionConfig & config) {
    if (config.hidden_size <= 0 || config.num_heads <= 0) {
        throw std::runtime_error("LongformerRelativeSelfAttentionGpuModule requires positive hidden_size and num_heads");
    }
    if (config.hidden_size % config.num_heads != 0) {
        throw std::runtime_error("LongformerRelativeSelfAttentionGpuModule hidden_size must be divisible by num_heads");
    }
    if (config.left_context < 0 || config.right_context < 0) {
        throw std::runtime_error("LongformerRelativeSelfAttentionGpuModule requires non-negative attention context");
    }
}

core::TensorShape flatten_to_matrix_shape(const core::TensorShape & shape) {
    if (shape.rank == 1) {
        return core::TensorShape::from_dims({1, shape.last_dim()});
    }
    return core::TensorShape::from_dims({shape.prefix_elements(), shape.last_dim()});
}

core::TensorValue linear_native(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorValue & weight,
    const std::optional<core::TensorValue> & bias,
    int64_t out_features) {
    auto contiguous_input = tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, input);
    const auto matrix_input_shape = flatten_to_matrix_shape(contiguous_input.shape);
    auto matrix_input = core::reshape_tensor(ctx, contiguous_input, matrix_input_shape);
    auto projected = core::wrap_tensor(
        ggml_mul_mat(ctx.ggml, weight.tensor, matrix_input.tensor),
        core::TensorShape::from_dims({matrix_input_shape.at(0), out_features}),
        GGML_TYPE_F32);
    if (bias.has_value()) {
        auto bias_view = core::reshape_tensor(ctx, *bias, core::TensorShape::from_dims({1, out_features}));
        auto bias_rep = core::wrap_tensor(ggml_repeat(ctx.ggml, bias_view.tensor, projected.tensor), projected.shape, GGML_TYPE_F32);
        projected = core::wrap_tensor(ggml_add(ctx.ggml, projected.tensor, bias_rep.tensor), projected.shape, GGML_TYPE_F32);
    }
    return core::reshape_tensor(ctx, projected, input.shape.with_last_dim(out_features));
}

core::TensorValue transpose_last_two(core::ModuleBuildContext & ctx, const core::TensorValue & value) {
    std::array<int, core::kMaxTensorRank> axes = {0, 1, 2, 3};
    const size_t last = value.shape.rank - 1;
    const size_t second_last = value.shape.rank - 2;
    axes[second_last] = static_cast<int>(last);
    axes[last] = static_cast<int>(second_last);
    return adetail::permute_tensor(ctx, value, axes);
}

core::TensorValue matmul(core::ModuleBuildContext & ctx, const core::TensorValue & lhs, const core::TensorValue & rhs) {
    const size_t rank = lhs.shape.rank;
    for (size_t i = 0; i + 2 < rank; ++i) {
        if (lhs.shape.dims[i] != rhs.shape.dims[i]) {
            throw std::runtime_error("Longformer GPU matmul batch dimensions must match");
        }
    }
    if (lhs.shape.dims[rank - 1] != rhs.shape.dims[rank - 2]) {
        throw std::runtime_error("Longformer GPU matmul inner dimensions must match");
    }
    auto rhs_t = tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, transpose_last_two(ctx, rhs));
    auto out_shape = lhs.shape;
    out_shape.dims[rank - 1] = rhs.shape.dims[rank - 1];
    return core::wrap_tensor(ggml_mul_mat(ctx.ggml, rhs_t.tensor, lhs.tensor), out_shape, GGML_TYPE_F32);
}

core::TensorValue slice_axis(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    int axis,
    int64_t start,
    int64_t length) {
    return SliceModule({axis, start, length}).build(ctx, input);
}

core::TensorValue concat_axis(
    core::ModuleBuildContext & ctx,
    int axis,
    const core::TensorValue & lhs,
    const core::TensorValue & rhs) {
    return ConcatModule({axis}).build(ctx, lhs, rhs);
}

core::TensorValue repeat_to_shape(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorShape & output_shape) {
    return RepeatModule({output_shape}).build(ctx, input);
}

core::TensorValue first_element_like(core::ModuleBuildContext & ctx, const core::TensorValue & input) {
    core::TensorShape shape = input.shape;
    for (size_t i = 0; i < shape.rank; ++i) {
        shape.dims[i] = 1;
    }
    return core::wrap_tensor(
        ggml_view_4d(
            ctx.ggml,
            input.tensor,
            1,
            1,
            1,
            1,
            input.tensor->nb[1],
            input.tensor->nb[2],
            input.tensor->nb[3],
            0),
        shape,
        input.type);
}

core::TensorValue zero_tensor_like(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorShape & output_shape) {
    auto seed = first_element_like(ctx, input);
    auto repeated = repeat_to_shape(ctx, seed, output_shape);
    return core::wrap_tensor(ggml_scale(ctx.ggml, repeated.tensor, 0.0f), output_shape, GGML_TYPE_F32);
}

core::TensorValue constant_tensor_like(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorShape & output_shape,
    float value) {
    auto zeros = zero_tensor_like(ctx, input, output_shape);
    auto ones = core::wrap_tensor(ggml_exp(ctx.ggml, zeros.tensor), output_shape, GGML_TYPE_F32);
    return core::wrap_tensor(ggml_scale(ctx.ggml, ones.tensor, value), output_shape, GGML_TYPE_F32);
}

core::TensorValue ones_like(core::ModuleBuildContext & ctx, const core::TensorValue & input) {
    auto zeros = core::wrap_tensor(ggml_scale(ctx.ggml, input.tensor, 0.0f), input.shape, GGML_TYPE_F32);
    return core::wrap_tensor(ggml_exp(ctx.ggml, zeros.tensor), input.shape, GGML_TYPE_F32);
}

core::TensorValue pad_axis(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    int axis,
    int64_t left,
    int64_t right) {
    std::array<int32_t, 4> lp = {0, 0, 0, 0};
    std::array<int32_t, 4> rp = {0, 0, 0, 0};
    const int ggml_axis = core::logical_axis_to_ggml_axis(input.shape.rank, axis);
    lp[ggml_axis] = static_cast<int32_t>(left);
    rp[ggml_axis] = static_cast<int32_t>(right);
    auto output_shape = input.shape;
    output_shape.dims[axis] += left + right;
    return core::wrap_tensor(
        ggml_pad_ext(ctx.ggml, input.tensor, lp[0], rp[0], lp[1], rp[1], lp[2], rp[2], lp[3], rp[3]),
        output_shape,
        input.type);
}

core::TensorValue merge_batch_head(core::ModuleBuildContext & ctx, const core::TensorValue & input) {
    return core::reshape_tensor(
        ctx,
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, input),
        core::TensorShape::from_dims({
            input.shape.dims[0] * input.shape.dims[1],
            input.shape.dims[2],
            input.shape.dims[3],
        }));
}

core::TensorValue chunk_overlap(core::ModuleBuildContext & ctx, const core::TensorValue & input, int64_t w) {
    const int64_t bh = input.shape.dims[0];
    const int64_t seqlen = input.shape.dims[1];
    const int64_t dim = input.shape.dims[2];
    const int64_t chunk_count = seqlen / w - 1;
    auto chunk0 = slice_axis(ctx, input, 1, 0, 2 * w);
    auto result = core::reshape_tensor(ctx, chunk0, core::TensorShape::from_dims({bh, 1, 2 * w, dim}));
    for (int64_t chunk_idx = 1; chunk_idx < chunk_count; ++chunk_idx) {
        auto chunk = slice_axis(ctx, input, 1, chunk_idx * w, 2 * w);
        chunk = core::reshape_tensor(ctx, chunk, core::TensorShape::from_dims({bh, 1, 2 * w, dim}));
        result = concat_axis(ctx, 1, result, chunk);
    }
    return result;
}

core::TensorValue skew(core::ModuleBuildContext & ctx, const core::TensorValue & input, float padding_value) {
    auto padded = pad_axis(ctx, input, 2, 0, 1);
    if (padding_value != 0.0f) {
        throw std::runtime_error("Longformer GPU skew only supports zero padding");
    }
    return core::reshape_tensor(
        ctx,
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, padded),
        core::TensorShape::from_dims({input.shape.dims[0], input.shape.dims[1], input.shape.dims[2], input.shape.dims[3] + 1}));
}

core::TensorValue skew2(core::ModuleBuildContext & ctx, const core::TensorValue & input) {
    const int64_t m = input.shape.dims[2];
    const int64_t l = input.shape.dims[3];
    auto padded = pad_axis(ctx, input, 3, 0, m + 1);
    auto flat = core::reshape_tensor(
        ctx,
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, padded),
        core::TensorShape::from_dims({input.shape.dims[0], input.shape.dims[1], m * (l + m + 1)}));
    auto trimmed = slice_axis(ctx, flat, 2, 0, m * (l + m));
    auto reshaped = core::reshape_tensor(
        ctx,
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, trimmed),
        core::TensorShape::from_dims({input.shape.dims[0], input.shape.dims[1], m, l + m}));
    return slice_axis(ctx, reshaped, 3, 0, l + m - 1);
}

core::TensorValue build_beginning_invalid_mask(core::ModuleBuildContext & ctx, int64_t w) {
    auto rows = core::wrap_tensor(ggml_arange(ctx.ggml, 0.0f, static_cast<float>(w), 1.0f), core::TensorShape::from_dims({w}), GGML_TYPE_F32);
    auto cols = core::wrap_tensor(ggml_arange(ctx.ggml, 0.0f, static_cast<float>(w + 1), 1.0f), core::TensorShape::from_dims({w + 1}), GGML_TYPE_F32);
    auto row4 = core::reshape_tensor(ctx, rows, core::TensorShape::from_dims({1, 1, w, 1}));
    auto col4 = core::reshape_tensor(ctx, cols, core::TensorShape::from_dims({1, 1, 1, w + 1}));
    auto row_rep = repeat_to_shape(ctx, row4, core::TensorShape::from_dims({1, 1, w, w + 1}));
    auto col_rep = repeat_to_shape(ctx, col4, core::TensorShape::from_dims({1, 1, w, w + 1}));
    auto sum = core::wrap_tensor(ggml_add(ctx.ggml, row_rep.tensor, col_rep.tensor), row_rep.shape, GGML_TYPE_F32);
    auto ones = ones_like(ctx, sum);
    auto limit = core::wrap_tensor(ggml_scale(ctx.ggml, ones.tensor, static_cast<float>(w) - 0.5f), ones.shape, GGML_TYPE_F32);
    auto expr = core::wrap_tensor(ggml_sub(ctx.ggml, limit.tensor, sum.tensor), sum.shape, GGML_TYPE_F32);
    auto invalid = core::wrap_tensor(ggml_step(ctx.ggml, expr.tensor), expr.shape, GGML_TYPE_F32);
    auto mask_ones = ones_like(ctx, invalid);
    auto valid = core::wrap_tensor(ggml_sub(ctx.ggml, mask_ones.tensor, invalid.tensor), invalid.shape, GGML_TYPE_F32);
    return core::wrap_tensor(ggml_log(ctx.ggml, valid.tensor), valid.shape, GGML_TYPE_F32);
}

core::TensorValue build_ending_invalid_mask(core::ModuleBuildContext & ctx, int64_t w) {
    auto rows = core::wrap_tensor(ggml_arange(ctx.ggml, 0.0f, static_cast<float>(w), 1.0f), core::TensorShape::from_dims({w}), GGML_TYPE_F32);
    auto cols = core::wrap_tensor(ggml_arange(ctx.ggml, 0.0f, static_cast<float>(w + 1), 1.0f), core::TensorShape::from_dims({w + 1}), GGML_TYPE_F32);
    auto row4 = core::reshape_tensor(ctx, rows, core::TensorShape::from_dims({1, 1, w, 1}));
    auto col4 = core::reshape_tensor(ctx, cols, core::TensorShape::from_dims({1, 1, 1, w + 1}));
    auto row_rep = repeat_to_shape(ctx, row4, core::TensorShape::from_dims({1, 1, w, w + 1}));
    auto col_rep = repeat_to_shape(ctx, col4, core::TensorShape::from_dims({1, 1, w, w + 1}));
    auto sum = core::wrap_tensor(ggml_add(ctx.ggml, row_rep.tensor, col_rep.tensor), row_rep.shape, GGML_TYPE_F32);
    auto ones = ones_like(ctx, sum);
    auto limit = core::wrap_tensor(ggml_scale(ctx.ggml, ones.tensor, static_cast<float>(w) - 0.5f), ones.shape, GGML_TYPE_F32);
    auto expr = core::wrap_tensor(ggml_sub(ctx.ggml, sum.tensor, limit.tensor), sum.shape, GGML_TYPE_F32);
    auto invalid = core::wrap_tensor(ggml_step(ctx.ggml, expr.tensor), expr.shape, GGML_TYPE_F32);
    auto mask_ones = ones_like(ctx, invalid);
    auto valid = core::wrap_tensor(ggml_sub(ctx.ggml, mask_ones.tensor, invalid.tensor), invalid.shape, GGML_TYPE_F32);
    return core::wrap_tensor(ggml_log(ctx.ggml, valid.tensor), valid.shape, GGML_TYPE_F32);
}

core::TensorValue mask_invalid_locations(core::ModuleBuildContext & ctx, const core::TensorValue & input, int64_t w) {
    const int64_t seq_len = input.shape.dims[2];
    auto begin_mask = build_beginning_invalid_mask(ctx, w);
    begin_mask = pad_axis(ctx, begin_mask, 2, 0, seq_len - w);
    begin_mask = pad_axis(ctx, begin_mask, 3, 0, w);
    auto end_mask = build_ending_invalid_mask(ctx, w);
    end_mask = pad_axis(ctx, end_mask, 2, seq_len - w, 0);
    end_mask = pad_axis(ctx, end_mask, 3, w, 0);
    auto full_mask = core::wrap_tensor(ggml_add(ctx.ggml, begin_mask.tensor, end_mask.tensor), begin_mask.shape, GGML_TYPE_F32);
    auto full_mask_rep = repeat_to_shape(ctx, full_mask, input.shape);
    return core::wrap_tensor(ggml_add(ctx.ggml, input.tensor, full_mask_rep.tensor), input.shape, GGML_TYPE_F32);
}

core::TensorValue sliding_chunks_matmul_qk(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & q,
    const core::TensorValue & k,
    int64_t w,
    float padding_value) {
    const int64_t bsz = q.shape.dims[0];
    const int64_t num_heads = q.shape.dims[1];
    const int64_t seqlen = q.shape.dims[2];
    const int64_t chunks_count = seqlen / w - 1;

    auto q_flat = merge_batch_head(ctx, q);
    auto k_flat = merge_batch_head(ctx, k);
    auto chunk_q = chunk_overlap(ctx, q_flat, w);
    auto chunk_k = chunk_overlap(ctx, k_flat, w);
    auto flat_chunk_q = core::reshape_tensor(ctx, chunk_q, core::TensorShape::from_dims({chunk_q.shape.dims[0] * chunk_q.shape.dims[1], chunk_q.shape.dims[2], chunk_q.shape.dims[3]}));
    auto flat_chunk_k = core::reshape_tensor(ctx, chunk_k, core::TensorShape::from_dims({chunk_k.shape.dims[0] * chunk_k.shape.dims[1], chunk_k.shape.dims[2], chunk_k.shape.dims[3]}));
    auto chunk_attn = matmul(ctx, flat_chunk_q, transpose_last_two(ctx, flat_chunk_k));
    chunk_attn = core::reshape_tensor(ctx, chunk_attn, core::TensorShape::from_dims({chunk_q.shape.dims[0], chunk_q.shape.dims[1], 2 * w, 2 * w}));

    auto diagonal_chunk_attn = skew(ctx, chunk_attn, padding_value);

    auto upper_main = slice_axis(ctx, slice_axis(ctx, diagonal_chunk_attn, 2, 0, w), 3, 0, w + 1);
    upper_main = pad_axis(ctx, upper_main, 3, w, 0);
    auto upper_last = slice_axis(ctx, slice_axis(ctx, slice_axis(ctx, diagonal_chunk_attn, 1, chunks_count - 1, 1), 2, w, w), 3, 0, w + 1);
    upper_last = pad_axis(ctx, upper_last, 3, w, 0);
    auto upper = concat_axis(ctx, 1, upper_main, upper_last);

    auto lower_main = slice_axis(ctx, slice_axis(ctx, diagonal_chunk_attn, 2, w - 1, w), 3, w + 1, w);
    lower_main = pad_axis(ctx, lower_main, 3, 0, w + 1);
    auto special = slice_axis(ctx, slice_axis(ctx, slice_axis(ctx, diagonal_chunk_attn, 1, 0, 1), 2, 0, w - 1), 3, w + 2, w - 1);
    special = pad_axis(ctx, special, 2, 1, 0);
    special = pad_axis(ctx, special, 3, 1, w + 1);
    auto lower = concat_axis(ctx, 1, special, lower_main);

    auto diagonal_attn = core::wrap_tensor(ggml_add(ctx.ggml, upper.tensor, lower.tensor), upper.shape, GGML_TYPE_F32);
    diagonal_attn = core::reshape_tensor(ctx, diagonal_attn, core::TensorShape::from_dims({bsz, num_heads, seqlen, 2 * w + 1}));
    return mask_invalid_locations(ctx, diagonal_attn, w);
}

core::TensorValue sliding_chunks_matmul_pv(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & prob,
    const core::TensorValue & v,
    int64_t w) {
    const int64_t bsz = v.shape.dims[0];
    const int64_t num_heads = v.shape.dims[1];
    const int64_t seqlen = v.shape.dims[2];
    const int64_t head_dim = v.shape.dims[3];
    const int64_t chunks_count = seqlen / w - 1;

    auto chunk_prob = core::reshape_tensor(ctx, prob, core::TensorShape::from_dims({bsz * num_heads, seqlen / w, w, 2 * w + 1}));
    auto v_flat = merge_batch_head(ctx, v);
    auto left_pad = constant_tensor_like(ctx, v_flat, core::TensorShape::from_dims({v_flat.shape.dims[0], w, head_dim}), -1.0f);
    auto right_pad = constant_tensor_like(ctx, v_flat, core::TensorShape::from_dims({v_flat.shape.dims[0], w, head_dim}), -1.0f);
    auto padded_v = concat_axis(ctx, 1, concat_axis(ctx, 1, left_pad, v_flat), right_pad);
    auto chunk_v0 = tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, slice_axis(ctx, padded_v, 1, 0, 3 * w));
    auto chunk_v = core::reshape_tensor(ctx, chunk_v0, core::TensorShape::from_dims({bsz * num_heads, 1, 3 * w, head_dim}));
    for (int64_t chunk_idx = 1; chunk_idx < chunks_count + 1; ++chunk_idx) {
        auto chunk = tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, slice_axis(ctx, padded_v, 1, chunk_idx * w, 3 * w));
        chunk = core::reshape_tensor(ctx, chunk, core::TensorShape::from_dims({bsz * num_heads, 1, 3 * w, head_dim}));
        chunk_v = concat_axis(ctx, 1, chunk_v, chunk);
    }
    auto skewed_prob = skew2(ctx, chunk_prob);
    auto flat_prob = core::reshape_tensor(
        ctx,
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, skewed_prob),
        core::TensorShape::from_dims({skewed_prob.shape.dims[0] * skewed_prob.shape.dims[1], skewed_prob.shape.dims[2], skewed_prob.shape.dims[3]}));
    auto flat_chunk_v = core::reshape_tensor(ctx, chunk_v, core::TensorShape::from_dims({chunk_v.shape.dims[0] * chunk_v.shape.dims[1], chunk_v.shape.dims[2], chunk_v.shape.dims[3]}));
    auto context = matmul(ctx, flat_prob, flat_chunk_v);
    context = core::reshape_tensor(ctx, context, core::TensorShape::from_dims({bsz * num_heads, chunks_count + 1, w, head_dim}));
    context = core::reshape_tensor(ctx, context, core::TensorShape::from_dims({bsz, num_heads, seqlen, head_dim}));
    return adetail::permute_tensor(ctx, context, {0, 2, 1, 3});
}

core::TensorValue relative_position_scores(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & q_with_bias_v,
    const core::TensorValue & p) {
    auto q_flat = merge_batch_head(ctx, q_with_bias_v);
    auto p_flat = merge_batch_head(ctx, p);
    auto bd = matmul(ctx, q_flat, transpose_last_two(ctx, p_flat));
    return core::reshape_tensor(
        ctx,
        bd,
        core::TensorShape::from_dims({
            q_with_bias_v.shape.dims[0],
            q_with_bias_v.shape.dims[1],
            q_with_bias_v.shape.dims[2],
            p.shape.dims[2],
        }));
}

core::TensorValue build_pad_mask_from_keep(core::ModuleBuildContext & ctx, const core::TensorValue & keep_mask) {
    auto keep_f32 = core::wrap_tensor(ggml_cast(ctx.ggml, keep_mask.tensor, GGML_TYPE_F32), keep_mask.shape, GGML_TYPE_F32);
    auto ones = ones_like(ctx, keep_f32);
    return core::wrap_tensor(ggml_sub(ctx.ggml, ones.tensor, keep_f32.tensor), keep_mask.shape, GGML_TYPE_F32);
}

core::TensorValue apply_query_mask(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorValue & keep_mask_f32) {
    auto mask = core::reshape_tensor(ctx, keep_mask_f32, core::TensorShape::from_dims({keep_mask_f32.shape.dims[0], 1, keep_mask_f32.shape.dims[1], 1}));
    auto mask_rep = repeat_to_shape(ctx, mask, input.shape);
    return core::wrap_tensor(ggml_mul(ctx.ggml, input.tensor, mask_rep.tensor), input.shape, GGML_TYPE_F32);
}

}  // namespace

LongformerRelativeSelfAttentionGpuModule::LongformerRelativeSelfAttentionGpuModule(RelativeAttentionConfig config)
    : config_(config) {
    validate_config(config_);
}

const RelativeAttentionConfig & LongformerRelativeSelfAttentionGpuModule::config() const noexcept {
    return config_;
}

core::TensorValue LongformerRelativeSelfAttentionGpuModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorValue & pos_emb,
    const RelativeAttentionWeights & weights,
    const core::TensorValue & keep_mask,
    int64_t layer_index,
    LongformerAttentionExecutionState * exec_state,
    LongformerAttentionDebugTensors * debug,
    const std::optional<core::TensorValue> & projected_pos_emb) const {
    GGML_UNUSED(layer_index);
    GGML_UNUSED(exec_state);
    if (debug != nullptr) {
        debug->input = input;
    }

    adetail::validate_sequence_input(input, config_.hidden_size, "longform_attn_gpu.input");
    core::validate_rank_between(pos_emb, 3, 3, "longform_attn_gpu.pos_emb");
    core::validate_rank_between(keep_mask, 2, 2, "longform_attn_gpu.keep_mask");

    const int64_t batch = input.shape.dims[0];
    const int64_t time = input.shape.dims[1];
    const int64_t head_dim = config_.hidden_size / config_.num_heads;
    const int64_t w = std::max(config_.left_context, config_.right_context);
    const int64_t padded_time = time + ((2 * w - (time % (2 * w))) % (2 * w));
    const int64_t start_pos = w - config_.left_context;
    const int64_t end_pos = w + config_.right_context;
    const int64_t cols = 2 * w + 1;
    const float scale = 1.0f / std::sqrt(static_cast<float>(head_dim));

    auto keep_mask_f32 = core::wrap_tensor(ggml_cast(ctx.ggml, keep_mask.tensor, GGML_TYPE_F32), keep_mask.shape, GGML_TYPE_F32);
    auto keep_mask_padded = pad_axis(ctx, keep_mask_f32, 1, 0, padded_time - time);

    auto q_proj = linear_native(ctx, input, weights.attention.q_weight, weights.attention.q_bias, config_.hidden_size);
    auto k_proj = linear_native(ctx, input, weights.attention.k_weight, weights.attention.k_bias, config_.hidden_size);
    auto v_proj = linear_native(ctx, input, weights.attention.v_weight, weights.attention.v_bias, config_.hidden_size);
    if (padded_time > time) {
        q_proj = pad_axis(ctx, q_proj, 1, 0, padded_time - time);
        k_proj = pad_axis(ctx, k_proj, 1, 0, padded_time - time);
        v_proj = pad_axis(ctx, v_proj, 1, 0, padded_time - time);
    }
    if (projected_pos_emb.has_value()) {
        core::validate_rank_between(*projected_pos_emb, 3, 3, "longform_attn_gpu.projected_pos_emb");
        core::validate_last_dim(*projected_pos_emb, config_.hidden_size, "longform_attn_gpu.projected_pos_emb");
        if (projected_pos_emb->shape.dims[1] != pos_emb.shape.dims[1]) {
            throw std::runtime_error("Longformer GPU projected_pos_emb frames must match pos_emb frames");
        }
    }
    auto p_proj = projected_pos_emb.has_value()
        ? *projected_pos_emb
        : linear_native(ctx, pos_emb, weights.pos_weight, std::nullopt, config_.hidden_size);

    auto q = adetail::permute_tensor(ctx, adetail::reshape_heads(ctx, q_proj, config_.num_heads, head_dim), {0, 2, 1, 3});
    auto k = adetail::permute_tensor(ctx, adetail::reshape_heads(ctx, k_proj, config_.num_heads, head_dim), {0, 2, 1, 3});
    auto v = adetail::permute_tensor(ctx, adetail::reshape_heads(ctx, v_proj, config_.num_heads, head_dim), {0, 2, 1, 3});
    auto p = adetail::permute_tensor(ctx, adetail::reshape_heads(ctx, p_proj, config_.num_heads, head_dim), {0, 2, 1, 3});
    if (p.shape.dims[0] == 1 && batch > 1) {
        p = RepeatModule({core::TensorShape::from_dims({batch, p.shape.dims[1], p.shape.dims[2], p.shape.dims[3]})}).build(ctx, p);
    }

    auto q_with_bias_u = adetail::add_attention_bias(ctx, q, weights.pos_bias_u, config_.num_heads, head_dim);
    auto q_with_bias_v = adetail::add_attention_bias(ctx, q, weights.pos_bias_v, config_.num_heads, head_dim);
    auto diagonal_matrix_ac = sliding_chunks_matmul_qk(ctx, q_with_bias_u, k, w, 0.0f);
    auto diagonal_matrix_bd = relative_position_scores(ctx, q_with_bias_v, p);

    std::vector<core::TensorValue> score_parts;
    if (start_pos > 0) {
        score_parts.push_back(slice_axis(ctx, diagonal_matrix_ac, 3, 0, start_pos));
    }
    if (config_.left_context > 0) {
        auto ac_left = slice_axis(ctx, diagonal_matrix_ac, 3, start_pos, config_.left_context);
        auto bd_left = slice_axis(ctx, diagonal_matrix_bd, 3, 0, config_.left_context);
        score_parts.push_back(core::wrap_tensor(ggml_add(ctx.ggml, ac_left.tensor, bd_left.tensor), ac_left.shape, GGML_TYPE_F32));
    }
    {
        auto ac_right = slice_axis(ctx, diagonal_matrix_ac, 3, w, config_.right_context + 1);
        auto bd_right = slice_axis(ctx, diagonal_matrix_bd, 3, config_.left_context, config_.right_context + 1);
        score_parts.push_back(core::wrap_tensor(ggml_add(ctx.ggml, ac_right.tensor, bd_right.tensor), ac_right.shape, GGML_TYPE_F32));
    }
    if (end_pos + 1 < cols) {
        score_parts.push_back(slice_axis(ctx, diagonal_matrix_ac, 3, end_pos + 1, cols - (end_pos + 1)));
    }
    auto scores = adetail::concat_all(ctx, score_parts, 3);
    scores = core::wrap_tensor(ggml_scale(ctx.ggml, scores.tensor, scale), scores.shape, GGML_TYPE_F32);

    if (start_pos > 0 || end_pos + 1 < cols) {
        std::vector<core::TensorValue> masked_parts;
        if (start_pos > 0) {
            masked_parts.push_back(constant_tensor_like(ctx, scores, slice_axis(ctx, scores, 3, 0, start_pos).shape, -kInfVal));
        }
        masked_parts.push_back(slice_axis(ctx, scores, 3, start_pos, end_pos - start_pos + 1));
        if (end_pos + 1 < cols) {
            masked_parts.push_back(constant_tensor_like(ctx, scores, slice_axis(ctx, scores, 3, end_pos + 1, cols - (end_pos + 1)).shape, -kInfVal));
        }
        scores = adetail::concat_all(ctx, masked_parts, 3);
    }

    auto pad_mask = build_pad_mask_from_keep(ctx, keep_mask_padded);
    auto mask4 = core::reshape_tensor(ctx, pad_mask, core::TensorShape::from_dims({batch, 1, padded_time, 1}));
    auto float_mask = core::wrap_tensor(ggml_scale(ctx.ggml, mask4.tensor, -kInfVal), mask4.shape, GGML_TYPE_F32);
    auto ones = ones_like(ctx, float_mask);
    auto d_mask = sliding_chunks_matmul_qk(ctx, ones, float_mask, w, 0.0f);
    if (config_.num_heads > 1) {
        d_mask = repeat_to_shape(ctx, d_mask, scores.shape);
    }
    scores = core::wrap_tensor(ggml_add(ctx.ggml, scores.tensor, d_mask.tensor), scores.shape, GGML_TYPE_F32);

    auto attn = core::wrap_tensor(ggml_soft_max(ctx.ggml, adetail::ensure_contiguous_layout(ctx, scores).tensor), scores.shape, GGML_TYPE_F32);
    attn = apply_query_mask(ctx, attn, keep_mask_padded);

    auto context = sliding_chunks_matmul_pv(ctx, attn, v, w);
    if (padded_time > time) {
        context = slice_axis(ctx, context, 1, 0, time);
    }
    context = tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, context);
    context = core::reshape_tensor(ctx, context, core::TensorShape::from_dims({batch, time, config_.hidden_size}));

    return linear_native(ctx, context, weights.attention.out_weight, weights.attention.out_bias, config_.hidden_size);
}

}  // namespace engine::modules
