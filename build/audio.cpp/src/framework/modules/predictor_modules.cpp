#include "engine/framework/modules/predictor_modules.h"

#include "tensor_layout_utils.h"
#include "engine/framework/modules/activation_modules.h"
#include "engine/framework/modules/structural_modules.h"

#include <stdexcept>

namespace engine::modules {

DurationPredictorModule::DurationPredictorModule(DurationPredictorConfig config) : config_(config) {}

core::TensorValue DurationPredictorModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const DurationPredictorWeights & weights) const {
    auto x = tensor_layout::swap_channel_time_axes_3d(ctx, input);
    x = Conv1dModule({config_.hidden_size, config_.channels, 3, 1, 1, 1, config_.use_bias}).build(ctx, x, weights.conv1);
    x = ReluModule().build(ctx, x);
    x = Conv1dModule({config_.channels, config_.channels, 3, 1, 1, 1, config_.use_bias}).build(ctx, x, weights.conv2);
    x = ReluModule().build(ctx, x);
    x = Conv1dModule({config_.channels, 1, 1, 1, 0, 1, config_.use_bias}).build(ctx, x, weights.proj);
    x = core::wrap_tensor(ggml_cont(ctx.ggml, x.tensor), x.shape, x.type);
    return core::reshape_tensor(ctx, x, core::TensorShape::from_dims({input.shape.dims[0], input.shape.dims[1]}));
}

VariancePredictorModule::VariancePredictorModule(DurationPredictorConfig config) : config_(config) {}

core::TensorValue VariancePredictorModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const DurationPredictorWeights & weights) const {
    return DurationPredictorModule(config_).build(ctx, input, weights);
}

GlobalStyleTokenBlockModule::GlobalStyleTokenBlockModule(GlobalStyleTokenBlockConfig config) : config_(config) {}

core::TensorValue GlobalStyleTokenBlockModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & query,
    const GlobalStyleTokenBlockWeights & weights) const {
    auto query_seq = core::reshape_tensor(ctx, query, core::TensorShape::from_dims({query.shape.dims[0], 1, config_.style_dim}));
    auto token_seq = core::reshape_tensor(ctx, weights.tokens, core::TensorShape::from_dims({1, config_.token_count, config_.style_dim}));
    auto tokens = RepeatModule({core::TensorShape::from_dims({query.shape.dims[0], config_.token_count, config_.style_dim})}).build(ctx, token_seq);
    auto output = CrossAttentionModule({config_.style_dim, config_.num_heads, config_.use_bias}).build(ctx, query_seq, tokens, weights.attention);
    return core::reshape_tensor(ctx, output, core::TensorShape::from_dims({query.shape.dims[0], config_.style_dim}));
}

PosteriorEncoderBlockModule::PosteriorEncoderBlockModule(PosteriorEncoderBlockConfig config) : config_(config) {}

core::TensorValue PosteriorEncoderBlockModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const PosteriorEncoderBlockWeights & weights) const {
    auto x = Conv1dModule({config_.channels_in, 256, 3, 1, 1, 1, config_.use_bias}).build(ctx, input, weights.conv1);
    x = SiluModule().build(ctx, x);
    x = Conv1dModule({256, config_.latent_size, 3, 1, 1, 1, config_.use_bias}).build(ctx, x, weights.conv2);
    return tensor_layout::swap_channel_time_axes_3d(ctx, x);
}

FlowBlockModule::FlowBlockModule(FlowBlockConfig config) : config_(config) {}

core::TensorValue FlowBlockModule::build(
    core::ModuleBuildContext & ctx,
    const core::TensorValue & input,
    const FlowBlockWeights & weights) const {
    const int64_t half = config_.channels / 2;
    auto xa = SliceModule({1, 0, half}).build(ctx, input);
    auto xb = SliceModule({1, half, half}).build(ctx, input);
    auto log_scale = Conv1dModule({half, half, 1, 1, 0, 1, config_.use_bias}).build(ctx, xa, weights.scale);
    auto shift = Conv1dModule({half, half, 1, 1, 0, 1, config_.use_bias}).build(ctx, xa, weights.shift);
    log_scale = core::wrap_tensor(ggml_tanh(ctx.ggml, log_scale.tensor), log_scale.shape, GGML_TYPE_F32);
    auto scale = core::wrap_tensor(ggml_exp(ctx.ggml, log_scale.tensor), log_scale.shape, GGML_TYPE_F32);
    auto yb = core::wrap_tensor(ggml_mul(ctx.ggml, xb.tensor, scale.tensor), xb.shape, GGML_TYPE_F32);
    yb = core::wrap_tensor(ggml_add(ctx.ggml, yb.tensor, shift.tensor), yb.shape, GGML_TYPE_F32);
    return ConcatModule({1}).build(ctx, xa, yb);
}

}  // namespace engine::modules
