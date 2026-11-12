#include "engine/framework/audio/dsp.h"
#include "engine/framework/audio/wav_reader.h"

#include <chrono>
#include <cmath>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

std::vector<float> make_hann_window(int64_t win_length) {
    std::vector<float> window(static_cast<size_t>(win_length), 0.0f);
    if (win_length == 1) {
        window[0] = 1.0f;
        return window;
    }
    constexpr long double kPi = 3.14159265358979323846264338327950288L;
    for (int64_t i = 0; i < win_length; ++i) {
        window[static_cast<size_t>(i)] =
            0.5f - 0.5f * std::cos(2.0L * kPi * static_cast<long double>(i) /
                                   static_cast<long double>(win_length - 1));
    }
    return window;
}

}  // namespace

int main(int argc, char ** argv) {
    if (argc != 7) {
        std::cerr << "Usage: stft_bench <wav> <kind:stft> <iters> <n_fft> <hop_length> <win_length>\n";
        return 1;
    }

    const std::filesystem::path wav_path(argv[1]);
    const std::string kind(argv[2]);
    const int iters = std::stoi(argv[3]);
    const int64_t n_fft = std::stoll(argv[4]);
    const int64_t hop_length = std::stoll(argv[5]);
    const int64_t win_length = std::stoll(argv[6]);

    auto wav = engine::audio::read_wav_f32(wav_path);
    if (wav.channels != 1) {
        throw std::runtime_error("stft_bench requires mono WAV");
    }
    if (iters <= 0) {
        throw std::runtime_error("iters must be > 0");
    }

    const engine::audio::STFTConfig config{
        n_fft,
        hop_length,
        win_length,
        true,
        engine::audio::STFTPadMode::Constant,
    };
    const auto window = make_hann_window(win_length);

    double total_ms = 0.0;
    size_t output_size = 0;
    for (int i = 0; i < iters; ++i) {
        const auto started = std::chrono::steady_clock::now();
        engine::audio::AudioTensor tensor;
        if (kind == "stft") {
            tensor = engine::audio::STFT().compute_complex(
                wav.samples, window, 1, static_cast<int64_t>(wav.samples.size()), config);
        } else {
            throw std::runtime_error("kind must be 'stft'");
        }
        const auto ended = std::chrono::steady_clock::now();
        total_ms += std::chrono::duration<double, std::milli>(ended - started).count();
        output_size = tensor.values.size();
    }

    std::cout << "kind=" << kind << "\n";
    std::cout << "iters=" << iters << "\n";
    std::cout << "n_fft=" << n_fft << "\n";
    std::cout << "hop_length=" << hop_length << "\n";
    std::cout << "win_length=" << win_length << "\n";
    std::cout << "output_size=" << output_size << "\n";
    std::cout << "total_ms=" << total_ms << "\n";
    std::cout << "avg_ms=" << (total_ms / static_cast<double>(iters)) << "\n";
    return 0;
}
