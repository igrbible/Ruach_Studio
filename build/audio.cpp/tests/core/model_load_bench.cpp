#include "engine/framework/runtime/registry.h"

#include <chrono>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

std::optional<std::string> arg_value(int argc, char ** argv, const std::string & name) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == name) {
            return std::string(argv[i + 1]);
        }
    }
    return std::nullopt;
}

int arg_int(int argc, char ** argv, const std::string & name, int fallback) {
    if (const auto value = arg_value(argc, argv, name)) {
        return std::stoi(*value);
    }
    return fallback;
}

std::filesystem::path required_path(int argc, char ** argv, const std::string & name) {
    if (const auto value = arg_value(argc, argv, name)) {
        return std::filesystem::path(*value);
    }
    throw std::runtime_error("missing required argument: " + name);
}

}  // namespace

int main(int argc, char ** argv) {
    try {
        const auto model_path = required_path(argc, argv, "--model");
        const int warmup = arg_int(argc, argv, "--warmup", 1);
        const int iterations = arg_int(argc, argv, "--iterations", 3);

        const auto registry = engine::runtime::make_default_registry();

        for (int i = 0; i < warmup; ++i) {
            auto model = registry.load(model_path);
            (void)model;
        }

        std::vector<double> ms_values;
        ms_values.reserve(static_cast<size_t>(iterations));
        for (int i = 0; i < iterations; ++i) {
            const auto start = std::chrono::steady_clock::now();
            auto model = registry.load(model_path);
            const auto end = std::chrono::steady_clock::now();
            (void)model;
            const double ms = std::chrono::duration<double, std::milli>(end - start).count();
            ms_values.push_back(ms);
            std::cout << "load_ms[" << i << "]=" << std::fixed << std::setprecision(6) << ms << "\n";
        }

        double sum = 0.0;
        for (const double value : ms_values) {
            sum += value;
        }
        const double avg = ms_values.empty() ? 0.0 : sum / static_cast<double>(ms_values.size());
        std::cout << "load_ms.avg=" << std::fixed << std::setprecision(6) << avg << "\n";
        return 0;
    } catch (const std::exception & e) {
        std::cerr << "model_load_bench failed: " << e.what() << "\n";
        return 1;
    }
}
