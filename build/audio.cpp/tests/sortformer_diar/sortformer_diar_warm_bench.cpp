#include "engine/framework/audio/wav_reader.h"
#include "engine/framework/debug/trace.h"
#include "engine/framework/runtime/model.h"
#include "engine/framework/runtime/registry.h"
#include "engine/framework/runtime/session.h"

#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <sstream>
#include <unordered_map>
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

double double_arg(int argc, char ** argv, const std::string & name, double fallback) {
    return std::stod(arg_value(argc, argv, name, std::to_string(fallback)));
}

std::vector<std::pair<std::string, std::string>> parse_session_options(int argc, char ** argv) {
    std::vector<std::pair<std::string, std::string>> out;
    for (int i = 1; i + 1 < argc; ++i) {
        if (std::string(argv[i]) != "--session-option") {
            continue;
        }
        const std::string option = argv[++i];
        const auto sep = option.find('=');
        if (sep == std::string::npos) {
            throw std::runtime_error("invalid Sortformer diar --session-option: " + option);
        }
        out.emplace_back(option.substr(0, sep), option.substr(sep + 1));
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
    throw std::runtime_error("unsupported backend: " + value);
}

bool starts_with(const std::string & value, const std::string & prefix) {
    return value.size() >= prefix.size() && value.compare(0, prefix.size(), prefix) == 0;
}

std::unordered_map<std::string, double> parse_timing_file(const std::filesystem::path & path) {
    std::ifstream input(path);
    if (!input.is_open()) {
        throw std::runtime_error("failed to open timing log: " + path.string());
    }

    std::unordered_map<std::string, double> metrics;
    std::string line;
    while (std::getline(input, line)) {
        if (!starts_with(line, "[TIMING")) {
            continue;
        }
        const auto prefix_end = line.find("] ");
        if (prefix_end == std::string::npos) {
            continue;
        }
        const auto first_space = line.find(' ', prefix_end + 2);
        if (first_space == std::string::npos) {
            continue;
        }
        const std::string key = line.substr(prefix_end + 2, first_space - (prefix_end + 2));
        const std::string value = line.substr(first_space + 1);
        if (key == "audio.stft_impl") {
            continue;
        }
        try {
            metrics[key] = std::stod(value);
        } catch (...) {
        }
    }
    return metrics;
}

void clear_file(const std::filesystem::path & path) {
    std::ofstream output(path, std::ios::trunc);
    if (!output.is_open()) {
        throw std::runtime_error("failed to clear timing log: " + path.string());
    }
}

std::vector<std::string> split_csv(const std::string & value) {
    std::vector<std::string> out;
    std::stringstream stream(value);
    std::string item;
    while (std::getline(stream, item, ',')) {
        if (!item.empty()) {
            out.push_back(item);
        }
    }
    return out;
}

const std::vector<std::string> & ordered_keys() {
    static const std::vector<std::string> keys = {
        "audio.stft_ms",
        "sortformer.frontend_ms",
        "sortformer.log_mel_ms",
        "sortformer.feature_normalizer_ms",
        "sortformer.graph_ensure_ms",
        "sortformer.graph_prepare_ms",
        "sortformer.encoder_compute_ms",
        "sortformer.encoder_readback_ms",
        "sortformer.encoder_ms",
        "sortformer.postprocess_ms",
        "sortformer.transcribe_wall_ms",
    };
    return keys;
}

std::string json_escape(const std::string & value) {
    std::string out;
    out.reserve(value.size() + 8);
    for (const char ch : value) {
        switch (ch) {
        case '\\':
            out += "\\\\";
            break;
        case '"':
            out += "\\\"";
            break;
        case '\n':
            out += "\\n";
            break;
        case '\r':
            out += "\\r";
            break;
        case '\t':
            out += "\\t";
            break;
        default:
            out += ch;
            break;
        }
    }
    return out;
}

void print_speaker_turns_plain(const std::vector<engine::runtime::SpeakerTurn> & items) {
    std::cout << "speaker_turns=[";
    for (size_t i = 0; i < items.size(); ++i) {
        if (i != 0) {
            std::cout << ",";
        }
        const auto & item = items[i];
        std::cout << "{"
                  << "\"start_sample\":" << item.span.start_sample << ","
                  << "\"end_sample\":" << item.span.end_sample << ","
                  << "\"speaker_id\":\"" << json_escape(item.speaker_id) << "\","
                  << "\"confidence\":" << std::fixed << std::setprecision(6) << item.confidence
                  << "}";
    }
    std::cout << "]\n";
}

void print_speaker_turns_json(const std::vector<engine::runtime::SpeakerTurn> & items) {
    std::cout << "\"speaker_turns\":[";
    for (size_t i = 0; i < items.size(); ++i) {
        if (i != 0) {
            std::cout << ",";
        }
        const auto & item = items[i];
        std::cout << "{"
                  << "\"start_sample\":" << item.span.start_sample << ","
                  << "\"end_sample\":" << item.span.end_sample << ","
                  << "\"speaker_id\":\"" << json_escape(item.speaker_id) << "\","
                  << "\"confidence\":" << std::fixed << std::setprecision(6) << item.confidence
                  << "}";
    }
    std::cout << "]";
}

void print_diagnostics_json() {
    std::cout << "\"diagnostics\":{}";
}

}  // namespace

