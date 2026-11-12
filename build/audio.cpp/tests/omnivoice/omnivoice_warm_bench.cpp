#include "engine/framework/audio/wav_reader.h"
#include "engine/framework/audio/wav_writer.h"
#include "engine/framework/debug/trace.h"
#include "engine/framework/runtime/registry.h"
#include "engine/framework/runtime/session.h"

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

constexpr const char * kDefaultWarmupText =
    "This is a fixed warmup request for the OmniVoice session benchmark.";
enum class OmniVoiceTask {
    VoiceClone,
    VoiceDesign,
    AutoVoice,
};

OmniVoiceTask parse_task(const std::string & value) {
    if (value == "voice_clone") {
        return OmniVoiceTask::VoiceClone;
    }
    if (value == "voice_design") {
        return OmniVoiceTask::VoiceDesign;
    }
    if (value == "auto_voice") {
        return OmniVoiceTask::AutoVoice;
    }
    throw std::runtime_error("unsupported OmniVoice warm bench task: " + value);
}

std::string arg_value(int argc, char ** argv, const std::string & name, const std::string & fallback) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == name) {
            return argv[i + 1];
        }
    }
    return fallback;
}

std::vector<std::string> arg_values(int argc, char ** argv, const std::string & name) {
    std::vector<std::string> values;
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == name) {
            values.push_back(argv[i + 1]);
        }
    }
    return values;
}

std::string repeated_arg(int argc, char ** argv, const std::string & name, size_t index, const std::string & fallback) {
    size_t seen = 0;
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == name) {
            if (seen == index) {
                return argv[i + 1];
            }
            ++seen;
        }
    }
    return fallback;
}

std::unordered_map<std::string, std::string> parse_key_value_args(
    int argc,
    char ** argv,
    const std::string & name) {
    std::unordered_map<std::string, std::string> values;
    for (const std::string & entry : arg_values(argc, argv, name)) {
        const auto equals = entry.find('=');
        if (equals == std::string::npos || equals == 0 || equals + 1 >= entry.size()) {
            throw std::runtime_error("expected key=value for " + name + ", got: " + entry);
        }
        values[entry.substr(0, equals)] = entry.substr(equals + 1);
    }
    return values;
}

std::string trim_ascii(std::string value) {
    auto is_space = [](unsigned char ch) { return std::isspace(ch) != 0; };
    while (!value.empty() && is_space(static_cast<unsigned char>(value.front()))) {
        value.erase(value.begin());
    }
    while (!value.empty() && is_space(static_cast<unsigned char>(value.back()))) {
        value.pop_back();
    }
    return value;
}

int int_arg(int argc, char ** argv, const std::string & name, int fallback) {
    return std::stoi(arg_value(argc, argv, name, std::to_string(fallback)));
}

float float_arg(int argc, char ** argv, const std::string & name, float fallback) {
    return std::stof(arg_value(argc, argv, name, std::to_string(fallback)));
}

std::optional<float> optional_float_arg(int argc, char ** argv, const std::string & name) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == name) {
            return std::stof(argv[i + 1]);
        }
    }
    return std::nullopt;
}

bool bool_arg(int argc, char ** argv, const std::string & name, bool fallback) {
    const std::string value = arg_value(argc, argv, name, fallback ? "true" : "false");
    if (value == "1" || value == "true" || value == "yes" || value == "on") {
        return true;
    }
    if (value == "0" || value == "false" || value == "no" || value == "off") {
        return false;
    }
    throw std::runtime_error("invalid boolean for " + name + ": " + value);
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
    throw std::runtime_error("unsupported backend: " + value);
}

std::string timestamp_seconds_local() {
    const auto now = std::chrono::system_clock::now();
    const std::time_t now_time = std::chrono::system_clock::to_time_t(now);
    std::tm local_tm{};
#if defined(_WIN32)
    localtime_s(&local_tm, &now_time);
#else
    localtime_r(&now_time, &local_tm);
#endif
    std::ostringstream out;
    out << std::put_time(&local_tm, "%Y%m%d-%H%M%S");
    return out.str();
}

void set_env_required(const char * key, const std::string & value) {
#if defined(_WIN32)
    if (_putenv_s(key, value.c_str()) != 0) {
        throw std::runtime_error("failed to set environment variable: " + std::string(key));
    }
#else
    if (setenv(key, value.c_str(), 1) != 0) {
        throw std::runtime_error("failed to set environment variable: " + std::string(key));
    }
#endif
}

