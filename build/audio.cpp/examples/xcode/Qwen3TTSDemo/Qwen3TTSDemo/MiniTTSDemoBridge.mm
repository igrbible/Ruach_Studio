#import "MiniTTSDemoBridge.h"

#include "engine/framework/audio/wav_reader.h"
#include "engine/framework/audio/wav_writer.h"
#include "engine/framework/core/backend.h"
#include "engine/framework/debug/trace.h"
#include "engine/framework/runtime/registry.h"
#include "engine/framework/runtime/session.h"

#include <filesystem>
#include <memory>
#include <stdexcept>
#include <string>

namespace {

NSString * const MiniTTSDemoErrorDomain = @"MiniTTSDemoErrorDomain";

std::string to_cpp(NSString * value) {
    return value == nil ? std::string() : std::string(value.UTF8String);
}

NSError * make_error(const std::exception & ex) {
    return [NSError errorWithDomain:MiniTTSDemoErrorDomain
                               code:1
                           userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithUTF8String:ex.what()]}];
}

engine::core::BackendType parse_backend(NSString * value) {
    const auto backend = to_cpp(value);
    if (backend == "cpu") {
        return engine::core::BackendType::Cpu;
    }
    if (backend == "metal") {
        return engine::core::BackendType::Metal;
    }
    if (backend == "best") {
        return engine::core::BackendType::BestAvailable;
    }
    throw std::runtime_error("unsupported backend: " + backend);
}

engine::runtime::AudioBuffer read_audio_buffer(NSString * path) {
    const auto wav = engine::audio::read_wav_f32(std::filesystem::path(to_cpp(path)));
    return engine::runtime::AudioBuffer{
        wav.sample_rate,
        wav.channels,
        wav.samples,
    };
}

void write_audio_buffer(const engine::runtime::AudioBuffer & audio, NSString * path) {
    if (audio.samples.empty()) {
        throw std::runtime_error("model did not produce audio");
    }
    const std::filesystem::path output(to_cpp(path));
    if (!output.parent_path().empty()) {
        std::filesystem::create_directories(output.parent_path());
    }
    engine::audio::write_pcm16_wav(output, audio.sample_rate, audio.channels, audio.samples);
}

void set_common_generation_options(
    engine::runtime::TaskRequest & request,
    uint32_t seed,
    int64_t max_new_tokens) {
    request.options["seed"] = std::to_string(seed);
    request.options["do_sample"] = "false";
    request.options["max_new_tokens"] = std::to_string(max_new_tokens);
}

}  // namespace

@interface MiniTTSDemoBridge () {
    std::unique_ptr<engine::runtime::ILoadedVoiceModel> _model;
    std::unique_ptr<engine::runtime::IVoiceTaskSession> _session;
    engine::runtime::IOfflineVoiceTaskSession * _offline;
}
@end

@implementation MiniTTSDemoBridge

- (nullable instancetype)initWithModelPath:(NSString *)modelPath
                                      task:(NSString *)task
                                   backend:(NSString *)backend
                                    device:(int)device
                                   threads:(int)threads
                                     error:(NSError **)error {
    self = [super init];
    if (self == nil) {
        return nil;
    }

    try {
        engine::runtime::ModelLoadRequest loadRequest;
        loadRequest.model_path = std::filesystem::path(to_cpp(modelPath));
        loadRequest.family_hint = "qwen3_tts";

        engine::runtime::TaskSpec taskSpec;
        taskSpec.mode = engine::runtime::RunMode::Offline;
        taskSpec.task = engine::runtime::parse_voice_task_kind(to_cpp(task));

        engine::runtime::SessionOptions sessionOptions;
        sessionOptions.backend.type = parse_backend(backend);
        sessionOptions.backend.device = device;
        sessionOptions.backend.threads = threads;

        auto registry = engine::runtime::make_default_registry();
        _model = registry.load(loadRequest);
        _session = _model->create_task_session(taskSpec, sessionOptions);
        _offline = dynamic_cast<engine::runtime::IOfflineVoiceTaskSession *>(_session.get());
        if (_offline == nullptr) {
            throw std::runtime_error("Qwen3 TTS session does not support offline execution");
        }
    } catch (const std::exception & ex) {
        if (error != nil) {
            *error = make_error(ex);
        }
        return nil;
    }

    return self;
}

- (BOOL)runVoiceCloneWithText:(NSString *)text
                     language:(NSString *)language
                  voiceRefPath:(NSString *)voiceRefPath
                 referenceText:(NSString *)referenceText
                    outputPath:(NSString *)outputPath
                          seed:(uint32_t)seed
                  maxNewTokens:(int64_t)maxNewTokens
                         error:(NSError **)error {
    try {
        engine::runtime::TaskRequest request;
        request.text_input = engine::runtime::Transcript{to_cpp(text), to_cpp(language)};

        engine::runtime::VoiceReference reference;
        reference.audio = read_audio_buffer(voiceRefPath);
        engine::runtime::VoiceCondition voice;
        voice.speaker = std::move(reference);
        request.voice = std::move(voice);

        request.options["reference_text"] = to_cpp(referenceText);
        set_common_generation_options(request, seed, maxNewTokens);

        _session->prepare(engine::runtime::build_preparation_request(request));
        const auto result = _offline->run(request);
        if (!result.audio_output.has_value()) {
            throw std::runtime_error("Qwen3 voice clone did not return audio");
        }
        write_audio_buffer(*result.audio_output, outputPath);
        return YES;
    } catch (const std::exception & ex) {
        if (error != nil) {
            *error = make_error(ex);
        }
        return NO;
    }
}

- (BOOL)runVoiceDesignWithText:(NSString *)text
                      language:(NSString *)language
                      instruct:(NSString *)instruct
                    outputPath:(NSString *)outputPath
                          seed:(uint32_t)seed
                  maxNewTokens:(int64_t)maxNewTokens
                         error:(NSError **)error {
    try {
        engine::runtime::TaskRequest request;
        request.text_input = engine::runtime::Transcript{to_cpp(text), to_cpp(language)};
        request.options["instruct"] = to_cpp(instruct);
        set_common_generation_options(request, seed, maxNewTokens);

        _session->prepare(engine::runtime::build_preparation_request(request));
        const auto result = _offline->run(request);
        if (!result.audio_output.has_value()) {
            throw std::runtime_error("Qwen3 voice design did not return audio");
        }
        write_audio_buffer(*result.audio_output, outputPath);
        return YES;
    } catch (const std::exception & ex) {
        if (error != nil) {
            *error = make_error(ex);
        }
        return NO;
    }
}

@end
