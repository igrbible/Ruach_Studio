#include "engine/framework/sampling/diffusion_math.h"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

void require_close(float actual, float expected, float tolerance, const char * label) {
    if (std::fabs(actual - expected) > tolerance) {
        throw std::runtime_error(
            std::string(label) + " mismatch: expected " + std::to_string(expected) +
            ", got " + std::to_string(actual));
    }
}

void require_vector_close(
    const std::vector<float> & actual,
    const std::vector<float> & expected,
    float tolerance,
    const char * label) {
    if (actual.size() != expected.size()) {
        throw std::runtime_error(std::string(label) + " size mismatch");
    }
    for (size_t i = 0; i < actual.size(); ++i) {
        require_close(actual[i], expected[i], tolerance, label);
    }
}

void test_guidance() {
    const std::vector<float> pred_cond{0.4F, -0.2F, 0.8F, -0.5F, 0.1F, 0.6F};
    const std::vector<float> pred_uncond{-0.1F, 0.3F, 0.2F, 0.4F, -0.6F, 0.0F};
    require_vector_close(
        engine::sampling::cfg_guidance(pred_cond, pred_uncond, 2.5F),
        {1.15F, -0.95F, 1.7F, -1.85F, 1.15F, 1.5F},
        2.0e-6F,
        "cfg python reference");

    std::vector<float> momentum(6, 0.0F);
    require_vector_close(
        engine::sampling::apg_guidance(pred_cond, pred_uncond, 2.0F, 2, 3, momentum),
        {0.265853659F, -0.02F, 0.728F, -0.60731709F, 0.46F, 0.696F},
        2.0e-6F,
        "apg python reference");

    const std::vector<float> latents{1.2F, -0.7F, 0.3F, 2.0F, -1.1F, 0.5F};
    require_vector_close(
        engine::sampling::adg_guidance(latents, pred_cond, pred_uncond, 0.6F, 2.25F, 2, 3),
        {0.35072118F, -0.34340942F, 1.41628838F, -0.47153577F, 0.47726715F, 1.64375424F},
        2.0e-6F,
        "adg python reference");

    const std::vector<float> zero_latents{0.0F, 0.0F};
    const std::vector<float> zero_pred{0.0F, 0.0F};
    const auto zero_adg = engine::sampling::adg_guidance(zero_latents, zero_pred, zero_pred, 1.0F, 2.0F, 1, 2);
    require_vector_close(zero_adg, {0.0F, 0.0F}, 1.0e-6F, "adg zero norm finite");
}

void test_velocity_and_steps() {
    std::vector<float> velocity{3.0F, 4.0F};
    engine::sampling::clamp_velocity_norm(velocity, {6.0F, 8.0F}, 0.5F);
    require_vector_close(velocity, {3.0F, 4.0F}, 1.0e-5F, "velocity clamp at threshold");

    std::vector<float> scaled{6.0F, 8.0F};
    engine::sampling::clamp_velocity_norm(scaled, {3.0F, 4.0F}, 0.5F);
    require_vector_close(scaled, {1.5F, 2.0F}, 1.0e-5F, "velocity clamp scales");

    std::vector<float> zero{0.0F, 0.0F};
    engine::sampling::clamp_velocity_norm(zero, {0.0F, 0.0F}, 0.5F);
    require_vector_close(zero, {0.0F, 0.0F}, 0.0F, "velocity clamp zero");

    const std::vector<float> x{1.0F, 2.0F, 3.0F};
    const std::vector<float> v{0.5F, -1.0F, 4.0F};
    const std::vector<float> v2{1.0F, 1.0F, 0.0F};
    require_vector_close(engine::sampling::euler_step(x, v, 0.25F), {0.875F, 2.25F, 2.0F}, 0.0F, "euler");
    require_vector_close(engine::sampling::denoise_from_velocity(x, v, 0.75F), {0.625F, 2.75F, 0.0F}, 0.0F, "denoise");
    require_vector_close(engine::sampling::renoise(x, {-1.0F, 0.0F, 2.0F}, 0.2F), {0.6F, 1.6F, 2.8F}, 2.0e-6F, "renoise");
    require_vector_close(engine::sampling::heun_combine_velocity(v, v2), {0.75F, 0.0F, 2.0F}, 0.0F, "heun combine");
    require_vector_close(engine::sampling::heun_step(x, v, v2, 0.25F), {0.8125F, 2.0F, 2.5F}, 0.0F, "heun step");
}

void test_masks() {
    require_vector_close(
        engine::sampling::build_soft_mask({0, 0, 1, 1, 1, 0, 0}, 2),
        {1.0F / 3.0F, 2.0F / 3.0F, 1.0F, 1.0F, 1.0F, 2.0F / 3.0F, 1.0F / 3.0F},
        1.0e-6F,
        "soft mask reference");
    require_vector_close(engine::sampling::build_soft_mask({0, 0, 0}, 2), {0.0F, 0.0F, 0.0F}, 0.0F, "soft mask all zero");
    require_vector_close(engine::sampling::build_soft_mask({1, 1, 1}, 2), {1.0F, 1.0F, 1.0F}, 0.0F, "soft mask all one");

    require_vector_close(
        engine::sampling::blend_by_mask(
            {10.0F, 20.0F, 30.0F, 40.0F, 50.0F, 60.0F, 70.0F, 80.0F},
            {1.0F, 2.0F, 3.0F, 4.0F, 5.0F, 6.0F, 7.0F, 8.0F},
            engine::sampling::build_soft_mask({0, 1, 1, 0}, 1),
            2),
        {5.5F, 11.0F, 30.0F, 40.0F, 50.0F, 60.0F, 38.5F, 44.0F},
        1.0e-6F,
        "blend by mask reference");

    require_vector_close(
        engine::sampling::repaint_step_injection(
            {10.0F, 20.0F, 30.0F, 40.0F, 50.0F, 60.0F},
            {1.0F, 2.0F, 3.0F, 4.0F, 5.0F, 6.0F},
            {0, 1, 0},
            0.25F,
            {-1.0F, -2.0F, -3.0F, -4.0F, -5.0F, -6.0F},
            2),
        {0.5F, 1.0F, 30.0F, 40.0F, 2.5F, 3.0F},
        0.0F,
        "repaint injection reference");
}

}  // namespace

int main() {
    try {
        test_guidance();
        test_velocity_and_steps();
        test_masks();
    } catch (const std::exception & error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
    std::cout << "diffusion_math_test passed\n";
    return 0;
}
