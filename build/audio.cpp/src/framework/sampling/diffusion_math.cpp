#include "engine/framework/sampling/diffusion_math.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace engine::sampling {
namespace {

void require_same_size(size_t lhs, size_t rhs, const char * message) {
    if (lhs != rhs) {
        throw std::runtime_error(message);
    }
}

void require_vector_shape(size_t size, int64_t frames, int64_t channels, const char * message) {
    if (frames <= 0 || channels <= 0 || size != static_cast<size_t>(frames * channels)) {
        throw std::runtime_error(message);
    }
}

}  // namespace

bool timestep_in_interval(float timestep, float start, float end) {
    return timestep >= start && timestep <= end;
}

std::vector<float> cfg_guidance(
    const std::vector<float> & pred_cond,
    const std::vector<float> & pred_uncond,
    float guidance_scale) {
    require_same_size(pred_cond.size(), pred_uncond.size(), "CFG branch size mismatch");
    std::vector<float> out(pred_cond.size(), 0.0F);
    for (size_t i = 0; i < pred_cond.size(); ++i) {
        out[i] = pred_uncond[i] + guidance_scale * (pred_cond[i] - pred_uncond[i]);
    }
    return out;
}

std::vector<float> apg_guidance(
    const std::vector<float> & pred_cond,
    const std::vector<float> & pred_uncond,
    float guidance_scale,
    int64_t frames,
    int64_t channels,
    std::vector<float> & momentum,
    float momentum_coeff,
    double norm_threshold) {
    constexpr double kEps = 1.0e-12;
    require_vector_shape(pred_cond.size(), frames, channels, "APG branch shape mismatch");
    require_same_size(pred_cond.size(), pred_uncond.size(), "APG branch size mismatch");
    if (momentum.size() != pred_cond.size()) {
        momentum.assign(pred_cond.size(), 0.0F);
    }
    std::vector<float> out(pred_cond.size(), 0.0F);
    for (size_t i = 0; i < pred_cond.size(); ++i) {
        const float update = pred_cond[i] - pred_uncond[i];
        momentum[i] = update + momentum_coeff * momentum[i];
    }
    for (int64_t channel = 0; channel < channels; ++channel) {
        double diff_norm_sq = 0.0;
        double pred_norm_sq = 0.0;
        for (int64_t frame = 0; frame < frames; ++frame) {
            const size_t index = static_cast<size_t>(frame * channels + channel);
            diff_norm_sq += static_cast<double>(momentum[index]) * momentum[index];
            pred_norm_sq += static_cast<double>(pred_cond[index]) * pred_cond[index];
        }
        const double diff_norm = std::sqrt(diff_norm_sq);
        const double limiter = diff_norm > kEps ? std::min(1.0, norm_threshold / diff_norm) : 1.0;
        const double pred_norm = std::sqrt(pred_norm_sq);
        double dot = 0.0;
        for (int64_t frame = 0; frame < frames; ++frame) {
            const size_t index = static_cast<size_t>(frame * channels + channel);
            const double diff = static_cast<double>(momentum[index]) * limiter;
            const double unit = static_cast<double>(pred_cond[index]) / std::max(pred_norm, kEps);
            dot += diff * unit;
        }
        for (int64_t frame = 0; frame < frames; ++frame) {
            const size_t index = static_cast<size_t>(frame * channels + channel);
            const double diff = static_cast<double>(momentum[index]) * limiter;
            const double unit = static_cast<double>(pred_cond[index]) / std::max(pred_norm, kEps);
            const double parallel = dot * unit;
            const double orthogonal = diff - parallel;
            out[index] = static_cast<float>(
                static_cast<double>(pred_cond[index]) +
                static_cast<double>(guidance_scale - 1.0F) * orthogonal);
        }
    }
    return out;
}