std::string timing_line_scalar(const std::string & timestamp, const std::string & key, const std::string & value) {
    return "[TIMING ts=" + timestamp + "] " + key + " " + value;
}

std::vector<std::string> read_timing_lines(const std::filesystem::path & path) {
    std::ifstream input(path);
    if (!input.is_open()) {
        throw std::runtime_error("failed to open timing log: " + path.string());
    }
    std::vector<std::string> lines;
    std::string line;
    while (std::getline(input, line)) {
        if (line.rfind("[TIMING", 0) == 0) {
            lines.push_back(line);
        }
    }
    return lines;
}

void clear_file(const std::filesystem::path & path) {
    std::ofstream output(path, std::ios::trunc);
    if (!output.is_open()) {
        throw std::runtime_error("failed to clear timing log: " + path.string());
    }
}

void write_sectioned_timing_log(
    const std::filesystem::path & path,
    const std::vector<std::pair<std::string, std::vector<std::string>>> & sections) {
    std::ofstream output(path, std::ios::trunc);
    if (!output.is_open()) {
        throw std::runtime_error("failed to write timing log: " + path.string());
    }
    for (size_t i = 0; i < sections.size(); ++i) {
        output << "[" << sections[i].first << "]\n";
        for (const std::string & line : sections[i].second) {
            output << line << "\n";
        }
        if (i + 1 < sections.size()) {
            output << "\n";
        }
    }
}

void append_request_evidence_lines(
    std::vector<std::string> & lines,
    const std::string & request_text,
    double wall_ms) {
    const std::string ts = timestamp_seconds_local();
    lines.push_back(timing_line_scalar(ts, "omnivoice.request_char_count", std::to_string(request_text.size())));
    std::ostringstream wall_stream;
    wall_stream << std::fixed << std::setprecision(6) << wall_ms;
    lines.push_back(timing_line_scalar(ts, "omnivoice.request_wall_ms", wall_stream.str()));
}

std::string summary_json(const engine::runtime::TaskResult & result, const std::string & request_text) {
    if (!result.audio_output.has_value()) {
        throw std::runtime_error("OmniVoice warm bench expected audio_output");
    }
    const auto & audio = *result.audio_output;

    double sum = 0.0;
    double sum_abs = 0.0;
    double sum_sq = 0.0;
    float min_value = 0.0F;
    float max_value = 0.0F;
    if (!audio.samples.empty()) {
        min_value = audio.samples.front();
        max_value = audio.samples.front();
    }
    for (float sample : audio.samples) {
        sum += sample;
        sum_abs += std::abs(sample);
        sum_sq += static_cast<double>(sample) * static_cast<double>(sample);
        min_value = std::min(min_value, sample);
        max_value = std::max(max_value, sample);
    }

    std::ostringstream out;
    out << "{";
    out << "\"sample_rate\":" << audio.sample_rate << ",";
    out << "\"channels\":" << audio.channels << ",";
    out << "\"samples\":" << audio.samples.size() << ",";
    out << "\"sum\":" << std::fixed << std::setprecision(9) << sum << ",";
    out << "\"mean_abs\":" << (audio.samples.empty() ? 0.0 : sum_abs / static_cast<double>(audio.samples.size())) << ",";
    out << "\"rms\":" << (audio.samples.empty() ? 0.0 : std::sqrt(sum_sq / static_cast<double>(audio.samples.size()))) << ",";
    out << "\"min\":" << min_value << ",";
    out << "\"max\":" << max_value << ",";
    out << "\"request_char_count\":" << request_text.size() << ",";
    out << "\"first_samples\":[";
    const size_t preview = std::min<size_t>(32, audio.samples.size());
    for (size_t i = 0; i < preview; ++i) {
        if (i != 0) {
            out << ",";
        }
        out << audio.samples[i];
    }
    out << "]";
    out << "}";
    return out.str();
}

