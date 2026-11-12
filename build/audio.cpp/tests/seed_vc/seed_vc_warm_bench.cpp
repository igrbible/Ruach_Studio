#include "engine/framework/audio/wav_reader.h"
#include "engine/framework/audio/wav_writer.h"
#include "engine/framework/io/json.h"
#include "engine/framework/runtime/registry.h"

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <filesystem>
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
    throw std::runtime_error("unsupported Seed-VC warmbench backend: " + value);
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

std::string optional_string(const engine::io::json::Value & object, const std::string & key) {
    const auto * value = object.find(key);
    return value == nullptr || value->is_null() ? std::string{} : value->as_string();
}

std::string required_string(const engine::io::json::Value & object, const std::string & key) {
    const auto out = optional_string(object, key);
    if (out.empty()) {
        throw std::runtime_error("Seed-VC warmbench request missing required field: " + key);
    }
    return out;
}

std::string option_text(const engine::io::json::Value & value) {
    if (value.is_bool()) {
        return value.as_bool() ? "true" : "false";
    }
    if (value.is_number()) {
        return engine::io::json::stringify_number(value.as_number());
    }
    return value.as_string();
}

void set_optional_option(
    engine::runtime::TaskRequest & request,
    const engine::io::json::Value & object,
    const std::string & source,
    const std::string & target) {
    const auto * value = object.find(source);
    if (value != nullptr && !value->is_null()) {
        request.options[target] = option_text(*value);
    }
}

engine::runtime::VoiceTaskKind task_kind_from_path(const std::string & path) {
    if (path == "v2_vc" || path == "v1_whisper_bigvgan_vc" || path == "v1_xlsr_hift_vc") {
        return engine::runtime::VoiceTaskKind::VoiceConversion;
    }
    if (path == "v1_svc") {
        return engine::runtime::VoiceTaskKind::Svc;
    }
    throw std::runtime_error("unsupported Seed-VC warmbench path: " + path);
}

engine::runtime::TaskRequest make_request(const engine::io::json::Value & object) {
    engine::runtime::TaskRequest request;
    request.audio_input = read_audio(required_string(object, "source_audio"));
    engine::runtime::VoiceCondition voice;
    voice.speaker = engine::runtime::VoiceReference{read_audio(required_string(object, "target_audio")), std::nullopt};
    request.voice = std::move(voice);
    set_optional_option(request, object, "path", "seed_vc.path");
    set_optional_option(request, object, "diffusion_steps", "seed_vc.diffusion_steps");
    set_optional_option(request, object, "length_adjust", "seed_vc.length_adjust");
    set_optional_option(request, object, "inference_cfg_rate", "seed_vc.inference_cfg_rate");
    set_optional_option(request, object, "intelligibility_cfg_rate", "seed_vc.intelligibility_cfg_rate");
    set_optional_option(request, object, "similarity_cfg_rate", "seed_vc.similarity_cfg_rate");
    set_optional_option(request, object, "top_p", "seed_vc.top_p");
    set_optional_option(request, object, "temperature", "seed_vc.temperature");
    set_optional_option(request, object, "repetition_penalty", "seed_vc.repetition_penalty");
    set_optional_option(request, object, "convert_style", "seed_vc.convert_style");
    set_optional_option(request, object, "anonymization_only", "seed_vc.anonymization_only");
    set_optional_option(request, object, "seed", "seed_vc.seed");
    set_optional_option(request, object, "f0_condition", "seed_vc.f0_condition");
    set_optional_option(request, object, "auto_f0_adjust", "seed_vc.auto_f0_adjust");
    set_optional_option(request, object, "semi_tone_shift", "seed_vc.semi_tone_shift");
    return request;
}

void apply_noise_file(std::vector<engine::runtime::TaskRequest> & requests, const std::string & noise_file) {
    if (noise_file.empty()) {
        return;
    }
    for (auto & request : requests) {
        request.options["seed_vc.noise_file"] = noise_file;
    }
}

std::vector<engine::runtime::TaskRequest> parse_requests(const std::string & request_sequence_json) {
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
        throw std::runtime_error("Seed-VC warmbench received empty audio output");
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

void set_env_required(const char * key, const std::string & value) {
    if (setenv(key, value.c_str(), 1) != 0) {
        throw std::runtime_error("failed to set environment variable: " + std::string(key));
    }
}

}  // namespace

int main(int argc, char ** argv) {
    try {
        const auto model_path = resolve_path(arg_value(argc, argv, "--model", "models/SeedVC-MLX"));
        const auto backend_name = arg_value(argc, argv, "--backend", "cuda");
        const int device = int_arg(argc, argv, "--device", 0);
        const int threads = int_arg(argc, argv, "--threads", 8);
        const int iterations = int_arg(argc, argv, "--iterations", 1);
        const auto noise_file_arg = arg_value(argc, argv, "--noise-file", "");
        const auto noise_file = noise_file_arg.empty() ? std::string{} : resolve_path(noise_file_arg).string();
        const std::string request_sequence_json = arg_value(argc, argv, "--request-sequence-json", "");
        const std::filesystem::path output_dir = arg_value(argc, argv, "--output-dir", "");
        const std::filesystem::path timing_path =
            arg_value(argc, argv, "--timing-file", "/tmp/seed_vc_warm_bench_timing.log");
        if (request_sequence_json.empty()) {
            throw std::runtime_error("Seed-VC warmbench requires --request-sequence-json");
        }
        set_env_required("ENGINE_TIMING_ENABLED", "1");
        set_env_required("ENGINE_TIMING_FILE", timing_path.string());

        const auto root = engine::io::json::parse(request_sequence_json);
        const auto first_path = optional_string(root.as_array().front(), "path").empty()
            ? std::string("v2_vc")
            : optional_string(root.as_array().front(), "path");
        const auto task_kind = task_kind_from_path(first_path);

        engine::runtime::ModelLoadRequest load_request;
        load_request.model_path = model_path;
        load_request.family_hint = "seed_vc";
        auto registry = engine::runtime::make_default_registry();
        auto model = registry.load(load_request);

        engine::runtime::SessionOptions options;
        options.backend.type = parse_backend(backend_name);
        options.backend.device = device;
        options.backend.threads = threads;
        options.options["seed_vc.path"] = first_path;
        auto session_base =
            model->create_task_session({task_kind, engine::runtime::RunMode::Offline}, options);
        auto * session = dynamic_cast<engine::runtime::IOfflineVoiceTaskSession *>(session_base.get());
        if (session == nullptr) {
            throw std::runtime_error("loaded Seed-VC session is not offline-capable");
        }
        session->prepare({});

        auto requests = parse_requests(request_sequence_json);
        apply_noise_file(requests, noise_file);
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
            if (!last_result.audio_output.has_value()) {
                throw std::runtime_error("Seed-VC warmbench expected audio output");
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

        std::cout << engine::io::json::stringify(engine::io::json::Value::make_object({
            {"family", string("seed_vc")},
            {"backend", string(backend_name)},
            {"steps", engine::io::json::Value::make_array(std::move(steps))},
        })) << "\n";
        return 0;
    } catch (const std::exception & error) {
        std::cerr << "seed_vc_warm_bench failed: " << error.what() << "\n";
        return 1;
    }
}
