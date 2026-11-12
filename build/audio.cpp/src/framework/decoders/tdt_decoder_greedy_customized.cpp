#include "engine/framework/decoders/tdt_decoder_core.h"
#include "engine/framework/decoders/tdt_types.h"

#include <algorithm>
#include <cstdint>
#include <stdexcept>
#include <vector>

namespace engine::decoders {

TdtDecodeResult run_tdt_decoder_greedy_customized(
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

    core.reset_state();
    core.predict_start(blank_id);

    TdtDecodeResult result;
    result.token_ids.reserve(static_cast<size_t>(frames));
    result.token_timestamps.reserve(static_cast<size_t>(frames));
    result.token_durations.reserve(static_cast<size_t>(frames));

    int64_t time_idx = 0;
    while (time_idx < frames) {
        bool frame_advanced = false;

        for (int64_t symbols_added = 0; time_idx < frames && symbols_added < max_symbols_per_step; ++symbols_added) {
            const float * frame_ptr = encoder_projected.data() + static_cast<size_t>(time_idx * hidden_size);
            const TdtJointStep step = core.joint_step_argmax(frame_ptr);
            const int64_t emit_time_idx = time_idx;
            const int32_t duration = durations.at(static_cast<size_t>(step.duration_index));

            if (step.label == blank_id) {
                time_idx += std::max<int32_t>(duration, 1);
                frame_advanced = true;
                break;
            }

            result.token_ids.push_back(step.label);
            result.token_timestamps.push_back(static_cast<int32_t>(emit_time_idx));
            result.token_durations.push_back(duration);
            core.predict_token(step.label);

            if (duration > 0) {
                time_idx += duration;
                frame_advanced = true;
                break;
            }
        }

        if (!frame_advanced) {
            ++time_idx;
        }
    }

    return result;
}

}  // namespace engine::decoders