engine::runtime::TaskRequest make_request(
    const std::string & text,
    const std::string & language,
    const std::optional<engine::runtime::AudioBuffer> & reference_audio,
    const std::string & reference_text,
    const std::string & instruct,
    const std::optional<float> & duration_seconds,
    int num_step,
    float guidance_scale,
    float speed,
    float t_shift,
    bool denoise,
    bool postprocess_output,
    float layer_penalty_factor,
    float position_temperature,
    float class_temperature,
    float audio_chunk_duration,
    float audio_chunk_threshold) {
    engine::runtime::TaskRequest request;
    request.text_input = engine::runtime::Transcript{text, language};
    if (reference_audio.has_value()) {
        request.voice = engine::runtime::VoiceCondition{};
        request.voice->speaker = engine::runtime::VoiceReference{};
        request.voice->speaker->audio = *reference_audio;
        request.options["reference_text"] = reference_text;
    }
    if (!instruct.empty()) {
        request.options["instruct"] = instruct;
    }
    request.options["num_step"] = std::to_string(num_step);
    request.options["guidance_scale"] = std::to_string(guidance_scale);
    request.options["speed"] = std::to_string(speed);
    if (duration_seconds.has_value()) {
        request.options["duration"] = std::to_string(*duration_seconds);
    }
    request.options["t_shift"] = std::to_string(t_shift);
    request.options["denoise"] = denoise ? "true" : "false";
    request.options["postprocess_output"] = postprocess_output ? "true" : "false";
    request.options["layer_penalty_factor"] = std::to_string(layer_penalty_factor);
    request.options["position_temperature"] = std::to_string(position_temperature);
    request.options["class_temperature"] = std::to_string(class_temperature);
    request.options["audio_chunk_duration"] = std::to_string(audio_chunk_duration);
    request.options["audio_chunk_threshold"] = std::to_string(audio_chunk_threshold);
    return request;
}

}  // namespace

