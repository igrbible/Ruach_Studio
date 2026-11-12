#include "engine/framework/audio/wav_reader.h"
#include "engine/framework/audio/wav_writer.h"
#include "engine/framework/debug/trace.h"
#include "engine/framework/io/json.h"
#include "engine/framework/runtime/registry.h"

#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {

std::string arg_value(int argc, char ** argv, const std::string & name, const std::string & fallback) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == name) {
            return argv[i + 1];
        }
    }
    return fallback;
}

int int_arg(int argc, char ** argv, const std::string & name, int fallback) {
    return std::stoi(arg_value(argc, argv, name, std::to_string(fallback)));
}

std::vector<std::string> repeated_arg_values(int argc, char ** argv, const std::string & name) {
    std::vector<std::string> values;
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == name) {
            values.emplace_back(argv[i + 1]);
        }
    }
    return values;
}

engine::core::BackendType parse_backend(const std::string & value) {
    if (value == "cpu") {
        return engine::core::BackendType::Cpu;
    }
    if (value == "cuda") {
        return engine::core::BackendType::Cuda;
    }
    if (value == "vulkan") {
        return engine::core::BackendType::Vulkan;
    }
    if (value == "best") {
        return engine::core::BackendType::BestAvailable;
    }
    throw std::runtime_error("unsupported MioCodec warmbench backend: " + value);
}

std::filesystem::path resolve_path(const std::string & value) {
    std::filesystem::path path(value);
    if (path.is_absolute()) {
        return path;
    }
    return std::filesystem::current_path() / path;
}

engine::runtime::AudioBuffer read_audio(const std::string & value) {
    const auto wav = engine::audio::read_wav_f32(resolve_path(value));
    return engine::runtime::AudioBuffer{wav.sample_rate, wav.channels, wav.samples};
}

std::string required_string(const engine::io::json::Value & object, const std::string & key) {
    const auto * value = object.find(key);
    if (value == nullptr || value->is_null() || value->as_string().empty()) {
        throw std::runtime_error("MioCodec warmbench request missing required field: " + key);
    }
    return value->as_string();
}

engine::runtime::TaskRequest make_request(const engine::io::json::Value & object) {
    engine::runtime::TaskRequest request;
    request.audio_input = read_audio(required_string(object, "source_audio"));
    engine::runtime::VoiceCondition voice;
    voice.speaker = engine::runtime::VoiceReference{read_audio(required_string(object, "target_audio")), std::nullopt};
    request.voice = std::move(voice);
    return request;
}

std::vector<engine::runtime::TaskRequest> parse_request_sequence(const std::string & request_sequence_json) {
    const auto root = engine::io::json::parse(request_sequence_json);
    std::vector<engine::runtime::TaskRequest> requests;
    for (const auto & item : root.as_array()) {
        requests.push_back(make_request(item));
    }
    return requests;
}

engine::io::json::Value number(double value) {
    return engine::io::json::Value::make_number(value);
}

engine::io::json::Value string(std::string value) {
    return engine::io::json::Value::make_string(std::move(value));
}

engine::io::json::Value audio_summary_json(const engine::runtime::AudioBuffer & audio) {
    if (audio.samples.empty()) {
        throw std::runtime_error("MioCodec warmbench received empty audio output");
    }
    double sum = 0.0;
    double abs_sum = 0.0;
    double sq_sum = 0.0;
    float min_value = audio.samples.front();
    float max_value = audio.samples.front();
    for (const float sample : audio.samples) {
        sum += static_cast<double>(sample);
        abs_sum += std::abs(static_cast<double>(sample));
        sq_sum += static_cast<double>(sample) * static_cast<double>(sample);
        min_value = std::min(min_value, sample);
        max_value = std::max(max_value, sample);
    }
    const auto channels = std::max(1, audio.channels);
    const auto frames = static_cast<double>(audio.samples.size() / static_cast<size_t>(channels));
    const auto count = static_cast<double>(audio.samples.size());
    return engine::io::json::Value::make_object({
        {"sample_rate", number(static_cast<double>(audio.sample_rate))},
        {"channels", number(static_cast<double>(audio.channels))},
        {"samples", number(count)},
        {"frames", number(frames)},
        {"sum", number(sum)},
        {"mean_abs", number(abs_sum / count)},
        {"rms", number(std::sqrt(sq_sum / count))},
        {"min", number(min_value)},
        {"max", number(max_value)},
    });
}

}  // namespace

