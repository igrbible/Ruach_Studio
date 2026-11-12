#include "engine/framework/decoders/tdt_decoder_core.h"
#include "engine/framework/decoders/tdt_types.h"

#include <cstdint>
#include <stdexcept>
#include <vector>

namespace engine::decoders {

TdtDecodeResult run_tdt_decoder_greedy_separate_heads(
    TdtDecoderCore &,
    const std::vector<float> &,
    int64_t,
    int64_t,
    int32_t,
    const std::vector<int32_t> &,
    int64_t) {
    throw std::runtime_error(
        "TDT decoder algorithm 'greedy_separate_heads' requires separate label and duration heads");
}

}  // namespace engine::decoders