int main(int argc, char ** argv) {
    try {
        const std::filesystem::path model_path = arg_value(argc, argv, "--model", "models/OmniVoice");
        const OmniVoiceTask bench_task = parse_task(arg_value(argc, argv, "--task", "voice_clone"));
        std::vector<std::string> texts = arg_values(argc, argv, "--text");
        if (texts.empty()) {
            texts.push_back("Hello from OmniVoice. This benchmark should produce stable speech for comparison.");
        }

        const std::string backend_name = arg_value(argc, argv, "--backend", "cpu");
        const int device = int_arg(argc, argv, "--device", 0);
        const int threads = int_arg(argc, argv, "--threads", 8);
        const int warmup = int_arg(argc, argv, "--warmup", 1);
        const int iterations = int_arg(argc, argv, "--iterations", 1);
        const std::string warmup_text = arg_value(argc, argv, "--warmup-text", kDefaultWarmupText);
        const std::string language = arg_value(argc, argv, "--language", "en");
        const std::string reference_text = arg_value(argc, argv, "--reference-text", "");
        const std::string instruct = arg_value(argc, argv, "--instruct", "");
        const std::string warmup_instruct = arg_value(argc, argv, "--warmup-instruct", instruct);
        const auto clone_audio_arg = arg_value(argc, argv, "--clone-audio", "");
        const std::optional<std::filesystem::path> clone_audio_path =
            clone_audio_arg.empty() ? std::nullopt : std::make_optional(std::filesystem::path(clone_audio_arg));
        if (bench_task == OmniVoiceTask::VoiceClone) {
            if (!clone_audio_path.has_value()) {
                throw std::runtime_error("OmniVoice warmbench voice_clone task requires --clone-audio");
            }
            if (reference_text.empty()) {
                throw std::runtime_error("OmniVoice warmbench voice_clone task requires --reference-text");
            }
        } else if (bench_task == OmniVoiceTask::VoiceDesign) {
            if (clone_audio_path.has_value()) {
                throw std::runtime_error("OmniVoice warmbench voice_design task must not receive --clone-audio");
            }
            if (trim_ascii(warmup_instruct).empty()) {
                throw std::runtime_error("OmniVoice warmbench voice_design task requires a non-empty instruct");
            }
        } else if (bench_task == OmniVoiceTask::AutoVoice) {
            if (clone_audio_path.has_value()) {
                throw std::runtime_error("OmniVoice warmbench auto_voice task must not receive --clone-audio");
            }
            if (!trim_ascii(instruct).empty() || !trim_ascii(warmup_instruct).empty()) {
                throw std::runtime_error("OmniVoice warmbench auto_voice task must not receive instruct values");
            }
            for (size_t request_index = 0; request_index < texts.size(); ++request_index) {
                const std::string request_instruct = repeated_arg(argc, argv, "--request-instruct", request_index, "");
                if (!trim_ascii(request_instruct).empty()) {
                    throw std::runtime_error("OmniVoice warmbench auto_voice task must not receive request instruct values");
                }
            }
        }
        const int num_step = int_arg(argc, argv, "--num-step", 32);
        const float guidance_scale = float_arg(argc, argv, "--guidance-scale", 2.0F);
        const float speed = float_arg(argc, argv, "--speed", 1.0F);
        const std::optional<float> duration_seconds = optional_float_arg(argc, argv, "--duration");
        const float t_shift = float_arg(argc, argv, "--t-shift", 0.1F);
        const bool denoise = bool_arg(argc, argv, "--denoise", true);
        const bool postprocess_output = bool_arg(argc, argv, "--postprocess-output", true);
        const float layer_penalty_factor = float_arg(argc, argv, "--layer-penalty-factor", 5.0F);
        const float position_temperature = float_arg(argc, argv, "--position-temperature", 5.0F);
        const float class_temperature = float_arg(argc, argv, "--class-temperature", 0.0F);
        const float audio_chunk_duration = float_arg(argc, argv, "--audio-chunk-duration", 15.0F);
        const float audio_chunk_threshold = float_arg(argc, argv, "--audio-chunk-threshold", 30.0F);
        const auto session_option_overrides = parse_key_value_args(argc, argv, "--session-option");
        const std::string artifact_stamp = arg_value(argc, argv, "--artifact-stamp", timestamp_seconds_local());
        const std::filesystem::path audio_out_path = arg_value(argc, argv, "--audio-out", "omnivoice_cpp_audio.wav");
        const std::string audio_out_dir_arg = arg_value(argc, argv, "--audio-out-dir", "");
        const std::filesystem::path audio_out_dir =
            audio_out_dir_arg.empty() ? std::filesystem::path{} : std::filesystem::path(audio_out_dir_arg);
        const std::string timing_file_arg = arg_value(argc, argv, "--timing-file", "");
        const std::filesystem::path timing_path = timing_file_arg.empty()
            ? (std::filesystem::path("build/logs/parity/omnivoice") /
               ("omnivoice_cpp_" + backend_name + "-" + artifact_stamp + ".log"))
            : std::filesystem::path(timing_file_arg);
        std::filesystem::create_directories(timing_path.parent_path());
        set_env_required("ENGINE_TRACE_ENABLED", "0");
        set_env_required("ENGINE_TIMING_ENABLED", "1");
        set_env_required("ENGINE_TIMING_FILE", timing_path.string());

        std::optional<engine::runtime::AudioBuffer> reference_audio = std::nullopt;
        if (clone_audio_path.has_value()) {
            const auto ref_wav = engine::audio::read_wav_f32(*clone_audio_path);
            reference_audio = engine::runtime::AudioBuffer{
                ref_wav.sample_rate,
                ref_wav.channels,
                ref_wav.samples,
            };
        }

        engine::runtime::ModelLoadRequest load_request;
        load_request.model_path = model_path;
        load_request.family_hint = "omnivoice";
        auto registry = engine::runtime::make_default_registry();
        auto model = registry.load(load_request);

        engine::runtime::SessionOptions session_options;
        session_options.backend.type = parse_backend(backend_name);
        session_options.backend.device = device;
        session_options.backend.threads = threads;
        for (const auto & [key, value] : session_option_overrides) {
            session_options.options[key] = value;
        }

        const engine::runtime::TaskSpec task{
            engine::runtime::VoiceTaskKind::Tts,
            engine::runtime::RunMode::Offline,
        };
        auto session_base = model->create_task_session(task, session_options);
        auto * session = dynamic_cast<engine::runtime::IOfflineVoiceTaskSession *>(session_base.get());
        if (session == nullptr) {
            throw std::runtime_error("loaded OmniVoice session is not an offline TTS session");
        }

        const auto warmup_request = make_request(
            warmup_text,
            language,
            reference_audio,
            reference_text,
            warmup_instruct,
            duration_seconds,
            num_step,
            guidance_scale,
            speed,
            t_shift,
            denoise,
            postprocess_output,
            layer_penalty_factor,
            position_temperature,
            class_temperature,
            audio_chunk_duration,
            audio_chunk_threshold);

        std::vector<engine::runtime::TaskRequest> requests;
        requests.reserve(texts.size());
        for (size_t request_index = 0; request_index < texts.size(); ++request_index) {
            const std::string request_instruct = repeated_arg(argc, argv, "--request-instruct", request_index, instruct);
            requests.push_back(make_request(
                texts[request_index],
                language,
                reference_audio,
                reference_text,
                request_instruct,
                duration_seconds,
                num_step,
                guidance_scale,
                speed,
                t_shift,
                denoise,
                postprocess_output,
                layer_penalty_factor,
                position_temperature,
                class_temperature,
                audio_chunk_duration,
                audio_chunk_threshold));
        }

        clear_file(timing_path);
        session_base->prepare(engine::runtime::build_preparation_request(warmup_request));
        std::vector<std::pair<std::string, std::vector<std::string>>> log_sections;
        log_sections.push_back({"prepare", read_timing_lines(timing_path)});

        std::vector<engine::runtime::TaskResult> warmup_results;
        warmup_results.reserve(static_cast<size_t>(std::max(0, warmup)));
        for (int i = 0; i < warmup; ++i) {
            clear_file(timing_path);
            const auto started = std::chrono::steady_clock::now();
            warmup_results.push_back(session->run(warmup_request));
            const auto ended = std::chrono::steady_clock::now();
            auto lines = read_timing_lines(timing_path);
            append_request_evidence_lines(
                lines,
                warmup_text,
                std::chrono::duration<double, std::milli>(ended - started).count());
            log_sections.push_back({"warmup" + std::to_string(i + 1), std::move(lines)});
        }

        std::vector<std::map<std::string, double>> wall_sums(requests.size());
        std::vector<engine::runtime::TaskResult> last_results(requests.size());
        std::vector<double> last_wall_ms(requests.size(), 0.0);
        for (size_t request_index = 0; request_index < requests.size(); ++request_index) {
            for (int i = 0; i < iterations; ++i) {
                clear_file(timing_path);
                const auto started = std::chrono::steady_clock::now();
                last_results[request_index] = session->run(requests[request_index]);
                const auto ended = std::chrono::steady_clock::now();
                last_wall_ms[request_index] = std::chrono::duration<double, std::milli>(ended - started).count();
                wall_sums[request_index]["omnivoice.request_wall_ms"] += last_wall_ms[request_index];
                auto lines = read_timing_lines(timing_path);
                append_request_evidence_lines(lines, texts[request_index], last_wall_ms[request_index]);
                log_sections.push_back({
                    "iteration" + std::to_string(i + 1) + ".request" + std::to_string(request_index + 1),
                    std::move(lines),
                });
            }
        }

        write_sectioned_timing_log(timing_path, log_sections);

        for (size_t warmup_index = 0; warmup_index < warmup_results.size(); ++warmup_index) {
            std::cout << "warmup_text[" << warmup_index << "]=" << warmup_text << "\n";
            std::cout << "warmup_summary_json[" << warmup_index << "]="
                      << summary_json(warmup_results[warmup_index], warmup_text) << "\n";
        }
        for (size_t request_index = 0; request_index < requests.size(); ++request_index) {
            std::cout << "text[" << request_index << "]=" << texts[request_index] << "\n";
            std::cout << "summary_json[" << request_index << "]="
                      << summary_json(last_results[request_index], texts[request_index]) << "\n";
            if (requests.size() == 1 && request_index == 0) {
                std::cout << "text=" << texts[request_index] << "\n";
                std::cout << "summary_json=" << summary_json(last_results[request_index], texts[request_index]) << "\n";
            }
        }
        std::cout << "timing_out=" << timing_path.string() << "\n";
        if (!audio_out_dir.empty()) {
            std::filesystem::create_directories(audio_out_dir);
            for (size_t request_index = 0; request_index < last_results.size(); ++request_index) {
                const auto & request_result = last_results[request_index];
                if (!request_result.audio_output.has_value()) {
                    throw std::runtime_error("OmniVoice warm bench expected audio_output for per-request WAV write");
                }
                const auto request_audio_out = audio_out_dir / ("request_" + std::to_string(request_index) + ".wav");
                engine::audio::write_pcm16_wav(
                    request_audio_out,
                    request_result.audio_output->sample_rate,
                    request_result.audio_output->channels,
                    request_result.audio_output->samples);
                std::cout << "audio_out[" << request_index << "]=" << request_audio_out.string() << "\n";
            }
        }
        const auto & last_result = last_results.back();
        if (!last_result.audio_output.has_value()) {
            throw std::runtime_error("OmniVoice warm bench expected audio_output for WAV write");
        }
        engine::audio::write_pcm16_wav(
            audio_out_path,
            last_result.audio_output->sample_rate,
            last_result.audio_output->channels,
            last_result.audio_output->samples);
        std::cout << "audio_out=" << audio_out_path.string() << "\n";
        for (size_t request_index = 0; request_index < requests.size(); ++request_index) {
            std::cout << "average[" << request_index << "]\n";
            for (const auto & [key, sum] : wall_sums[request_index]) {
                std::cout << key << "=" << (sum / static_cast<double>(std::max(1, iterations))) << "\n";
            }
        }
        return 0;
    } catch (const std::exception & e) {
        std::cerr << "omnivoice_warm_bench failed: " << e.what() << "\n";
        return 1;
    }
}
