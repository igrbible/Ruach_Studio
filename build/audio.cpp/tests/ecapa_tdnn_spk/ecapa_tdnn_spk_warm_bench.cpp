#include "../core/audio_task_warm_bench.h"

int main(int argc, char ** argv) {
    try {
        engine::tools::AudioTaskBenchConfig config;
        config.family = "ecapa_tdnn_spk";
        config.default_model = "models/ecapa_tdnn";
        config.task = engine::runtime::VoiceTaskKind::SpeakerRecognition;
        config.output_kind = engine::tools::AudioTaskOutputKind::Speaker;
        return engine::tools::run_audio_task_warm_bench(
            argc,
            argv,
            config);
    } catch (const std::exception & ex) {
        std::cerr << "ecapa_tdnn_spk_warm_bench failed: " << ex.what() << "\n";
        return 1;
    }
}
