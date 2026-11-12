#include "engine/framework/audio/wav_writer.h"
#include "engine/framework/io/json.h"
#include "engine/framework/runtime/registry.h"

#include <algorithm>
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

std::vector<std::pair<std::string, std::string>> parse_session_options(int argc, char ** argv) {
    std::vector<std::pair<std::string, std::string>> out;
    for (int i = 1; i + 1 < argc; ++i) {
        if (std::string(argv[i]) != "--session-option") {
            continue;
        }
        const std::string option = argv[i + 1];
        const size_t eq = option.find('=');
        if (eq == std::string::npos || eq == 0) {
            throw std::runtime_error("invalid Vevo2 --session-option: " + option);
        }
        out.emplace_back(option.substr(0, eq), option.substr(eq + 1));
    }
    return out;
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
    throw std::runtime_error("unsupported Vevo2 warmbench backend: " + value);
}

void set_env_required(const char * key, const std::string & value) {
    if (setenv(key, value.c_str(), 1) != 0) {
        throw std::runtime_error("failed to set environment variable: " + std::string(key));
    }
}

std::string option_text(const engine::io::json::Value & value) {
    if (value.is_bool()) {
        return value.as_bool() ? "true" : "false";
    }
    if (value.is_number()) {
        return engine::io::json::stringify_number(value.as_number());
    }
    if (value.is_array()) {
        return engine::io::json::stringify(value);
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

std::string optional_string(const engine::io::json::Value & object, const std::string & key) {
    const auto * value = object.find(key);
    return value == nullptr || value->is_null() ? std::string{} : value->as_string();
}

std::string required_string(const engine::io::json::Value & object, const std::string & key) {
    const auto out = optional_string(object, key);
    if (out.empty()) {
        throw std::runtime_error("Vevo2 warmbench request missing required string field: " + key);
    }
    return out;
}

bool is_ar_route(const std::string & path) {
    return path == "ar_and_fm" ||
        path == "inference_ar_and_fm" ||
        path == "zero_shot_tts" ||
        path == "tts" ||
        path == "text_to_speech" ||
        path == "text_to_singing" ||
        path == "svs" ||
        path == "singing_voice_synthesis" ||
        path == "style_converted_vc" ||
        path == "style_converted_svc" ||
        path == "style_conversion" ||
        path == "editing" ||
        path == "speech_editing" ||
        path == "singing_editing" ||
        path == "singing_style_conversion" ||
        path == "melody_control" ||
        path == "humming_to_singing" ||
        path == "instrument_to_singing" ||
        path == "text_prosody_to_target_voice";
}

engine::runtime::TaskRequest make_request(const engine::io::json::Value & object, const std::string & noise_file) {
    engine::runtime::TaskRequest request;
    const std::string path = optional_string(object, "path").empty() ? "ar_and_fm" : optional_string(object, "path");
    request.options["vevo2.path"] = path;
    if (is_ar_route(path)) {
        request.text_input = engine::runtime::Transcript{required_string(object, "target_text"), ""};
    }

    set_optional_option(request, object, "target_text", "vevo2.target_text");
    set_optional_option(request, object, "style_ref_text", "vevo2.style_ref_text");
    set_optional_option(request, object, "source_wav_text", "vevo2.source_wav_text");
    set_optional_option(request, object, "timbre_ref_wav_text", "vevo2.timbre_ref_wav_text");
    set_optional_option(request, object, "source_wav_path", "vevo2.source_wav_path");
    set_optional_option(request, object, "prosody_wav_path", "vevo2.prosody_wav_path");
    set_optional_option(request, object, "style_ref_wav_path", "vevo2.style_ref_wav_path");
    set_optional_option(request, object, "timbre_ref_wav_path", "vevo2.timbre_ref_wav_path");
    set_optional_option(request, object, "use_prosody_code", "vevo2.use_prosody_code");
    set_optional_option(request, object, "predict_target_prosody", "vevo2.predict_target_prosody");
    set_optional_option(request, object, "top_k", "vevo2.top_k");
    set_optional_option(request, object, "top_p", "vevo2.top_p");
    set_optional_option(request, object, "temperature", "vevo2.temperature");
    set_optional_option(request, object, "repetition_penalty", "vevo2.repetition_penalty");
    set_optional_option(request, object, "max_new_tokens", "vevo2.max_new_tokens");
    set_optional_option(request, object, "seed", "vevo2.seed");
    set_optional_option(request, object, "use_pitch_shift", "vevo2.use_pitch_shift");
    set_optional_option(request, object, "source_wav_shifted_steps", "vevo2.source_wav_shifted_steps");
    set_optional_option(request, object, "prosody_wav_shifted_steps", "vevo2.prosody_wav_shifted_steps");
    set_optional_option(request, object, "style_ref_wav_shifted_steps", "vevo2.style_ref_wav_shifted_steps");
    set_optional_option(request, object, "target_duration_seconds", "vevo2.target_duration_seconds");
    set_optional_option(
        request,
        object,
        "used_duration_of_timbre_ref_seconds",
        "vevo2.used_duration_of_timbre_ref_seconds");
    set_optional_option(request, object, "flow_matching_steps", "vevo2.flow_matching_steps");
    if (!noise_file.empty()) {
        request.options["vevo2.fm_noise_file"] = noise_file;
    }
    return request;
}

std::vector<engine::runtime::TaskRequest> parse_requests(
    const std::string & request_sequence_json,
    const std::string & noise_file) {
    const auto root = engine::io::json::parse(request_sequence_json);
    std::vector<engine::runtime::TaskRequest> out;
    for (const auto & item : root.as_array()) {
        out.push_back(make_request(item, noise_file));
    }
    return out;
}

engine::io::json::Value number(double value) {
    return engine::io::json::Value::make_number(value);
}

engine::io::json::Value string(std::string value) {
    return engine::io::json::Value::make_string(std::move(value));
}

engine::io::json::Value audio_summary_json(const engine::runtime::AudioBuffer & audio) {
    if (audio.samples.empty()) {
        throw std::runtime_error("Vevo2 warmbench received empty audio output");
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
    const int64_t channels = std::max<int64_t>(1, audio.channels);
    const double count = static_cast<double>(audio.samples.size());
    return engine::io::json::Value::make_object({
        {"sample_rate", number(static_cast<double>(audio.sample_rate))},
        {"channels", number(static_cast<double>(audio.channels))},
        {"samples", number(static_cast<double>(audio.samples.size()))},
        {"frames", number(static_cast<double>(audio.samples.size() / static_cast<size_t>(channels)))},
        {"sum", number(sum)},
        {"mean_abs", number(abs_sum / count)},
        {"rms", number(std::sqrt(sq_sum / count))},
        {"min", number(min_value)},
        {"max", number(max_value)},
    });
}

engine::io::json::Value step_json(
    const engine::runtime::TaskResult & result,
    int request_index,
    double wall_ms,
    const std::filesystem::path & audio_path) {
    if (!result.audio_output.has_value()) {
        throw std::runtime_error("Vevo2 warmbench expected audio_output");
    }
    engine::io::json::Value::Object stem{
        {"name", string("audio")},
        {"summary", audio_summary_json(*result.audio_output)},
    };
    if (!audio_path.empty()) {
        stem.emplace("audio", string(audio_path.string()));
    }
    return engine::io::json::Value::make_object({
        {"request_index", number(static_cast<double>(request_index))},
        {"stems", engine::io::json::Value::make_array({engine::io::json::Value::make_object(std::move(stem))})},
        {"metrics", engine::io::json::Value::make_object({{"wall_ms", number(wall_ms)}})},
    });
}

}  // namespace

int main(int argc, char ** argv) {
    try {
        const std::filesystem::path model_path = arg_value(argc, argv, "--model", "models/Vevo2");
        const std::string backend_name = arg_value(argc, argv, "--backend", "cuda");
        const int device = int_arg(argc, argv, "--device", 0);
        const int threads = int_arg(argc, argv, "--threads", 8);
        const int warmup = int_arg(argc, argv, "--warmup", 0);
        const int iterations = int_arg(argc, argv, "--iterations", 1);
        const std::string request_sequence_json = arg_value(argc, argv, "--request-sequence-json", "");
        const std::string noise_file = arg_value(argc, argv, "--noise-file", "");
        const std::filesystem::path output_dir = arg_value(argc, argv, "--output-dir", "");
        const std::filesystem::path timing_path =
            arg_value(argc, argv, "--timing-file", "/tmp/vevo2_warm_bench_timing.log");
        if (request_sequence_json.empty()) {
            throw std::runtime_error("Vevo2 warmbench requires --request-sequence-json");
        }

        set_env_required("ENGINE_TIMING_ENABLED", "1");
        set_env_required("ENGINE_TIMING_FILE", timing_path.string());

        const auto session_option_overrides = parse_session_options(argc, argv);
        engine::runtime::ModelLoadRequest load_request;
        load_request.model_path = model_path;
        load_request.family_hint = "vevo2";
        for (const auto & [key, value] : session_option_overrides) {
            load_request.options.insert_or_assign(key, value);
        }
        auto registry = engine::runtime::make_default_registry();
        auto model = registry.load(load_request);

        engine::runtime::SessionOptions options;
        options.backend.type = parse_backend(backend_name);
        options.backend.device = device;
        options.backend.threads = threads;
        for (const auto & [key, value] : session_option_overrides) {
            options.options.insert_or_assign(key, value);
        }
        engine::runtime::TaskSpec task{engine::runtime::VoiceTaskKind::Svc, engine::runtime::RunMode::Offline};
        auto session_base = model->create_task_session(task, options);
        auto * session = dynamic_cast<engine::runtime::IOfflineVoiceTaskSession *>(session_base.get());
        if (session == nullptr) {
            throw std::runtime_error("loaded Vevo2 session is not an offline SVC session");
        }
        session->prepare({});

        const auto requests = parse_requests(request_sequence_json, noise_file);
        if (requests.empty()) {
            throw std::runtime_error("Vevo2 warmbench request sequence is empty");
        }
        for (int i = 0; i < warmup; ++i) {
            (void) session->run(requests.front());
        }

        if (!output_dir.empty()) {
            std::filesystem::create_directories(output_dir);
        }

        engine::io::json::Value::Array steps;
        steps.reserve(requests.size());
        for (size_t request_index = 0; request_index < requests.size(); ++request_index) {
            engine::runtime::TaskResult last_result;
            double total_ms = 0.0;
            for (int iteration = 0; iteration < std::max(1, iterations); ++iteration) {
                const auto started = std::chrono::steady_clock::now();
                last_result = session->run(requests[request_index]);
                const auto ended = std::chrono::steady_clock::now();
                total_ms += std::chrono::duration<double, std::milli>(ended - started).count();
            }
            const double wall_ms = total_ms / static_cast<double>(std::max(1, iterations));
            std::filesystem::path audio_path;
            if (!output_dir.empty()) {
                audio_path = output_dir / ("audio_" + std::to_string(request_index) + ".wav");
                const auto & audio = *last_result.audio_output;
                engine::audio::write_pcm16_wav(audio_path, audio.sample_rate, audio.channels, audio.samples);
            }
            std::cout << "vevo2.wall_ms=" << wall_ms << "\n";
            steps.push_back(step_json(last_result, static_cast<int>(request_index), wall_ms, audio_path));
        }

        const auto summary = engine::io::json::Value::make_object({
            {"family", string("vevo2")},
            {"backend", string(backend_name)},
            {"sequence_steps", engine::io::json::Value::make_array(std::move(steps))},
        });
        std::cout << "summary_json=" << engine::io::json::stringify(summary) << "\n";
        return 0;
    } catch (const std::exception & ex) {
        std::cerr << "vevo2_warm_bench failed: " << ex.what() << "\n";
        return 1;
    }
}