std::vector<float> adg_guidance(
    const std::vector<float> & latents,
    const std::vector<float> & pred_cond,
    const std::vector<float> & pred_uncond,
    float sigma,
    float guidance_scale,
    int64_t frames,
    int64_t channels,
    float angle_clip) {
    constexpr float kEps = 1.0e-8F;
    require_vector_shape(pred_cond.size(), frames, channels, "ADG branch shape mismatch");
    require_same_size(latents.size(), pred_cond.size(), "ADG latent/condition size mismatch");
    require_same_size(pred_cond.size(), pred_uncond.size(), "ADG branch size mismatch");
    if (std::abs(sigma) <= kEps) {
        throw std::runtime_error("ADG sigma must be nonzero");
    }
    float weight = guidance_scale - 1.0F;
    weight = weight * (weight > 0.0F ? 1.0F : 0.0F) + 1.0e-3F;

    std::vector<float> out(pred_cond.size(), 0.0F);
    for (int64_t frame = 0; frame < frames; ++frame) {
        const size_t offset = static_cast<size_t>(frame * channels);
        float text_norm_sq = 0.0F;
        float uncond_norm_sq = 0.0F;
        float text_uncond_dot = 0.0F;
        float diff_uncond_dot = 0.0F;
        float uncond_norm_square_for_projection = 0.0F;
        for (int64_t channel = 0; channel < channels; ++channel) {
            const size_t index = offset + static_cast<size_t>(channel);
            const float latent_hat_text = latents[index] - sigma * pred_cond[index];
            const float latent_hat_uncond = latents[index] - sigma * pred_uncond[index];
            const float latent_diff = latent_hat_text - latent_hat_uncond;
            text_norm_sq += latent_hat_text * latent_hat_text;
            uncond_norm_sq += latent_hat_uncond * latent_hat_uncond;
            text_uncond_dot += latent_hat_text * latent_hat_uncond;
            diff_uncond_dot += latent_diff * latent_hat_uncond;
            uncond_norm_square_for_projection += latent_hat_uncond * latent_hat_uncond;
        }
        const float norm_product = std::sqrt(text_norm_sq) * std::sqrt(uncond_norm_sq);
        float cos_theta = text_uncond_dot / std::max(norm_product, kEps);
        cos_theta = std::clamp(cos_theta, -1.0F + 1.0e-6F, 1.0F - 1.0e-6F);
        const float theta = std::acos(cos_theta);
        const float theta_new = std::clamp(weight * theta, -angle_clip, angle_clip);
        const float sin_theta = std::sin(theta);
        const float sin_scale = sin_theta > 1.0e-3F ? std::sin(theta_new) / sin_theta : weight;
        const float projection_scale = diff_uncond_dot / (uncond_norm_square_for_projection + kEps);
        for (int64_t channel = 0; channel < channels; ++channel) {
            const size_t index = offset + static_cast<size_t>(channel);
            const float latent_hat_text = latents[index] - sigma * pred_cond[index];
            const float latent_hat_uncond = latents[index] - sigma * pred_uncond[index];
            const float latent_diff = latent_hat_text - latent_hat_uncond;
            const float projection = projection_scale * latent_hat_uncond;
            const float perpendicular = latent_diff - projection;
            const float latent_new = std::cos(theta_new) * latent_hat_text + perpendicular * sin_scale;
            out[index] = (latents[index] - latent_new) / sigma;
        }
    }
    return out;
}

void clamp_velocity_norm(
    std::vector<float> & velocity,
    const std::vector<float> & reference,
    float threshold) {
    if (threshold <= 0.0F) {
        return;
    }
    require_same_size(velocity.size(), reference.size(), "velocity/reference size mismatch");
    float velocity_norm = 0.0F;
    float reference_norm = 0.0F;
    for (size_t i = 0; i < velocity.size(); ++i) {
        velocity_norm += velocity[i] * velocity[i];
        reference_norm += reference[i] * reference[i];
    }
    velocity_norm = std::sqrt(velocity_norm);
    reference_norm = std::sqrt(reference_norm) + 1e-10F;
    const float scale = std::min(1.0F, threshold * reference_norm / (velocity_norm + 1e-10F));
    for (float & value : velocity) {
        value *= scale;
    }
}

std::vector<float> euler_step(
    const std::vector<float> & x,
    const std::vector<float> & velocity,
    float dt) {
    std::vector<float> out = x;
    euler_step_in_place(out, velocity, dt);
    return out;
}

void euler_step_in_place(
    std::vector<float> & x,
    const std::vector<float> & velocity,
    float dt) {
    if (x.size() < velocity.size()) {
        throw std::runtime_error("Euler step state/velocity size mismatch");
    }
    for (size_t i = 0; i < velocity.size(); ++i) {
        x[i] -= velocity[i] * dt;
    }
}

std::vector<float> denoise_from_velocity(
    const std::vector<float> & x,
    const std::vector<float> & velocity,
    float t) {
    return euler_step(x, velocity, t);
}

std::vector<float> renoise(
    const std::vector<float> & denoised,
    const std::vector<float> & noise,
    float t) {
    require_same_size(denoised.size(), noise.size(), "renoise input/noise size mismatch");
    std::vector<float> out(denoised.size(), 0.0F);
    for (size_t i = 0; i < denoised.size(); ++i) {
        out[i] = t * noise[i] + (1.0F - t) * denoised[i];
    }
    return out;
}