int main(int argc, char ** argv) {
    try {
        const auto model_path = resolve_path(arg_value(argc, argv, "--model", "models/MioCodec-25Hz-44.1kHz-v2"));
        const auto backend_name = arg_value(argc, argv, "--backend", "cuda");
        const int device = int_arg(argc, argv, "--device", 0);
        const int threads = int_arg(argc, argv, "--threads", 8);
        const int warmup = int_arg(argc, argv, "--warmup", 1);
        const int iterations = int_arg(argc, argv, "--iterations", 1);
        const std::string request_sequence_json = arg_value(argc, argv, "--request-sequence-json", "");
        const std::string warmup_request_json = arg_value(argc, argv, "--warmup-request-json", "");
        const std::filesystem::path output_dir = arg_value(argc, argv, "--output-dir", "");
        const std::filesystem::path timing_path =
            arg_value(argc, argv, "--timing-file", "/tmp/miocodec_warm_bench_timing.log");
        if (request_sequence_json.empty()) {
            throw std::runtime_error("MioCodec warmbench requires --request-sequence-json");
        }

        if (!timing_path.empty()) {
            const auto parent = timing_path.parent_path();
            if (!parent.empty()) {
                std::filesystem::create_directories(parent);
            }
            std::ofstream clear_timing(timing_path, std::ios::trunc);
            if (!clear_timing) {
                throw std::runtime_error("failed to open MioCodec warmbench timing file: " + timing_path.string());
            }
            clear_timing.close();
            engine::debug::configure_logging(engine::debug::LoggingConfig{true, timing_path.string()});
        }

        engine::runtime::ModelLoadRequest load_request;
        load_request.model_path = model_path;
        load_request.family_hint = "miocodec";
        auto registry = engine::runtime::make_default_registry();
        auto model = registry.load(load_request);

        engine::runtime::SessionOptions options;
        options.backend.type = parse_backend(backend_name);
        options.backend.device = device;
        options.backend.threads = threads;
        for (const auto & option : repeated_arg_values(argc, argv, "--session-option")) {
            const auto pos = option.find('=');
            if (pos == std::string::npos || pos == 0) {
                throw std::runtime_error("invalid MioCodec warmbench --session-option: " + option);
            }
            options.options[option.substr(0, pos)] = option.substr(pos + 1);
        }
        auto session_base = model->create_task_session(
            {engine::runtime::VoiceTaskKind::VoiceConversion, engine::runtime::RunMode::Offline},
            options);
        auto * session = dynamic_cast<engine::runtime::IOfflineVoiceTaskSession *>(session_base.get());
        if (session == nullptr) {
            throw std::runtime_error("loaded MioCodec session is not offline-capable");
        }
        session->prepare({});

        if (!warmup_request_json.empty()) {
            const auto warmup_request = make_request(engine::io::json::parse(warmup_request_json));
            for (int warmup_index = 0; warmup_index < warmup; ++warmup_index) {
                (void)session->run(warmup_request);
            }
        }

        auto requests = parse_request_sequence(request_sequence_json);
        if (requests.empty()) {
            throw std::runtime_error("MioCodec warmbench request sequence is empty");
        }
        if (!output_dir.empty()) {
            std::filesystem::create_directories(output_dir);
        }

        engine::io::json::Value::Array steps;
        for (size_t request_index = 0; request_index < requests.size(); ++request_index) {
            engine::runtime::TaskResult last_result;
            double total_ms = 0.0;
            for (int iteration = 0; iteration < iterations; ++iteration) {
                const auto started = std::chrono::steady_clock::now();
                last_result = session->run(requests[request_index]);
                const auto ended = std::chrono::steady_clock::now();
                total_ms += std::chrono::duration<double, std::milli>(ended - started).count();
            }
            engine::debug::timing_log_scalar("miocodec.roundtrip_wall_ms", total_ms / iterations);
            if (!last_result.audio_output.has_value()) {
                throw std::runtime_error("MioCodec warmbench expected audio output");
            }
            const auto audio_path = output_dir / ("audio_" + std::to_string(request_index) + ".wav");
            if (!output_dir.empty()) {
                engine::audio::write_pcm16_wav(
                    audio_path,
                    last_result.audio_output->sample_rate,
                    last_result.audio_output->channels,
                    last_result.audio_output->samples);
            }
            steps.push_back(engine::io::json::Value::make_object({
                {"request_index", number(static_cast<double>(request_index))},
                {"stems", engine::io::json::Value::make_array({
                    engine::io::json::Value::make_object({
                        {"name", string("audio")},
                        {"audio", string(audio_path.string())},
                        {"summary", audio_summary_json(*last_result.audio_output)},
                    }),
                })},
                {"metrics", engine::io::json::Value::make_object({{"wall_ms", number(total_ms / iterations)}})},
            }));
        }
        engine::debug::reset_logging();

        std::cout << engine::io::json::stringify(engine::io::json::Value::make_object({
            {"family", string("miocodec")},
            {"backend", string(backend_name)},
            {"steps", engine::io::json::Value::make_array(std::move(steps))},
        })) << "\n";
        return 0;
    } catch (const std::exception & error) {
        std::cerr << "miocodec_warm_bench failed: " << error.what() << "\n";
        return 1;
    }
}
