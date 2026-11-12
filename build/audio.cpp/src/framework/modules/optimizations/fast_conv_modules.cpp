#include "engine/framework/modules/optimizations/fast_conv_modules.h"

#include "../tensor_layout_utils.h"

#include <stdexcept>
#include <string>

namespace engine::modules {

namespace {

const core::ModulePortSpec kConvInputs[] = {
    {"input", core::PortKind::Activation, false},
    {"weight", core::PortKind::Parameter, false},
    {"bias", core::PortKind::Parameter, true},
};

const core::ModulePortSpec kSingleOutput[] = {
    {"output", core::PortKind::Activation, false},
};

const core::ModuleSchema kFastConv1dSchema = {
    "FastConv1d",
    "nn.conv.fast",
    kConvInputs,
    3,
    kSingleOutput,
    1,
    "Applies an explicit opt-in optimized 1D convolution to channel-first inputs [batch, channels, frames].",
};

core::TensorValue ensure_f32(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & value) {
    if (value.type == GGML_TYPE_F32) {
        return value;
    }
    return core::wrap_tensor(ggml_cast(ctx.ggml, value.tensor, GGML_TYPE_F32), value.shape, GGML_TYPE_F32);
}

core::TensorValue regular_conv_weight(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & weight) {
    const auto contiguous = tensor_layout::ensure_contiguous_layout_if_needed(ctx, weight);
    if (contiguous.type == GGML_TYPE_F32 || contiguous.type == GGML_TYPE_F16) {
        return contiguous;
    }
    if (contiguous.type == GGML_TYPE_BF16) {
        return core::wrap_tensor(ggml_cast(ctx.ggml, contiguous.tensor, GGML_TYPE_F16), contiguous.shape, GGML_TYPE_F16);
    }
    throw std::runtime_error(
        std::string("FastConv1dModule does not support weight type with the current ggml conv path: ") +
        ggml_type_name(contiguous.type));
}

int64_t conv1d_output_frames(const Conv1dConfig & config, int64_t input_frames) {
    return (input_frames + 2 * config.padding - config.dilation * (config.kernel_size - 1) - 1) / config.stride + 1;
}

core::TensorValue add_bias_if_needed(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & output,
    int64_t out_channels,
    const std::optional<core::TensorValue> & bias) {
    if (!bias.has_value()) {
        return output;
    }

    core::validate_shape(*bias, core::TensorShape::from_dims({out_channels}), "bias");
    const auto output_contiguous = tensor_layout::ensure_contiguous_layout_if_needed(ctx, output);
    const auto bias_view = core::reshape_tensor(ctx, *bias, core::TensorShape::from_dims({1, out_channels, 1}));
    const auto bias_expanded = core::wrap_tensor(ggml_repeat(ctx.ggml, bias_view.tensor, output_contiguous.tensor), output.shape, GGML_TYPE_F32);
    return core::wrap_tensor(ggml_add(ctx.ggml, output_contiguous.tensor, bias_expanded.tensor), output.shape, GGML_TYPE_F32);
}

}  // namespace

FastConv1dModule::FastConv1dModule(Conv1dConfig config, FastConv1dKind kind) : config_(config), kind_(kind) {
    if (config_.in_channels <= 0 || config_.out_channels <= 0 || config_.kernel_size <= 0) {
        throw std::runtime_error("FastConv1dModule dimensions must be positive");
    }
    if (config_.stride <= 0 || config_.dilation <= 0) {
        throw std::runtime_error("FastConv1dModule stride and dilation must be positive");
    }
}

const Conv1dConfig & FastConv1dModule::config() const noexcept {
    return config_;
}

FastConv1dKind FastConv1dModule::kind() const noexcept {
    return kind_;
}

const core::ModuleSchema & FastConv1dModule::schema() const noexcept {
    return static_schema();
}

core::TensorValue FastConv1dModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const Conv1dWeights & weights) const {
    if (ctx.ggml == nullptr) {
        throw std::runtime_error("ModuleBuildContext.ggml is null");
    }
    core::validate_rank_between(input, 3, 3, "input");
    core::validate_shape(
        input,
        core::TensorShape::from_dims({input.shape.dims[0], config_.in_channels, input.shape.dims[2]}),
        "input");
    core::validate_shape(
        weights.weight,
        core::TensorShape::from_dims({config_.out_channels, config_.in_channels, config_.kernel_size}),
        "weight");

    const auto output_shape = core::TensorShape::from_dims(
        {input.shape.dims[0], config_.out_channels, conv1d_output_frames(config_, input.shape.dims[2])});
    const auto input_contiguous = ensure_f32(ctx, tensor_layout::ensure_contiguous_layout_if_needed(ctx, input));
    const auto weight_contiguous = regular_conv_weight(ctx, weights.weight);

    ggml_tensor * output_tensor = nullptr;
    switch (kind_) {
        case FastConv1dKind::MinittsFast1dIm2col:
            output_tensor = ggml_conv_1d_fast_1d_im2col(
                ctx.ggml,
                weight_contiguous.tensor,
                input_contiguous.tensor,
                config_.stride,
                config_.padding,
                config_.dilation);
            break;
    }
    if (output_tensor == nullptr) {
        throw std::runtime_error("FastConv1dModule failed to select an implementation");
    }

    auto output = core::wrap_tensor(output_tensor, output_shape, GGML_TYPE_F32);
    return add_bias_if_needed(ctx, output, config_.out_channels, weights.bias);
}

const core::ModuleSchema & FastConv1dModule::static_schema() noexcept {
    return kFastConv1dSchema;
}

}  // namespace engine::modules
