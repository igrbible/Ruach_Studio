#include "engine/framework/codecs/neural_audio.h"

#include "engine/framework/modules/activation_modules.h"
#include "engine/framework/modules/structural_modules.h"

#include <stdexcept>

namespace engine::codecs {

namespace {

using engine::core::TensorShape;
using engine::core::TensorValue;
using engine::core::wrap_tensor;
using engine::modules::Conv1dModule;
using engine::modules::ConvTranspose1dModule;
using engine::modules::EluModule;
using engine::modules::NormWeights;
using engine::modules::SliceModule;
using engine::modules::StreamingConv1dModule;
using engine::modules::StreamingPadMode;
using engine::modules::SiluModule;

TensorValue contiguous(engine::core::ModuleBuildContext & ctx, const TensorValue & value) {
    return ensure_backend_addressable_layout(ctx, value);
}

TensorValue build_streaming_convtranspose1d(
    engine::core::ModuleBuildContext & ctx,
    const TensorValue & input,
    const engine::modules::ConvTranspose1dWeights & weights,
    int64_t in_channels,
    int64_t out_channels,
    int64_t kernel_size,
    int stride,
    bool use_bias) {
    auto output = ConvTranspose1dModule({
        in_channels,
        out_channels,
        kernel_size,
        stride,
        0,
        1,
        use_bias,
    }).build(ctx, input, weights);
    const int64_t crop = kernel_size - stride;
    if (crop <= 0) {
        return output;
    }
    return SliceModule({2, 0, output.shape.dims[2] - crop}).build(ctx, output);
}

TensorValue build_seanet_residual_block(
    engine::core::ModuleBuildContext & ctx,
    const TensorValue & input,
    const SEANetResidualWeights & weights,
    int64_t channels,
    int64_t hidden_channels,
    int64_t dilation,
    bool use_bias,
    StreamingPadMode pad_mode) {
    auto x = EluModule().build(ctx, input);
    x = StreamingConv1dModule({
        channels,
        hidden_channels,
        3,
        1,
        static_cast<int>(dilation),
        use_bias,
        pad_mode,
    }).build(ctx, x, weights.conv1);
    x = EluModule().build(ctx, x);
    x = StreamingConv1dModule({
        hidden_channels,
        channels,
        1,
        1,
        1,
        use_bias,
        pad_mode,
    }).build(ctx, x, weights.conv2);
    auto input_contiguous = contiguous(ctx, input);
    auto x_contiguous = contiguous(ctx, x);
    return wrap_tensor(ggml_add(ctx.ggml, input_contiguous.tensor, x_contiguous.tensor), input.shape, GGML_TYPE_F32);
}

TensorValue group_norm_affine(
    engine::core::ModuleBuildContext & ctx,
    const TensorValue & input,
    int64_t groups,
    float eps,
    const NormWeights & weights) {
    auto output = wrap_tensor(ggml_group_norm(ctx.ggml, input.tensor, groups, eps), input.shape, GGML_TYPE_F32);
    if (weights.weight.has_value()) {
        auto weight_view = engine::core::reshape_tensor(ctx, *weights.weight, TensorShape::from_dims({1, input.shape.dims[1], 1}));
        auto weight_rep = wrap_tensor(ggml_repeat(ctx.ggml, weight_view.tensor, output.tensor), output.shape, GGML_TYPE_F32);
        output = wrap_tensor(ggml_mul(ctx.ggml, output.tensor, weight_rep.tensor), output.shape, GGML_TYPE_F32);
    }
    if (weights.bias.has_value()) {
        auto bias_view = engine::core::reshape_tensor(ctx, *weights.bias, TensorShape::from_dims({1, input.shape.dims[1], 1}));
        auto bias_rep = wrap_tensor(ggml_repeat(ctx.ggml, bias_view.tensor, output.tensor), output.shape, GGML_TYPE_F32);
        output = wrap_tensor(ggml_add(ctx.ggml, output.tensor, bias_rep.tensor), output.shape, GGML_TYPE_F32);
    }
    return output;
}

}

SEANetDecoder::SEANetDecoder(SEANetDecoderConfig config) : config_(std::move(config)) {
    if (config_.input_channels <= 0 || config_.output_channels <= 0 || config_.final_kernel_size <= 0) {
        throw std::runtime_error("SEANetDecoderConfig dimensions must be positive");
    }
    if (config_.residual_layers <= 0 || config_.residual_hidden_divisor <= 0 || config_.residual_dilation_base <= 0) {
        throw std::runtime_error("SEANetDecoderConfig residual settings must be positive");
    }
    if (config_.stage_channels.empty() || config_.stage_channels.size() != config_.stage_strides.size()) {
        throw std::runtime_error("SEANetDecoderConfig stage_channels and stage_strides must be non-empty and same size");
    }
}

TensorValue SEANetDecoder::build(
    engine::core::ModuleBuildContext & ctx,
    const TensorValue & input,
    const SEANetDecoderWeights & weights) const {
    if (weights.stages.size() != config_.stage_channels.size()) {
        throw std::runtime_error("SEANetDecoderWeights stage count does not match config");
    }

    int64_t current_channels = config_.input_channels;
    auto x = StreamingConv1dModule({
        config_.input_channels,
        config_.input_channels,
        7,
        1,
        1,
        config_.use_bias,
        config_.pad_mode,
    }).build(ctx, input, weights.input_projection);

    for (size_t stage_index = 0; stage_index < config_.stage_channels.size(); ++stage_index) {
        const int64_t next_channels = config_.stage_channels[stage_index];
        const int stride = static_cast<int>(config_.stage_strides[stage_index]);
        const int64_t kernel_size = static_cast<int64_t>(stride) * 2;
        x = EluModule().build(ctx, x);
        x = build_streaming_convtranspose1d(ctx, x, weights.stages[stage_index].upsample, current_channels, next_channels, kernel_size, stride, config_.use_bias);

        if (weights.stages[stage_index].residual_blocks.size() != static_cast<size_t>(config_.residual_layers)) {
            throw std::runtime_error("SEANetDecoder stage residual block count does not match config.residual_layers");
        }
        for (int64_t residual_index = 0; residual_index < config_.residual_layers; ++residual_index) {
            int64_t dilation = 1;
            for (int64_t i = 0; i < residual_index; ++i) {
                dilation *= config_.residual_dilation_base;
            }
            x = build_seanet_residual_block(
                ctx,
                x,
                weights.stages[stage_index].residual_blocks[static_cast<size_t>(residual_index)],
                next_channels,
                next_channels / config_.residual_hidden_divisor,
                dilation,
                config_.use_bias,
                config_.pad_mode);
        }
        current_channels = next_channels;
    }

    x = EluModule().build(ctx, x);
    return StreamingConv1dModule({
        current_channels,
        config_.output_channels,
        config_.final_kernel_size,
        1,
        1,
        config_.use_bias,
        config_.pad_mode,
    }).build(ctx, x, weights.output_projection);
}

VocoderUpsampleBlock::VocoderUpsampleBlock(VocoderUpsampleBlockConfig config) : config_(config) {}

TensorValue VocoderUpsampleBlock::build(
    engine::core::ModuleBuildContext & ctx,
    const TensorValue & input,
    const VocoderUpsampleBlockWeights & weights) const {
    auto x = ConvTranspose1dModule({config_.channels_in, config_.channels_out, 4, 2, 0, 1, config_.use_bias}).build(ctx, input, weights.up);
    x = SiluModule().build(ctx, x);
    return Conv1dModule({config_.channels_out, config_.channels_out, 3, 1, 1, 1, config_.use_bias}).build(ctx, x, weights.post);
}

WaveNetResidualBlock::WaveNetResidualBlock(WaveNetResidualBlockConfig config) : config_(config) {}

TensorValue WaveNetResidualBlock::build(
    engine::core::ModuleBuildContext & ctx,
    const TensorValue & input,
    const WaveNetResidualBlockWeights & weights) const {
    auto filter = Conv1dModule({config_.channels, config_.channels, 3, 1, config_.dilation, config_.dilation, config_.use_bias}).build(ctx, input, weights.filter);
    auto gate = Conv1dModule({config_.channels, config_.channels, 3, 1, config_.dilation, config_.dilation, config_.use_bias}).build(ctx, input, weights.gate);
    filter = wrap_tensor(ggml_tanh(ctx.ggml, filter.tensor), filter.shape, GGML_TYPE_F32);
    gate = wrap_tensor(ggml_sigmoid(ctx.ggml, gate.tensor), gate.shape, GGML_TYPE_F32);
    auto gated = wrap_tensor(ggml_mul(ctx.ggml, filter.tensor, gate.tensor), filter.shape, GGML_TYPE_F32);
    auto residual = Conv1dModule({config_.channels, config_.channels, 1, 1, 0, 1, config_.use_bias}).build(ctx, gated, weights.residual);
    return wrap_tensor(ggml_add(ctx.ggml, input.tensor, residual.tensor), input.shape, GGML_TYPE_F32);
}

UNetResBlock1D::UNetResBlock1D(UNetResBlock1DConfig config) : config_(config) {}

TensorValue UNetResBlock1D::build(
    engine::core::ModuleBuildContext & ctx,
    const TensorValue & input,
    const UNetResBlock1DWeights & weights) const {
    auto x = group_norm_affine(ctx, input, config_.groups, config_.eps, weights.norm1);
    x = SiluModule().build(ctx, x);
    x = Conv1dModule({config_.channels, config_.channels, 3, 1, 1, 1, config_.use_bias}).build(ctx, x, weights.conv1);
    x = group_norm_affine(ctx, x, config_.groups, config_.eps, weights.norm2);
    x = SiluModule().build(ctx, x);
    x = Conv1dModule({config_.channels, config_.channels, 3, 1, 1, 1, config_.use_bias}).build(ctx, x, weights.conv2);
    return wrap_tensor(ggml_add(ctx.ggml, input.tensor, x.tensor), input.shape, GGML_TYPE_F32);
}

}  // namespace engine::codecs
