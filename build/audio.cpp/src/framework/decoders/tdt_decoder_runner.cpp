#include "engine/framework/decoders/tdt_decoder_runner.h"

#include <stdexcept>

namespace engine::decoders {

TdtDecodeResult run_tdt_decoder_greedy_customized(
    TdtDecoderCore & core,
    const std::vector<float> & encoder_projected,
    int64_t frames,
    int64_t hidden_size,
    int32_t blank_id,
    const std::vector<int32_t> & durations,
    int64_t max_symbols_per_step);

TdtDecodeResult run_tdt_decoder_greedy_duration_loop(
    TdtDecoderCore & core,
    const std::vector<float> & encoder_projected,
    int64_t frames,
    int64_t hidden_size,
    int32_t blank_id,
    const std::vector<int32_t> & durations,
    int64_t max_symbols_per_step);

TdtDecodeResult run_tdt_decoder_greedy_separate_heads(
    TdtDecoderCore & core,
    const std::vector<float> & encoder_projected,
    int64_t frames,
    int64_t hidden_size,
    int32_t blank_id,
    const std::vector<int32_t> & durations,
    int64_t max_symbols_per_step);

TdtDecodeResult run_tdt_decoder(
    TdtDecoderAlgorithm algorithm,
    TdtDecoderCore & core,
    const std::vector<float> & encoder_projected,
    int64_t frames,
    int64_t hidden_size,
    int32_t blank_id,
    const std::vector<int32_t> & durations,
    int64_t max_symbols_per_step) {
    switch (algorithm) {
        case TdtDecoderAlgorithm::GreedyCustomized:
            return run_tdt_decoder_greedy_customized(
                core,
                encoder_projected,
                frames,
                hidden_size,
                blank_id,
                durations,
                max_symbols_per_step);
        case TdtDecoderAlgorithm::GreedyDurationLoop:
            return run_tdt_decoder_greedy_duration_loop(
                core,
                encoder_projected,
                frames,
                hidden_size,
                blank_id,
                durations,
                max_symbols_per_step);
        case TdtDecoderAlgorithm::GreedySeparateHeads:
            return run_tdt_decoder_greedy_separate_heads(
                core,
                encoder_projected,
                frames,
                hidden_size,
                blank_id,
                durations,
                max_symbols_per_step);
    }
    throw std::runtime_error("Unsupported TDT decoder algorithm");
}

}  // namespace engine::decoders
