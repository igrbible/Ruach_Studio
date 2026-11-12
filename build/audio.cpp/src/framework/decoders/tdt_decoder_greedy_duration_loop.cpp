#include "engine/framework/decoders/tdt_decoder_core.h"
#include "engine/framework/decoders/tdt_types.h"

#include <cstdint>
#include <stdexcept>
#include <vector>

namespace engine::decoders {

TdtDecodeResult run_tdt_decoder_greedy_duration_loop(
    TdtDecoderCore & core,
    const std::vector<float> & encoder_projected,
    int64_t frames,
    int64_t hidden_size,
    int32_t blank_id,
    const std::vector<int32_t> & durations,
    int64_t max_symbols_per_step) {
    if (frames < 0 || hidden_size <= 0) {
        throw std::runtime_error("Invalid TDT decoder input shape");
    }
    if (static_cast<int64_t>(encoder_projected.size()) != frames * hidden_size) {
        throw std::runtime_error("TDT decoder encoder_projected shape mismatch");
    }
    if (max_symbols_per_step <= 0) {
        throw std::runtime_error("TDT decoder max_symbols_per_step must be positive");
    }

    core.reset_state();
    core.predict_start(blank_id);

    TdtDecodeResult result;
    result.token_ids.reserve(static_cast<size_t>(frames));
    result.token_timestamps.reserve(static_cast<size_t>(frames));
    result.token_durations.reserve(static_cast<size_t>(frames));

    int64_t time_idx = 0;
    int64_t last_label_time_idx = -1;
    int64_t labels_at_current_time_idx = 0;

    while (time_idx < frames) {
        while (time_idx < frames) {
            const float * frame_ptr = encoder_projected.data() + static_cast<size_t>(time_idx * hidden_size);
            const TdtJointStep step = core.joint_step_argmax(frame_ptr);
            int32_t duration = durations.at(static_cast<size_t>(step.duration_index));

            if (step.label == blank_id) {
                if (duration == 0) {
                    duration = 1;
                }
                time_idx += duration;
                continue;
            }

            result.token_ids.push_back(step.label);
            result.token_timestamps.push_back(static_cast<int32_t>(time_idx));
            result.token_durations.push_back(duration);
            core.predict_token(step.label);

            if (time_idx == last_label_time_idx) {
                ++labels_at_current_time_idx;
            } else {
                last_label_time_idx = time_idx;
                labels_at_current_time_idx = 1;
            }

            time_idx += duration;

            if (labels_at_current_time_idx >= max_symbols_per_step && time_idx == last_label_time_idx) {
                ++time_idx;
            }

            break;
        }
    }

    return result;
}

}  // namespace engine::decoders
