#include "engine/framework/audio/activity.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace engine::audio {

AudioActivityRegion find_interleaved_audio_activity_region(
    const std::vector<float> & interleaved_samples,
    int channel_count,
    int sample_rate_hz,
    int64_t start_frame,
    int64_t frame_count,
    float threshold_dbfs,
    double window_seconds,
    double margin_seconds) {
    if (channel_count <= 0 || sample_rate_hz <= 0) {
        throw std::runtime_error("audio activity detection requires positive audio metadata");
    }
    if (start_frame < 0 || frame_count < 0 || window_seconds <= 0.0 || margin_seconds < 0.0) {
        throw std::runtime_error("audio activity detection received invalid timing parameters");
    }
    if (interleaved_samples.size() % static_cast<size_t>(channel_count) != 0) {
        throw std::runtime_error("audio activity detection samples are not divisible by channel count");
    }
    const int64_t total_frames =
        static_cast<int64_t>(interleaved_samples.size() / static_cast<size_t>(channel_count));
    if (start_frame > total_frames || frame_count > total_frames - start_frame) {
        throw std::runtime_error("audio activity detection window exceeds the input audio length");
    }
    AudioActivityRegion out;
    out.start_frame = start_frame;
    out.end_frame = start_frame;
    if (frame_count == 0) {
        return out;
    }

    const int64_t window_frames =
        std::max<int64_t>(1, static_cast<int64_t>(std::llround(window_seconds * static_cast<double>(sample_rate_hz))));
    const int64_t margin_frames =
        std::max<int64_t>(0, static_cast<int64_t>(std::llround(margin_seconds * static_cast<double>(sample_rate_hz))));
    const double threshold = std::pow(10.0, static_cast<double>(threshold_dbfs) / 20.0);
    const double threshold_energy = threshold * threshold;
    const int64_t region_end = start_frame + frame_count;
    int64_t first_active = region_end;
    int64_t last_active = start_frame;

    for (int64_t window_start = start_frame; window_start < region_end; window_start += window_frames) {
        const int64_t window_end = std::min(region_end, window_start + window_frames);
        double energy = 0.0;
        int64_t count = 0;
        for (int64_t frame = window_start; frame < window_end; ++frame) {
            const size_t base = static_cast<size_t>(frame * channel_count);
            for (int channel = 0; channel < channel_count; ++channel) {
                const float sample = interleaved_samples[base + static_cast<size_t>(channel)];
                energy += static_cast<double>(sample) * static_cast<double>(sample);
                ++count;
            }
        }
        const double mean_energy = count > 0 ? energy / static_cast<double>(count) : 0.0;
        if (mean_energy > threshold_energy) {
            first_active = std::min(first_active, window_start);
            last_active = std::max(last_active, window_end);
        }
    }
    if (first_active >= last_active) {
        return out;
    }
    out.has_activity = true;
    out.start_frame = std::max(start_frame, first_active - margin_frames);
    out.end_frame = std::min(region_end, last_active + margin_frames);
    return out;
}

}  // namespace engine::audio