int main(int argc, char ** argv) {
    try {
        const std::filesystem::path model_path = arg_value(argc, argv, "--model", "models/diar_sortformer_4spk-v1");
        const std::string audio_sequence_value = arg_value(argc, argv, "--audio-sequence", "");
        const std::filesystem::path audio_path =
            arg_value(argc, argv, "--audio", "build/assets/parakeet/sample_10s_16k.wav");
        const std::filesystem::path warmup_audio_path =
            arg_value(argc, argv, "--warmup-audio", audio_path.string());
        const std::string backend_name = arg_value(argc, argv, "--backend", "cpu");
        const int device = int_arg(argc, argv, "--device", 0);
        const int threads = int_arg(argc, argv, "--threads", 8);
        const int warmup = int_arg(argc, argv, "--warmup", 2);
        const int iterations = int_arg(argc, argv, "--iterations", 5);
        const double session_len_sec = double_arg(argc, argv, "--session-len-sec", 20.0);
        const std::string default_graph_capacity_mode = backend_name == "cpu" ? "tiered" : "fixed";
        const std::string graph_capacity_mode =
            arg_value(argc, argv, "--graph-capacity-mode", default_graph_capacity_mode);
        const float speaker_threshold = static_cast<float>(double_arg(argc, argv, "--speaker-threshold", 0.5));
        const int speaker_min_frames = int_arg(argc, argv, "--speaker-min-frames", 0);
        const int speaker_pad_frames = int_arg(argc, argv, "--speaker-pad-frames", 0);
        const std::filesystem::path timing_path =
            arg_value(argc, argv, "--timing-file", "/tmp/sortformer_diar_warm_bench_timing.log");

        setenv("ENGINE_TRACE_ENABLED", "0", 1);
        setenv("ENGINE_TIMING_ENABLED", "1", 1);
        setenv("ENGINE_TIMING_FILE", timing_path.c_str(), 1);

        auto registry = engine::runtime::make_default_registry();
        auto model = registry.load(model_path);

        engine::runtime::SessionOptions session_options;
        session_options.backend.type = parse_backend(backend_name);
        session_options.backend.device = device;
        session_options.backend.threads = threads;
        session_options.options["session_len_sec"] = std::to_string(session_len_sec);
        session_options.options["offline_graph_capacity_mode"] = graph_capacity_mode;
        session_options.options["speaker_threshold"] = std::to_string(speaker_threshold);
        session_options.options["speaker_min_frames"] = std::to_string(speaker_min_frames);
        session_options.options["speaker_pad_frames"] = std::to_string(speaker_pad_frames);
        for (const auto & [key, value] : parse_session_options(argc, argv)) {
            session_options.options[key] = value;
        }

        const engine::runtime::TaskSpec task{
            engine::runtime::VoiceTaskKind::Diarization,
            engine::runtime::RunMode::Offline,
        };
        auto session_base = model->create_task_session(task, session_options);
        auto * session = dynamic_cast<engine::runtime::IOfflineVoiceTaskSession *>(session_base.get());
        if (session == nullptr) {
            throw std::runtime_error("loaded model did not produce an offline diarization session");
        }

        const std::string family_name = session->family();
        std::vector<std::filesystem::path> audio_paths;
        if (!audio_sequence_value.empty()) {
            for (const auto & item : split_csv(audio_sequence_value)) {
                audio_paths.emplace_back(item);
            }
        }
        if (audio_paths.empty()) {
            audio_paths.push_back(audio_path);
        }
        std::vector<engine::audio::WavData> wavs;
        wavs.reserve(audio_paths.size());
        for (const auto & path : audio_paths) {
            const auto wav = engine::audio::read_wav_f32(path);
            if (wav.channels != 1) {
                throw std::runtime_error("sortformer_diar_warm_bench requires mono WAV input");
            }
            wavs.push_back(wav);
        }
        const auto warmup_wav = engine::audio::read_wav_f32(warmup_audio_path);
        if (warmup_wav.channels != 1) {
            throw std::runtime_error("sortformer_diar_warm_bench requires mono WAV warmup input");
        }
        engine::runtime::TaskRequest warmup_request;
        warmup_request.audio_input = engine::runtime::AudioBuffer{
            warmup_wav.sample_rate,
            warmup_wav.channels,
            warmup_wav.samples,
        };
        std::vector<engine::runtime::TaskRequest> requests;
        requests.reserve(wavs.size());
        for (const auto & wav : wavs) {
            engine::runtime::TaskRequest request;
            request.audio_input = engine::runtime::AudioBuffer{
                wav.sample_rate,
                wav.channels,
                wav.samples,
            };
            requests.push_back(std::move(request));
        }
        session_base->prepare(engine::runtime::build_preparation_request(warmup_request));

        std::map<std::string, double> sums;
        std::vector<std::unordered_map<std::string, double>> per_run;
        per_run.reserve(static_cast<size_t>(std::max(1, iterations)));
        struct SequenceStepSummary {
            std::string audio_path;
            engine::runtime::TaskResult result;
            std::unordered_map<std::string, double> metrics;
        };
        engine::runtime::TaskResult last_result;
        std::vector<SequenceStepSummary> last_sequence_steps;

        for (int i = 0; i < std::max(0, warmup); ++i) {
            clear_file(timing_path);
            (void)session->run(warmup_request);
        }

        for (int i = 0; i < std::max(1, iterations); ++i) {
            std::unordered_map<std::string, double> metrics;
            last_sequence_steps.clear();
            for (size_t step_idx = 0; step_idx < requests.size(); ++step_idx) {
                clear_file(timing_path);
                const auto started = std::chrono::steady_clock::now();
                auto result = session->run(requests[step_idx]);
                const auto ended = std::chrono::steady_clock::now();
                auto step_metrics = parse_timing_file(timing_path);
                step_metrics["sortformer.transcribe_wall_ms"] =
                    std::chrono::duration<double, std::milli>(ended - started).count();
                for (const auto & [key, value] : step_metrics) {
                    metrics[key] += value;
                }
                last_result = result;
                last_sequence_steps.push_back(SequenceStepSummary{
                    audio_paths[step_idx].string(),
                    std::move(result),
                    std::move(step_metrics),
                });
            }
            per_run.push_back(metrics);
            for (const auto & [key, value] : metrics) {
                sums[key] += value;
            }
        }

        std::cout << "family=" << family_name << "\n";
        std::cout << "backend=" << backend_name << "\n";
        std::cout << "threads=" << threads << "\n";
        std::cout << "warmup=" << warmup << "\n";
        std::cout << "iterations=" << iterations << "\n";
        std::cout << "session_len_sec=" << std::fixed << std::setprecision(6) << session_len_sec << "\n";
        std::cout << "speaker_threshold=" << std::fixed << std::setprecision(6) << speaker_threshold << "\n";
        std::cout << "speaker_min_frames=" << speaker_min_frames << "\n";
        std::cout << "speaker_pad_frames=" << speaker_pad_frames << "\n";
        print_speaker_turns_plain(last_result.speaker_turns);
        if (last_sequence_steps.size() > 1) {
            std::cout << "sequence_steps=" << last_sequence_steps.size() << "\n";
            for (size_t i = 0; i < last_sequence_steps.size(); ++i) {
                const auto & step = last_sequence_steps[i];
                std::cout << "sequence_step[" << i << "].audio=" << step.audio_path << "\n";
            }
        }

        for (size_t run_idx = 0; run_idx < per_run.size(); ++run_idx) {
            std::cout << "run=" << (run_idx + 1) << "\n";
            for (const auto & key : ordered_keys()) {
                const auto it = per_run[run_idx].find(key);
                if (it != per_run[run_idx].end()) {
                    std::cout << key << "=" << std::fixed << std::setprecision(6) << it->second << "\n";
                }
            }
        }

        std::cout << "average\n";
        for (const auto & key : ordered_keys()) {
            const auto it = sums.find(key);
            if (it != sums.end()) {
                std::cout << key << "="
                          << std::fixed
                          << std::setprecision(6)
                          << (it->second / static_cast<double>(std::max(1, iterations)))
                          << "\n";
            }
        }

        std::cout << "summary_json={";
        std::cout << "\"family\":\"" << json_escape(family_name) << "\",";
        std::cout << "\"backend\":\"" << json_escape(backend_name) << "\",";
        std::cout << "\"device\":" << device << ",";
        std::cout << "\"threads\":" << threads << ",";
        std::cout << "\"warmup\":" << warmup << ",";
        std::cout << "\"iterations\":" << iterations << ",";
        std::cout << "\"warmup_audio\":\"" << json_escape(warmup_audio_path.string()) << "\",";
        std::cout << "\"audio_sequence\":[";
        for (size_t i = 0; i < audio_paths.size(); ++i) {
            if (i != 0) {
                std::cout << ",";
            }
            std::cout << "\"" << json_escape(audio_paths[i].string()) << "\"";
        }
        std::cout << "],";
        std::cout << "\"speaker_threshold\":" << std::fixed << std::setprecision(6) << speaker_threshold << ",";
        std::cout << "\"speaker_min_frames\":" << speaker_min_frames << ",";
        std::cout << "\"speaker_pad_frames\":" << speaker_pad_frames << ",";
        print_speaker_turns_json(last_result.speaker_turns);
        std::cout << ",";
        print_diagnostics_json();
        std::cout << ",";
        std::cout << "\"sequence_steps\":[";
        for (size_t i = 0; i < last_sequence_steps.size(); ++i) {
            if (i != 0) {
                std::cout << ",";
            }
            const auto & step = last_sequence_steps[i];
            std::cout << "{";
            std::cout << "\"audio\":\"" << json_escape(step.audio_path) << "\",";
            print_speaker_turns_json(step.result.speaker_turns);
            std::cout << ",";
            print_diagnostics_json();
            std::cout << ",\"metrics\":{";
            bool first_metric = true;
            for (const auto & key : ordered_keys()) {
                const auto it = step.metrics.find(key);
                if (it == step.metrics.end()) {
                    continue;
                }
                if (!first_metric) {
                    std::cout << ",";
                }
                first_metric = false;
                std::cout << "\"" << json_escape(key) << "\":" << std::fixed << std::setprecision(6) << it->second;
            }
            std::cout << "}}";
        }
        std::cout << "],";
        std::cout << "\"runs\":[";
        for (size_t run_idx = 0; run_idx < per_run.size(); ++run_idx) {
            if (run_idx != 0) {
                std::cout << ",";
            }
            std::cout << "{";
            bool first_metric = true;
            for (const auto & key : ordered_keys()) {
                const auto it = per_run[run_idx].find(key);
                if (it == per_run[run_idx].end()) {
                    continue;
                }
                if (!first_metric) {
                    std::cout << ",";
                }
                first_metric = false;
                std::cout << "\"" << json_escape(key) << "\":" << std::fixed << std::setprecision(6) << it->second;
            }
            std::cout << "}";
        }
        std::cout << "],";
        std::cout << "\"average\":{";
        bool first_average = true;
        for (const auto & key : ordered_keys()) {
            const auto it = sums.find(key);
            if (it == sums.end()) {
                continue;
            }
            if (!first_average) {
                std::cout << ",";
            }
            first_average = false;
            std::cout << "\""
                      << json_escape(key)
                      << "\":"
                      << std::fixed
                      << std::setprecision(6)
                      << (it->second / static_cast<double>(std::max(1, iterations)));
        }
        std::cout << "}}\n";
        return 0;
    } catch (const std::exception & e) {
        std::cerr << "sortformer_diar_warm_bench failed: " << e.what() << "\n";
        return 1;
    }
}
