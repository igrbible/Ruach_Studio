#include "../core/audio_task_warm_bench.h"

int main(int argc, char ** argv) {
    try {
        engine::tools::AudioTaskBenchConfig config;
        config.family = "silero_vad";
        config.default_model = "assets/framework/models/silero_vad";
        config.task = engine::runtime::VoiceTaskKind::Vad;
        config.output_kind = engine::tools::AudioTaskOutputKind::Vad;
        return engine::tools::run_audio_task_warm_bench(
            argc,
            argv,
            config);
    } catch (const std::exception & ex) {
        std::cerr << "silero_vad_warm_bench failed: " << ex.what() << "\n";
        return 1;
    }
}