std::vector<float> heun_combine_velocity(
    const std::vector<float> & velocity_first,
    const std::vector<float> & velocity_second) {
    require_same_size(velocity_first.size(), velocity_second.size(), "Heun velocity size mismatch");
    std::vector<float> out(velocity_first.size(), 0.0F);
    for (size_t i = 0; i < velocity_first.size(); ++i) {
        out[i] = 0.5F * (velocity_first[i] + velocity_second[i]);
    }
    return out;
}

std::vector<float> heun_step(
    const std::vector<float> & x_before,
    const std::vector<float> & velocity_first,
    const std::vector<float> & velocity_second,
    float dt) {
    const std::vector<float> combined = heun_combine_velocity(velocity_first, velocity_second);
    return euler_step(x_before, combined, dt);
}

std::vector<float> build_soft_mask(
    const std::vector<int32_t> & mask,
    int64_t crossfade_frames) {
    std::vector<float> soft_mask(mask.size(), 0.0F);
    for (size_t i = 0; i < mask.size(); ++i) {
        soft_mask[i] = mask[i] != 0 ? 1.0F : 0.0F;
    }
    if (crossfade_frames <= 0 || mask.empty()) {
        return soft_mask;
    }
    const auto first = std::find(mask.begin(), mask.end(), 1);
    if (first == mask.end()) {
        return soft_mask;
    }
    const auto last = std::find(mask.rbegin(), mask.rend(), 1);
    const int64_t left = static_cast<int64_t>(std::distance(mask.begin(), first));
    const int64_t right = static_cast<int64_t>(mask.size() - std::distance(mask.rbegin(), last));
    const int64_t fade_start = std::max<int64_t>(left - crossfade_frames, 0);
    const int64_t left_ramp_len = left - fade_start;
    for (int64_t i = 0; i < left_ramp_len; ++i) {
        soft_mask[static_cast<size_t>(fade_start + i)] =
            static_cast<float>(i + 1) / static_cast<float>(left_ramp_len + 1);
    }
    const int64_t fade_end = std::min<int64_t>(right + crossfade_frames, static_cast<int64_t>(mask.size()));
    const int64_t right_ramp_len = fade_end - right;
    for (int64_t i = 0; i < right_ramp_len; ++i) {
        soft_mask[static_cast<size_t>(right + i)] =
            static_cast<float>(right_ramp_len - i) / static_cast<float>(right_ramp_len + 1);
    }
    return soft_mask;
}

std::vector<float> blend_by_mask(
    const std::vector<float> & generated,
    const std::vector<float> & source,
    const std::vector<float> & soft_mask,
    int64_t channels) {
    std::vector<float> out = generated;
    blend_by_mask_in_place(out, source, soft_mask, channels);
    return out;
}

void blend_by_mask_in_place(
    std::vector<float> & generated,
    const std::vector<float> & source,
    const std::vector<float> & soft_mask,
    int64_t channels) {
    require_same_size(generated.size(), source.size(), "mask blend generated/source size mismatch");
    if (channels <= 0 ||
        generated.size() % static_cast<size_t>(channels) != 0 ||
        soft_mask.size() != generated.size() / static_cast<size_t>(channels)) {
        throw std::runtime_error("mask blend shape mismatch");
    }
    for (size_t frame = 0; frame < soft_mask.size(); ++frame) {
        const float mix = soft_mask[frame];
        const size_t offset = frame * static_cast<size_t>(channels);
        for (int64_t channel = 0; channel < channels; ++channel) {
            const size_t index = offset + static_cast<size_t>(channel);
            generated[index] = mix * generated[index] + (1.0F - mix) * source[index];
        }
    }
}

std::vector<float> repaint_step_injection(
    const std::vector<float> & generated,
    const std::vector<float> & clean_source,
    const std::vector<int32_t> & repaint_mask,
    float next_timestep,
    const std::vector<float> & noise,
    int64_t channels) {
    require_same_size(generated.size(), clean_source.size(), "repaint injection generated/source size mismatch");
    require_same_size(generated.size(), noise.size(), "repaint injection generated/noise size mismatch");
    if (channels <= 0 ||
        generated.size() % static_cast<size_t>(channels) != 0 ||
        repaint_mask.size() != generated.size() / static_cast<size_t>(channels)) {
        throw std::runtime_error("repaint injection shape mismatch");
    }
    std::vector<float> out = generated;
    for (size_t frame = 0; frame < repaint_mask.size(); ++frame) {
        if (repaint_mask[frame] != 0) {
            continue;
        }
        const size_t offset = frame * static_cast<size_t>(channels);
        for (int64_t channel = 0; channel < channels; ++channel) {
            const size_t index = offset + static_cast<size_t>(channel);
            out[index] = next_timestep * noise[index] + (1.0F - next_timestep) * clean_source[index];
        }
    }
    return out;
}

}  // namespace engine::sampling
