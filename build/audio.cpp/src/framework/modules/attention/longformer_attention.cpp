#include "engine/framework/modules/attention/longformer_attention.h"

#include "engine/framework/core/backend.h"
#include "engine/framework/core/module.h"
#include "../tensor_layout_utils.h"

#include "ggml.h"

#include <cmath>
#include <cstring>
#include <limits>
#include <stdexcept>

namespace engine::modules {

namespace {

constexpr float kInfVal = 10000.0f;

void validate_config(const RelativeAttentionConfig & config) {
    if (config.hidden_size <= 0 || config.num_heads <= 0) {
        throw std::runtime_error("LongformerRelativeSelfAttentionModule requires positive hidden_size and num_heads");
    }
    if (config.hidden_size % config.num_heads != 0) {
        throw std::runtime_error("LongformerRelativeSelfAttentionModule hidden_size must be divisible by num_heads");
    }
    if (config.left_context < 0 || config.right_context < 0) {
        throw std::runtime_error("LongformerRelativeSelfAttentionModule requires non-negative attention context");
    }
}

void validate_sequence_input(const core::TensorValue & input, int64_t hidden_size, const char * name) {
    core::validate_rank_between(input, 3, 3, name);
    core::validate_last_dim(input, hidden_size, name);
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

core::TensorValue permute_tensor(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    std::array<int, core::kMaxTensorRank> axes) {
    std::array<int, core::kMaxTensorRank> ggml_axes = {0, 1, 2, 3};
    core::TensorShape output_shape = {};
    output_shape.rank = input.shape.rank;
    for (size_t out_logical_axis = 0; out_logical_axis < input.shape.rank; ++out_logical_axis) {
        const int in_logical_axis = axes[out_logical_axis];
        output_shape.dims[out_logical_axis] = input.shape.dims[in_logical_axis];
        const int out_ggml_axis = static_cast<int>(input.shape.rank) - 1 - static_cast<int>(out_logical_axis);
        ggml_axes[out_ggml_axis] = core::logical_axis_to_ggml_axis(input.shape.rank, in_logical_axis);
    }
    return core::wrap_tensor(
        ggml_permute(ctx.ggml, input.tensor, ggml_axes[0], ggml_axes[1], ggml_axes[2], ggml_axes[3]),
        output_shape,
        input.type);
}

core::TensorValue transpose_last_two(core::ModuleBuildContext & ctx, const core::TensorValue & value) {
    std::array<int, core::kMaxTensorRank> axes = {0, 1, 2, 3};
    const size_t last = value.shape.rank - 1;
    const size_t second_last = value.shape.rank - 2;
    axes[second_last] = static_cast<int>(last);
    axes[last] = static_cast<int>(second_last);
    return permute_tensor(ctx, value, axes);
}

core::TensorValue matmul(core::ModuleBuildContext & ctx, const core::TensorValue & lhs, const core::TensorValue & rhs) {
    const size_t rank = lhs.shape.rank;
    for (size_t i = 0; i + 2 < rank; ++i) {
        if (lhs.shape.dims[i] != rhs.shape.dims[i]) {
            throw std::runtime_error("Longformer matmul batch dimensions must match");
        }
    }
    if (lhs.shape.dims[rank - 1] != rhs.shape.dims[rank - 2]) {
        throw std::runtime_error("Longformer matmul inner dimensions must match");
    }
    auto rhs_t = tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, transpose_last_two(ctx, rhs));
    auto out_shape = lhs.shape;
    out_shape.dims[rank - 1] = rhs.shape.dims[rank - 1];
    return core::wrap_tensor(ggml_mul_mat(ctx.ggml, rhs_t.tensor, lhs.tensor), out_shape, GGML_TYPE_F32);
}

size_t unchecked_slice_offset_bytes(const core::TensorValue & input, int ggml_axis, int64_t start) {
    return static_cast<size_t>(start) * input.tensor->nb[ggml_axis];
}

ggml_tensor * make_view_with_shape(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorShape & output_shape,
    size_t offset_bytes) {
    const auto dims = core::to_ggml_dims(output_shape);
    switch (output_shape.rank) {
        case 1:
            return ggml_view_1d(ctx.ggml, input.tensor, dims[0], offset_bytes);
        case 2:
            return ggml_view_2d(ctx.ggml, input.tensor, dims[0], dims[1], input.tensor->nb[1], offset_bytes);
        case 3:
            return ggml_view_3d(
                ctx.ggml,
                input.tensor,
                dims[0],
                dims[1],
                dims[2],
                input.tensor->nb[1],
                input.tensor->nb[2],
                offset_bytes);
        case 4:
            return ggml_view_4d(
                ctx.ggml,
                input.tensor,
                dims[0],
                dims[1],
                dims[2],
                dims[3],
                input.tensor->nb[1],
                input.tensor->nb[2],
                input.tensor->nb[3],
                offset_bytes);
        default:
            throw std::runtime_error("Unsupported view rank");
    }
}

core::TensorValue slice_axis(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    int axis,
    int64_t start,
    int64_t length) {
    core::TensorShape output_shape = input.shape;
    output_shape.dims[axis] = length;
    const int ggml_axis = core::logical_axis_to_ggml_axis(input.shape.rank, axis);
    const size_t offset_bytes = unchecked_slice_offset_bytes(input, ggml_axis, start);
    return core::wrap_tensor(make_view_with_shape(ctx, input, output_shape, offset_bytes), output_shape, input.type);
}

core::TensorValue concat_axis(
    core::ModuleBuildContext & ctx,
    int axis,
    const core::TensorValue & lhs,
    const core::TensorValue & rhs) {
    auto output_shape = lhs.shape;
    output_shape.dims[axis] += rhs.shape.dims[axis];
    const int ggml_axis = core::logical_axis_to_ggml_axis(lhs.shape.rank, axis);
    return core::wrap_tensor(ggml_concat(ctx.ggml, lhs.tensor, rhs.tensor, ggml_axis), output_shape, lhs.type);
}

core::TensorValue repeat_to_shape(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorShape & output_shape) {
    const auto dims = core::to_ggml_dims(output_shape);
    return core::wrap_tensor(
        ggml_repeat(ctx.ggml, input.tensor, ggml_new_tensor(ctx.ggml, input.type, static_cast<int>(output_shape.rank), dims.data())),
        output_shape,
        GGML_TYPE_F32);
}

core::TensorValue first_element_like(core::ModuleBuildContext & ctx, const core::TensorValue & input) {
    core::TensorShape shape = input.shape;
    for (size_t i = 0; i < shape.rank; ++i) {
        shape.dims[i] = 1;
    }
    return core::wrap_tensor(make_view_with_shape(ctx, input, shape, 0), shape, input.type);
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

[[maybe_unused]] core::TensorValue strided_view_4d(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorShape & shape,
    size_t logical_stride0,
    size_t logical_stride1,
    size_t logical_stride2,
    [[maybe_unused]] size_t logical_stride3,
    size_t offset_bytes = 0) {
    const auto dims = core::to_ggml_dims(shape);
    return core::wrap_tensor(
        ggml_view_4d(
            ctx.ggml,
            input.tensor,
            dims[0],
            dims[1],
            dims[2],
            dims[3],
            logical_stride2,
            logical_stride1,
            logical_stride0,
            offset_bytes),
        shape,
        input.type);
}

[[maybe_unused]] core::TensorValue reshape_heads(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    int64_t num_heads,
    int64_t head_dim) {
    return core::reshape_tensor(ctx, input, core::TensorShape::from_dims({input.shape.dims[0], input.shape.dims[1], num_heads, head_dim}));
}

[[maybe_unused]] core::TensorValue add_attention_bias(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorValue & bias,
    int64_t num_heads,
    int64_t head_dim) {
    auto bias_view = core::reshape_tensor(ctx, bias, core::TensorShape::from_dims({1, num_heads, 1, head_dim}));
    auto repeated = core::wrap_tensor(ggml_repeat(ctx.ggml, bias_view.tensor, input.tensor), input.shape, GGML_TYPE_F32);
    return core::wrap_tensor(ggml_add(ctx.ggml, input.tensor, repeated.tensor), input.shape, GGML_TYPE_F32);
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
        throw std::runtime_error("Longformer skew only supports zero padding");
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

[[maybe_unused]] core::TensorValue sliding_chunks_matmul_qk(
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

[[maybe_unused]] core::TensorValue sliding_chunks_matmul_pv(
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
    auto left_pad = constant_tensor_like(
        ctx,
        v_flat,
        core::TensorShape::from_dims({v_flat.shape.dims[0], w, head_dim}),
        -1.0f);
    auto right_pad = constant_tensor_like(
        ctx,
        v_flat,
        core::TensorShape::from_dims({v_flat.shape.dims[0], w, head_dim}),
        -1.0f);
    auto padded_v = concat_axis(ctx, 1, concat_axis(ctx, 1, left_pad, v_flat), right_pad);
    auto chunk_v0 = tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, slice_axis(ctx, padded_v, 1, 0, 3 * w));
    auto chunk_v = core::reshape_tensor(ctx, chunk_v0, core::TensorShape::from_dims({bsz * num_heads, 1, 3 * w, head_dim}));
    for (int64_t chunk_idx = 1; chunk_idx < chunks_count + 1; ++chunk_idx) {
        auto chunk = tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(
            ctx,
            slice_axis(ctx, padded_v, 1, chunk_idx * w, 3 * w));
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
    return permute_tensor(ctx, context, {0, 2, 1, 3});
}

[[maybe_unused]] core::TensorValue relative_position_scores(
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

inline size_t idx_bhtd(int64_t b, int64_t h, int64_t t, int64_t d, int64_t num_heads, int64_t time, int64_t dim) {
    return static_cast<size_t>(((b * num_heads + h) * time + t) * dim + d);
}

inline size_t idx_htd(int64_t h, int64_t t, int64_t d, int64_t time, int64_t dim) {
    return static_cast<size_t>((h * time + t) * dim + d);
}

inline size_t idx_bhtc(int64_t b, int64_t h, int64_t t, int64_t c, int64_t num_heads, int64_t time, int64_t cols) {
    return static_cast<size_t>(((b * num_heads + h) * time + t) * cols + c);
}

inline size_t idx_htc(int64_t h, int64_t t, int64_t c, int64_t time, int64_t cols) {
    return static_cast<size_t>((h * time + t) * cols + c);
}

inline float neg_inf() {
    return -std::numeric_limits<float>::infinity();
}

const float * require_contiguous_f32_data(const ggml_tensor * tensor, const char * name) {
    if (tensor == nullptr || tensor->type != GGML_TYPE_F32) {
        throw std::runtime_error(std::string(name) + " must be an F32 tensor");
    }
    if (tensor->data == nullptr) {
        throw std::runtime_error(std::string(name) + " must have CPU-visible data");
    }
    if (!ggml_is_contiguous(tensor) || tensor->nb[0] != sizeof(float)) {
        throw std::runtime_error(std::string(name) + " must be contiguous F32");
    }
    return static_cast<const float *>(tensor->data);
}

float * require_mutable_contiguous_f32_data(ggml_tensor * tensor, const char * name) {
    return const_cast<float *>(require_contiguous_f32_data(tensor, name));
}

void linear_rows_host(
    const std::vector<float> & input,
    int64_t rows,
    int64_t in_features,
    const std::vector<float> & weight,
    int64_t out_features,
    std::vector<float> & output,
    const std::optional<std::vector<float>> & bias = std::nullopt) {
    output.assign(static_cast<size_t>(rows * out_features), 0.0f);
#ifdef _OPENMP
    #pragma omp parallel for if(rows * out_features >= 4096)
#endif
    for (int64_t row = 0; row < rows; ++row) {
        const size_t in_base = static_cast<size_t>(row * in_features);
        const size_t out_base = static_cast<size_t>(row * out_features);
        for (int64_t out = 0; out < out_features; ++out) {
            float sum = bias.has_value() ? (*bias)[static_cast<size_t>(out)] : 0.0f;
            const size_t w_base = static_cast<size_t>(out * in_features);
            for (int64_t in = 0; in < in_features; ++in) {
                sum += weight[w_base + static_cast<size_t>(in)] * input[in_base + static_cast<size_t>(in)];
            }
            output[out_base + static_cast<size_t>(out)] = sum;
        }
    }
}

[[maybe_unused]] void project_qkv_host(
    const std::vector<float> & input,
    int64_t batch,
    int64_t time,
    int64_t hidden_size,
    int64_t num_heads,
    int64_t head_dim,
    int64_t padded_time,
    const std::vector<float> & q_weight,
    const std::vector<float> & k_weight,
    const std::vector<float> & v_weight,
    const std::vector<float> & q_bias,
    const std::vector<float> & k_bias,
    const std::vector<float> & v_bias,
    std::vector<float> & q,
    std::vector<float> & k,
    std::vector<float> & v) {
    std::vector<float> q_rows;
    std::vector<float> k_rows;
    std::vector<float> v_rows;
    const auto q_bias_opt = q_bias.empty() ? std::nullopt : std::optional<std::vector<float>>(q_bias);
    const auto k_bias_opt = k_bias.empty() ? std::nullopt : std::optional<std::vector<float>>(k_bias);
    const auto v_bias_opt = v_bias.empty() ? std::nullopt : std::optional<std::vector<float>>(v_bias);
    linear_rows_host(input, batch * time, hidden_size, q_weight, hidden_size, q_rows, q_bias_opt);
    linear_rows_host(input, batch * time, hidden_size, k_weight, hidden_size, k_rows, k_bias_opt);
    linear_rows_host(input, batch * time, hidden_size, v_weight, hidden_size, v_rows, v_bias_opt);

    q.assign(static_cast<size_t>(batch * num_heads * padded_time * head_dim), 0.0f);
    k.assign(q.size(), 0.0f);
    v.assign(q.size(), 0.0f);
#ifdef _OPENMP
    #pragma omp parallel for collapse(2) if(batch * time * num_heads >= 64)
#endif
    for (int64_t b = 0; b < batch; ++b) {
        for (int64_t t = 0; t < time; ++t) {
            const size_t row_base = static_cast<size_t>(((b * time) + t) * hidden_size);
            for (int64_t h = 0; h < num_heads; ++h) {
                for (int64_t d = 0; d < head_dim; ++d) {
                    const size_t src = row_base + static_cast<size_t>(h * head_dim + d);
                    const size_t dst = idx_bhtd(b, h, t, d, num_heads, padded_time, head_dim);
                    q[dst] = q_rows[src];
                    k[dst] = k_rows[src];
                    v[dst] = v_rows[src];
                }
            }
        }
    }
}

void compute_longform_attention_host(
    const std::vector<float> & q,
    const std::vector<float> & k,
    const std::vector<float> & v,
    const std::vector<float> & p,
    const float * keep_mask,
    const float * pos_bias_u,
    const float * pos_bias_v,
    int64_t batch,
    int64_t num_heads,
    int64_t padded_time,
    int64_t head_dim,
    int64_t pos_frames,
    int64_t left_context,
    int64_t right_context,
    LongformerAttentionExecutionState * exec_state,
    std::vector<float> & out_values) {
    const int64_t w = std::max(left_context, right_context);
    const int64_t cols = 2 * w + 1;
    const float scale = 1.0f / std::sqrt(static_cast<float>(head_dim));
    const bool capture_debug = exec_state != nullptr && exec_state->capture_debug;

    out_values.assign(static_cast<size_t>(batch * padded_time * num_heads * head_dim), 0.0f);

    if (!capture_debug) {
#ifdef _OPENMP
        #pragma omp parallel if(batch * num_heads * padded_time >= 64)
#endif
        {
            std::vector<float> q_u_row(static_cast<size_t>(head_dim), 0.0f);
            std::vector<float> q_v_row(static_cast<size_t>(head_dim), 0.0f);
            std::vector<float> row_scores(static_cast<size_t>(cols), neg_inf());
            std::vector<float> row_probs(static_cast<size_t>(cols), 0.0f);

#ifdef _OPENMP
            #pragma omp for collapse(3)
#endif
            for (int64_t b = 0; b < batch; ++b) {
                for (int64_t h = 0; h < num_heads; ++h) {
                    for (int64_t t = 0; t < padded_time; ++t) {
                        const float * bias_u = pos_bias_u + static_cast<size_t>(h * head_dim);
                        const float * bias_v = pos_bias_v + static_cast<size_t>(h * head_dim);
                        const size_t q_head_base = static_cast<size_t>((b * num_heads + h) * padded_time * head_dim);
                        const size_t p_head_base = static_cast<size_t>((b * num_heads + h) * pos_frames * head_dim);
                        const size_t v_head_base = q_head_base;
                        const bool keep_query = keep_mask[static_cast<size_t>(b * padded_time + t)] > 0.5f;
                        if (!keep_query) {
                            continue;
                        }
                        const float * q_ptr = q.data() + q_head_base + static_cast<size_t>(t * head_dim);
                        for (int64_t d = 0; d < head_dim; ++d) {
                            q_u_row[static_cast<size_t>(d)] = q_ptr[d] + bias_u[d];
                            q_v_row[static_cast<size_t>(d)] = q_ptr[d] + bias_v[d];
                        }

                        float row_max = neg_inf();
                        const int64_t valid_col_start = std::max<int64_t>(0, w - t);
                        const int64_t valid_col_end = std::min<int64_t>(cols - 1, w + (padded_time - 1 - t));
                        float * out_ptr = out_values.data() +
                            static_cast<size_t>(((b * padded_time + t) * num_heads + h) * head_dim);
                        const int64_t valid_cols = valid_col_end - valid_col_start + 1;
                        for (int64_t col = valid_col_start; col <= valid_col_end; ++col) {
                            const int64_t local_col = col - valid_col_start;
                            const int64_t key_t = t + col - w;
                            const float * k_ptr = k.data() + q_head_base + static_cast<size_t>(key_t * head_dim);
                            const int64_t pos_idx = col < left_context
                                ? col
                                : (col >= cols - (right_context + 1)
                                    ? left_context + (col - (cols - (right_context + 1)))
                                    : -1);
                            float content = 0.0f;
                            float positional = 0.0f;
                            const float * p_ptr = pos_idx >= 0
                                ? p.data() + p_head_base + static_cast<size_t>(pos_idx * head_dim)
                                : nullptr;
#ifdef _OPENMP
                            #pragma omp simd reduction(+:content)
#endif
                            for (int64_t d = 0; d < head_dim; ++d) {
                                content += q_u_row[static_cast<size_t>(d)] * k_ptr[d];
                            }
                            float value = content;
                            if (p_ptr != nullptr) {
#ifdef _OPENMP
                                #pragma omp simd reduction(+:positional)
#endif
                                for (int64_t d = 0; d < head_dim; ++d) {
                                    positional += q_v_row[static_cast<size_t>(d)] * p_ptr[d];
                                }
                                value += positional;
                            }
                            value *= scale;
                            if (keep_mask[static_cast<size_t>(b * padded_time + key_t)] <= 0.5f) {
                                value += -kInfVal;
                            }
                            row_scores[static_cast<size_t>(local_col)] = value;
                            if (value > row_max) {
                                row_max = value;
                            }
                        }

                        if (std::isfinite(row_max)) {
                            float denom = 0.0f;
                            for (int64_t local_col = 0; local_col < valid_cols; ++local_col) {
                                const float score = row_scores[static_cast<size_t>(local_col)];
                                if (std::isfinite(score)) {
                                    const float prob = std::exp(score - row_max);
                                    row_probs[static_cast<size_t>(local_col)] = prob;
                                    denom += prob;
                                } else {
                                    row_probs[static_cast<size_t>(local_col)] = 0.0f;
                                }
                            }
                            if (denom > 0.0f) {
                                for (int64_t local_col = 0; local_col < valid_cols; ++local_col) {
                                    row_probs[static_cast<size_t>(local_col)] /= denom;
                                }
                            }
                        }

                        for (int64_t col = valid_col_start; col <= valid_col_end; ++col) {
                            const int64_t local_col = col - valid_col_start;
                            const int64_t key_t = t + col - w;
                            const float prob = row_probs[static_cast<size_t>(local_col)];
                            if (prob == 0.0f) {
                                continue;
                            }
                            const float * v_ptr = v.data() + v_head_base + static_cast<size_t>(key_t * head_dim);
#ifdef _OPENMP
                            #pragma omp simd
#endif
                            for (int64_t d = 0; d < head_dim; ++d) {
                                out_ptr[d] += prob * v_ptr[d];
                            }
                        }
                    }
                }
            }
        }
        return;
    }

    std::vector<float> q_u(static_cast<size_t>(batch * num_heads * padded_time * head_dim), 0.0f);
    std::vector<float> q_v(q_u.size(), 0.0f);
    std::vector<float> diag_ac(static_cast<size_t>(batch * num_heads * padded_time * cols), neg_inf());
    std::vector<float> diag_bd(diag_ac.size(), 0.0f);
    std::vector<float> d_mask(static_cast<size_t>(batch * padded_time * cols), 0.0f);
    std::vector<float> scores(diag_ac.size(), 0.0f);
    std::vector<float> attn(diag_ac.size(), 0.0f);

#ifdef _OPENMP
    #pragma omp parallel for collapse(2) if(batch * num_heads >= 4)
#endif
    for (int64_t b = 0; b < batch; ++b) {
        for (int64_t h = 0; h < num_heads; ++h) {
            const float * bias_u = pos_bias_u + static_cast<size_t>(h * head_dim);
            const float * bias_v = pos_bias_v + static_cast<size_t>(h * head_dim);
            for (int64_t t = 0; t < padded_time; ++t) {
                for (int64_t d = 0; d < head_dim; ++d) {
                    const size_t q_index = idx_bhtd(b, h, t, d, num_heads, padded_time, head_dim);
                    q_u[q_index] = q[q_index] + bias_u[d];
                    q_v[q_index] = q[q_index] + bias_v[d];
                }

                for (int64_t pos = 0; pos < pos_frames; ++pos) {
                    float acc = 0.0f;
                    for (int64_t d = 0; d < head_dim; ++d) {
                        acc += q_v[idx_bhtd(b, h, t, d, num_heads, padded_time, head_dim)]
                             * p[idx_bhtd(b, h, pos, d, num_heads, pos_frames, head_dim)];
                    }
                    diag_bd[idx_bhtc(b, h, t, pos, num_heads, padded_time, pos_frames)] = acc;
                }

                for (int64_t col = 0; col < cols; ++col) {
                    const int64_t key_t = t + col - w;
                    const size_t local_idx = idx_bhtc(b, h, t, col, num_heads, padded_time, cols);
                    if (key_t >= 0 && key_t < padded_time) {
                        float acc = 0.0f;
                        for (int64_t d = 0; d < head_dim; ++d) {
                            acc += q_u[idx_bhtd(b, h, t, d, num_heads, padded_time, head_dim)]
                                 * k[idx_bhtd(b, h, key_t, d, num_heads, padded_time, head_dim)];
                        }
                        diag_ac[local_idx] = acc;
                        d_mask[static_cast<size_t>((b * padded_time + t) * cols + col)] =
                            keep_mask[static_cast<size_t>(b * padded_time + key_t)] > 0.5f ? 0.0f : -kInfVal;
                    } else {
                        diag_ac[local_idx] = neg_inf();
                        d_mask[static_cast<size_t>((b * padded_time + t) * cols + col)] = neg_inf();
                    }
                }

                for (int64_t col = 0; col < left_context; ++col) {
                    const size_t local_idx = idx_bhtc(b, h, t, col, num_heads, padded_time, cols);
                    if (std::isfinite(diag_ac[local_idx])) {
                        diag_ac[local_idx] += diag_bd[idx_bhtc(b, h, t, col, num_heads, padded_time, pos_frames)];
                    }
                }
                for (int64_t col = cols - (right_context + 1); col < cols; ++col) {
                    const int64_t pos_idx = left_context + (col - (cols - (right_context + 1)));
                    const size_t local_idx = idx_bhtc(b, h, t, col, num_heads, padded_time, cols);
                    if (std::isfinite(diag_ac[local_idx])) {
                        diag_ac[local_idx] += diag_bd[idx_bhtc(b, h, t, pos_idx, num_heads, padded_time, pos_frames)];
                    }
                }

                const int64_t start_pos = w - left_context;
                const int64_t end_pos = w + right_context;
                float row_max = neg_inf();
                for (int64_t col = 0; col < cols; ++col) {
                    float value = std::isfinite(diag_ac[idx_bhtc(b, h, t, col, num_heads, padded_time, cols)])
                        ? diag_ac[idx_bhtc(b, h, t, col, num_heads, padded_time, cols)] * scale
                        : neg_inf();
                    if (col < start_pos || col > end_pos) {
                        value = -kInfVal;
                    }
                    value += d_mask[static_cast<size_t>((b * padded_time + t) * cols + col)];
                    scores[idx_bhtc(b, h, t, col, num_heads, padded_time, cols)] = value;
                    if (std::isfinite(value) && value > row_max) {
                        row_max = value;
                    }
                }

                const bool keep_query = keep_mask[static_cast<size_t>(b * padded_time + t)] > 0.5f;
                if (keep_query && std::isfinite(row_max)) {
                    float denom = 0.0f;
                    for (int64_t col = 0; col < cols; ++col) {
                        const size_t local_idx = idx_bhtc(b, h, t, col, num_heads, padded_time, cols);
                        const float score = scores[local_idx];
                        if (std::isfinite(score)) {
                            attn[local_idx] = std::exp(score - row_max);
                            denom += attn[local_idx];
                        } else {
                            attn[local_idx] = 0.0f;
                        }
                    }
                    if (denom > 0.0f) {
                        for (int64_t col = 0; col < cols; ++col) {
                            attn[idx_bhtc(b, h, t, col, num_heads, padded_time, cols)] /= denom;
                        }
                    }
                }

                for (int64_t col = 0; col < cols; ++col) {
                    const int64_t key_t = t + col - w;
                    const float prob = attn[idx_bhtc(b, h, t, col, num_heads, padded_time, cols)];
                    if (prob == 0.0f || key_t < 0 || key_t >= padded_time) {
                        continue;
                    }
                    for (int64_t d = 0; d < head_dim; ++d) {
                        out_values[idx_bhtd(b, t, h, d, padded_time, num_heads, head_dim)] +=
                            prob * v[idx_bhtd(b, h, key_t, d, num_heads, padded_time, head_dim)];
                    }
                }
            }
        }
    }

    if (exec_state != nullptr && exec_state->capture_debug && batch > 0) {
        exec_state->q_with_bias_u.resize(static_cast<size_t>(num_heads * padded_time * head_dim));
        exec_state->q_with_bias_v.resize(static_cast<size_t>(num_heads * padded_time * head_dim));
        exec_state->diagonal_matrix_ac.resize(static_cast<size_t>(num_heads * padded_time * cols));
        exec_state->diagonal_matrix_bd.resize(static_cast<size_t>(num_heads * padded_time * pos_frames));
        exec_state->d_mask.resize(static_cast<size_t>(padded_time * cols));
        exec_state->scores.resize(static_cast<size_t>(num_heads * padded_time * cols));
        exec_state->attn.resize(static_cast<size_t>(num_heads * padded_time * cols));
        exec_state->out.resize(static_cast<size_t>(padded_time * num_heads * head_dim));

        for (int64_t h = 0; h < num_heads; ++h) {
            for (int64_t t = 0; t < padded_time; ++t) {
                for (int64_t d = 0; d < head_dim; ++d) {
                    exec_state->q_with_bias_u[idx_htd(h, t, d, padded_time, head_dim)] =
                        q_u[idx_bhtd(0, h, t, d, num_heads, padded_time, head_dim)];
                    exec_state->q_with_bias_v[idx_htd(h, t, d, padded_time, head_dim)] =
                        q_v[idx_bhtd(0, h, t, d, num_heads, padded_time, head_dim)];
                    exec_state->out[static_cast<size_t>(((t * num_heads) + h) * head_dim + d)] =
                        out_values[idx_bhtd(0, t, h, d, padded_time, num_heads, head_dim)];
                }
                for (int64_t c = 0; c < cols; ++c) {
                    exec_state->diagonal_matrix_ac[idx_htc(h, t, c, padded_time, cols)] =
                        diag_ac[idx_bhtc(0, h, t, c, num_heads, padded_time, cols)];
                    exec_state->scores[idx_htc(h, t, c, padded_time, cols)] =
                        scores[idx_bhtc(0, h, t, c, num_heads, padded_time, cols)];
                    exec_state->attn[idx_htc(h, t, c, padded_time, cols)] =
                        attn[idx_bhtc(0, h, t, c, num_heads, padded_time, cols)];
                }
                for (int64_t c = 0; c < pos_frames; ++c) {
                    exec_state->diagonal_matrix_bd[idx_htc(h, t, c, padded_time, pos_frames)] =
                        diag_bd[idx_bhtc(0, h, t, c, num_heads, padded_time, pos_frames)];
                }
                for (int64_t c = 0; c < cols; ++c) {
                    exec_state->d_mask[static_cast<size_t>(t * cols + c)] =
                        d_mask[static_cast<size_t>(t * cols + c)];
                }
            }
        }
    }
}

void longform_attention_custom_op(struct ggml_tensor * dst, int ith, int nth, void * userdata) {
    GGML_UNUSED(nth);
    if (ith != 0) {
        return;
    }
    auto * state = static_cast<LongformerAttentionExecutionState *>(userdata);
    const ggml_tensor * q_proj_tensor = dst->src[0];
    const ggml_tensor * k_proj_tensor = dst->src[1];
    const ggml_tensor * v_proj_tensor = dst->src[2];
    const ggml_tensor * p_proj_tensor = dst->src[3];
    const ggml_tensor * keep_mask_tensor = dst->src[4];
    const float * q_rows = require_contiguous_f32_data(q_proj_tensor, "longformer q projection");
    const float * k_rows = require_contiguous_f32_data(k_proj_tensor, "longformer k projection");
    const float * v_rows = require_contiguous_f32_data(v_proj_tensor, "longformer v projection");
    const float * p_rows = require_contiguous_f32_data(p_proj_tensor, "longformer p projection");
    const float * keep_mask = require_contiguous_f32_data(keep_mask_tensor, "longformer keep mask");
    const float * pos_bias_u = require_contiguous_f32_data(state->pos_bias_u_tensor.tensor, "longformer pos bias u");
    const float * pos_bias_v = require_contiguous_f32_data(state->pos_bias_v_tensor.tensor, "longformer pos bias v");

    const int64_t batch = dst->ne[2];
    const int64_t padded_time = state->padded_time;
    const int64_t hidden_size = state->hidden_size;
    const int64_t pos_frames = state->pos_frames;

    std::vector<float> q;
    std::vector<float> k;
    std::vector<float> v;
    std::vector<float> p;
    q.assign(static_cast<size_t>(batch * state->num_heads * padded_time * state->head_dim), 0.0f);
    k.assign(q.size(), 0.0f);
    v.assign(q.size(), 0.0f);
#ifdef _OPENMP
    #pragma omp parallel for collapse(2) if(batch * padded_time * state->num_heads >= 64)
#endif
    for (int64_t b = 0; b < batch; ++b) {
        for (int64_t t = 0; t < padded_time; ++t) {
            const size_t row_base = static_cast<size_t>(((b * padded_time) + t) * hidden_size);
            for (int64_t h = 0; h < state->num_heads; ++h) {
                for (int64_t d = 0; d < state->head_dim; ++d) {
                    const size_t src = row_base + static_cast<size_t>(h * state->head_dim + d);
                    const size_t dst_idx = idx_bhtd(b, h, t, d, state->num_heads, padded_time, state->head_dim);
                    q[dst_idx] = q_rows[src];
                    k[dst_idx] = k_rows[src];
                    v[dst_idx] = v_rows[src];
                }
            }
        }
    }
    p.assign(static_cast<size_t>(batch * state->num_heads * pos_frames * state->head_dim), 0.0f);
#ifdef _OPENMP
    #pragma omp parallel for collapse(2) if(batch * pos_frames * state->num_heads >= 64)
#endif
    for (int64_t b = 0; b < batch; ++b) {
        for (int64_t t = 0; t < pos_frames; ++t) {
            const size_t row_base = static_cast<size_t>(t * hidden_size);
            for (int64_t h = 0; h < state->num_heads; ++h) {
                for (int64_t d = 0; d < state->head_dim; ++d) {
                    const size_t src = row_base + static_cast<size_t>(h * state->head_dim + d);
                    p[idx_bhtd(b, h, t, d, state->num_heads, pos_frames, state->head_dim)] = p_rows[src];
                }
            }
        }
    }

    if (state->capture_debug && batch > 0) {
        state->q.resize(static_cast<size_t>(state->num_heads * padded_time * state->head_dim));
        state->k.resize(state->q.size());
        state->v.resize(state->q.size());
        state->p.resize(static_cast<size_t>(state->num_heads * pos_frames * state->head_dim));
        for (int64_t h = 0; h < state->num_heads; ++h) {
            for (int64_t t = 0; t < padded_time; ++t) {
                for (int64_t d = 0; d < state->head_dim; ++d) {
                    const size_t dbg = idx_htd(h, t, d, padded_time, state->head_dim);
                    state->q[dbg] = q[idx_bhtd(0, h, t, d, state->num_heads, padded_time, state->head_dim)];
                    state->k[dbg] = k[idx_bhtd(0, h, t, d, state->num_heads, padded_time, state->head_dim)];
                    state->v[dbg] = v[idx_bhtd(0, h, t, d, state->num_heads, padded_time, state->head_dim)];
                }
            }
            for (int64_t t = 0; t < pos_frames; ++t) {
                for (int64_t d = 0; d < state->head_dim; ++d) {
                    state->p[idx_htd(h, t, d, pos_frames, state->head_dim)] =
                        p[idx_bhtd(0, h, t, d, state->num_heads, pos_frames, state->head_dim)];
                }
            }
        }
    }

    std::vector<float> out_values;
    compute_longform_attention_host(
        q,
        k,
        v,
        p,
        keep_mask,
        pos_bias_u,
        pos_bias_v,
        batch,
        state->num_heads,
        padded_time,
        state->head_dim,
        pos_frames,
        state->left_context,
        state->right_context,
        state,
        out_values);

    std::vector<float> out_rows(static_cast<size_t>(batch * padded_time * hidden_size), 0.0f);
#ifdef _OPENMP
    #pragma omp parallel for collapse(2) if(batch * padded_time * state->num_heads >= 64)
#endif
    for (int64_t b = 0; b < batch; ++b) {
        for (int64_t t = 0; t < padded_time; ++t) {
            const size_t row_base = static_cast<size_t>(((b * padded_time) + t) * hidden_size);
            for (int64_t h = 0; h < state->num_heads; ++h) {
                for (int64_t d = 0; d < state->head_dim; ++d) {
                    out_rows[row_base + static_cast<size_t>(h * state->head_dim + d)] =
                        out_values[idx_bhtd(b, t, h, d, padded_time, state->num_heads, state->head_dim)];
                }
            }
        }
    }
    std::memcpy(dst->data, out_rows.data(), out_rows.size() * sizeof(float));
}

void add_out_bias_custom_op(struct ggml_tensor * dst, int ith, int nth, void * userdata) {
    GGML_UNUSED(nth);
    if (ith != 0) {
        return;
    }
    auto * state = static_cast<LongformerAttentionExecutionState *>(userdata);
    const ggml_tensor * input_tensor = dst->src[0];
    const float * input = require_contiguous_f32_data(input_tensor, "longformer output projection");
    float * output = require_mutable_contiguous_f32_data(dst, "longformer biased output");
    GGML_UNUSED(state);
    std::memcpy(output, input, static_cast<size_t>(ggml_nbytes(dst)));
}

[[maybe_unused]] core::TensorValue build_pad_mask_from_keep(core::ModuleBuildContext & ctx, const core::TensorValue & keep_mask) {
    auto keep_f32 = core::wrap_tensor(ggml_cast(ctx.ggml, keep_mask.tensor, GGML_TYPE_F32), keep_mask.shape, GGML_TYPE_F32);
    auto ones = ones_like(ctx, keep_f32);
    return core::wrap_tensor(ggml_sub(ctx.ggml, ones.tensor, keep_f32.tensor), keep_mask.shape, GGML_TYPE_F32);
}

[[maybe_unused]] core::TensorValue apply_query_mask(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorValue & keep_mask_f32) {
    auto mask = core::reshape_tensor(ctx, keep_mask_f32, core::TensorShape::from_dims({keep_mask_f32.shape.dims[0], 1, keep_mask_f32.shape.dims[1], 1}));
    auto mask_rep = repeat_to_shape(ctx, mask, input.shape);
    return core::wrap_tensor(ggml_mul(ctx.ggml, input.tensor, mask_rep.tensor), input.shape, GGML_TYPE_F32);
}

[[maybe_unused]] core::TensorValue apply_keep_mask_to_output(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const core::TensorValue & keep_mask) {
    auto keep_f32 = core::wrap_tensor(ggml_cast(ctx.ggml, keep_mask.tensor, GGML_TYPE_F32), keep_mask.shape, GGML_TYPE_F32);
    auto mask_3d = core::reshape_tensor(ctx, keep_f32, core::TensorShape::from_dims({keep_mask.shape.dims[0], keep_mask.shape.dims[1], 1}));
    auto mask_rep = core::wrap_tensor(ggml_repeat(ctx.ggml, mask_3d.tensor, input.tensor), input.shape, GGML_TYPE_F32);
    return core::wrap_tensor(ggml_mul(ctx.ggml, input.tensor, mask_rep.tensor), input.shape, GGML_TYPE_F32);
}

}  // namespace

LongformerRelativeSelfAttentionModule::LongformerRelativeSelfAttentionModule(RelativeAttentionConfig config)
    : config_(config) {
    validate_config(config_);
}

const RelativeAttentionConfig & LongformerRelativeSelfAttentionModule::config() const noexcept {
    return config_;
}

core::TensorValue LongformerRelativeSelfAttentionModule::build(
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
    validate_sequence_input(input, config_.hidden_size, "longform_attn.input");
    core::validate_rank_between(pos_emb, 3, 3, "longform_attn.pos_emb");
    core::validate_rank_between(keep_mask, 2, 2, "longform_attn.keep_mask");

    const int64_t batch = input.shape.dims[0];
    const int64_t time = input.shape.dims[1];
    const int64_t head_dim = config_.hidden_size / config_.num_heads;
    const int64_t w = std::max(config_.left_context, config_.right_context);
    if (w <= 0) {
        throw std::runtime_error("LongformerRelativeSelfAttentionModule requires positive local context");
    }
    const int64_t padded_time = time + ((2 * w - (time % (2 * w))) % (2 * w));
    if (debug != nullptr) {
        debug->input = input;
    }

    auto keep_mask_f32 = core::wrap_tensor(ggml_cast(ctx.ggml, keep_mask.tensor, GGML_TYPE_F32), keep_mask.shape, GGML_TYPE_F32);
    auto keep_mask_padded = pad_axis(ctx, keep_mask_f32, 1, 0, padded_time - time);
    auto q_proj = linear_native(ctx, input, weights.attention.q_weight, std::nullopt, config_.hidden_size);
    auto k_proj = linear_native(ctx, input, weights.attention.k_weight, std::nullopt, config_.hidden_size);
    auto v_proj = linear_native(ctx, input, weights.attention.v_weight, std::nullopt, config_.hidden_size);
    if (padded_time > time) {
        q_proj = pad_axis(ctx, q_proj, 1, 0, padded_time - time);
        k_proj = pad_axis(ctx, k_proj, 1, 0, padded_time - time);
        v_proj = pad_axis(ctx, v_proj, 1, 0, padded_time - time);
    }
    if (projected_pos_emb.has_value()) {
        core::validate_rank_between(*projected_pos_emb, 3, 3, "longform_attn.projected_pos_emb");
        core::validate_last_dim(*projected_pos_emb, config_.hidden_size, "longform_attn.projected_pos_emb");
        if (projected_pos_emb->shape.dims[1] != pos_emb.shape.dims[1]) {
            throw std::runtime_error("Longformer projected_pos_emb frames must match pos_emb frames");
        }
    }
    auto p_proj = projected_pos_emb.has_value()
        ? *projected_pos_emb
        : linear_native(ctx, pos_emb, weights.pos_weight, std::nullopt, config_.hidden_size);
    if (exec_state == nullptr) {
        throw std::runtime_error("LongformerRelativeSelfAttentionModule requires execution state");
    }
    exec_state->num_heads = config_.num_heads;
    exec_state->head_dim = head_dim;
    exec_state->padded_time = padded_time;
    exec_state->pos_frames = pos_emb.shape.dims[1];
    exec_state->left_context = config_.left_context;
    exec_state->right_context = config_.right_context;
    exec_state->hidden_size = config_.hidden_size;
    exec_state->capture_debug = debug != nullptr;
    exec_state->out_weight = weights.attention.out_weight;
    exec_state->pos_bias_u_tensor = weights.pos_bias_u;
    exec_state->pos_bias_v_tensor = weights.pos_bias_v;
    ggml_tensor * args[] = {
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, q_proj).tensor,
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, k_proj).tensor,
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, v_proj).tensor,
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, p_proj).tensor,
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, keep_mask_padded).tensor,
    };
    auto out = core::wrap_tensor(
        ggml_custom_4d(
            ctx.ggml,
            GGML_TYPE_F32,
            config_.hidden_size,
            padded_time,
            batch,
            1,
            args,
            static_cast<int>(sizeof(args) / sizeof(args[0])),
            longform_attention_custom_op,
            1,
            exec_state),
        core::TensorShape::from_dims({batch, padded_time, config_.hidden_size}),
        GGML_TYPE_F32);
    if (padded_time > time) {
        out = slice_axis(ctx, out, 1, 0, time);
    }
    auto out_projected = linear_native(ctx, out, weights.attention.out_weight, std::nullopt, config_.hidden_size);
    ggml_tensor * bias_args[] = {
        tensor_layout::ensure_contiguous_nontransposed_layout_if_needed(ctx, out_projected).tensor,
    };
    out = core::wrap_tensor(
        ggml_custom_4d(
            ctx.ggml,
            GGML_TYPE_F32,
            config_.hidden_size,
            out_projected.shape.dims[1],
            batch,
            1,
            bias_args,
            1,
            add_out_bias_custom_op,
            1,
            exec_state),
        out_projected.shape,
        GGML_TYPE_F32);
    return out;
}

}  // namespace engine::modules
