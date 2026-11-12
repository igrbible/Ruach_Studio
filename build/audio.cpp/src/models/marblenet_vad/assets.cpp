#include "engine/models/marblenet_vad/assets.h"

#include "engine/framework/assets/resource_bundle.h"
#include "engine/framework/assets/tensor_source.h"
#include "engine/framework/assets/weight_metadata.h"
#include "engine/framework/io/json.h"

#include <cmath>
#include <mutex>
#include <stdexcept>
#include <string>
#include <unordered_map>

namespace engine::models::marblenet_vad {
namespace io = engine::io;
namespace asset_meta = engine::assets;
MarbleNetAssetPaths resolve_marblenet_assets(const std::filesystem::path & checkpoint_path) {
    assets::ResourceBundle resources(checkpoint_path.parent_path());
    resources.add_file("weights", checkpoint_path);
    resources.add_file("config", assets::checkpoint_sidecar_config_path(checkpoint_path));

    const auto config = resources.parse_json("config");
    const auto * labels_file = config.find("labels_file");
    if (labels_file == nullptr || !labels_file->is_string()) {
        throw std::runtime_error("MarbleNet config is missing labels_file");
    }
    resources.add_model_file("labels", labels_file->as_string());

    MarbleNetAssetPaths paths;
    paths.model_root = resources.model_root();
    paths.checkpoint_path = resources.require_file("weights");
    paths.config_path = resources.require_file("config");
    paths.labels_path = resources.require_file("labels");
    return paths;
}

namespace {

std::vector<JasperBlockConfig> parse_jasper_config(const io::json::Value & value) {
    std::vector<JasperBlockConfig> blocks;
    for (const auto & block_value : value.as_array()) {
        const auto & object = block_value.as_object();
        JasperBlockConfig cfg;
        if (const auto it = object.find("filters"); it != object.end()) {
            cfg.filters = it->second.as_i64();
        }
        if (const auto it = object.find("repeat"); it != object.end()) {
            cfg.repeat = it->second.as_i64();
        }
        if (const auto it = object.find("kernel"); it != object.end()) {
            cfg.kernel = it->second.as_i64();
        }
        if (const auto it = object.find("stride"); it != object.end()) {
            cfg.stride = it->second.as_i64();
        }
        if (const auto it = object.find("dilation"); it != object.end()) {
            cfg.dilation = it->second.as_i64();
        }
        if (const auto it = object.find("residual"); it != object.end()) {
            cfg.residual = it->second.as_bool();
        }
        if (const auto it = object.find("separable"); it != object.end()) {
            cfg.separable = it->second.as_bool();
        }
        blocks.push_back(std::move(cfg));
    }
    return blocks;
}

MarbleNetConfig load_marblenet_config(const io::json::Value & root) {
    MarbleNetConfig cfg;
    cfg.sample_rate = root.require("sample_rate").as_i64();
    cfg.n_mels = root.require("n_mels").as_i64();
    cfg.n_fft = root.require("n_fft").as_i64();
    cfg.hop_length = static_cast<int64_t>(std::llround(root.require("window_stride").as_number() * static_cast<double>(cfg.sample_rate)));
    cfg.win_length = static_cast<int64_t>(std::llround(root.require("window_size").as_number() * static_cast<double>(cfg.sample_rate)));
    cfg.pad_to = root.require("pad_to").as_i64();
    cfg.num_classes = root.require("num_classes").as_i64();
    cfg.normalize = root.require("normalize").as_string();
    cfg.window = root.require("window").as_string();
    cfg.jasper = parse_jasper_config(root.require("jasper"));
    if (cfg.normalize != "None" && cfg.normalize != "none" && cfg.normalize != "null") {
        throw std::runtime_error("unsupported MarbleNet normalize mode: " + cfg.normalize);
    }
    if (cfg.window != "hann") {
        throw std::runtime_error("unsupported MarbleNet window: " + cfg.window);
    }
    if (cfg.n_mels <= 0 || cfg.n_fft <= 0 || cfg.hop_length <= 0 || cfg.win_length <= 0 || cfg.num_classes <= 0) {
        throw std::runtime_error("invalid MarbleNet metadata values");
    }
    if (cfg.jasper.empty()) {
        throw std::runtime_error("empty MarbleNet jasper config");
    }
    for (const auto & block : cfg.jasper) {
        if (block.filters <= 0 || block.repeat <= 0 || block.kernel <= 0 || block.stride <= 0 || block.dilation <= 0) {
            throw std::runtime_error("invalid MarbleNet jasper block metadata");
        }
        cfg.output_stride *= block.stride;
    }
    return cfg;
}

MarbleNetWeights load_marblenet_weights(const std::filesystem::path & checkpoint_path) {
    const auto assets = resolve_marblenet_assets(checkpoint_path);
    engine::assets::ResourceBundle resources(assets.model_root);
    resources.add_file("weights", assets.checkpoint_path);
    const auto source = resources.open_tensor_source("weights");

    MarbleNetWeights weights;
    weights.source = source;
    weights.config = load_marblenet_config(io::json::parse_file(assets.config_path));
    weights.window = source->require_f32("preprocessor.featurizer.window", {weights.config.win_length});
    weights.fb = source->require_f32(
        "preprocessor.featurizer.fb",
        {1, weights.config.n_mels, weights.config.n_fft / 2 + 1});

    weights.blocks.resize(weights.config.jasper.size());
    int64_t in_channels = weights.config.n_mels;
    for (size_t block_index = 0; block_index < weights.config.jasper.size(); ++block_index) {
        const auto & block_cfg = weights.config.jasper[block_index];
        auto & block = weights.blocks[block_index];
        block.separable = block_cfg.separable;
        if (block_cfg.separable) {
            block.separable_repeats.reserve(static_cast<size_t>(block_cfg.repeat));
            int64_t repeat_in = in_channels;
            for (int64_t repeat = 0; repeat < block_cfg.repeat; ++repeat) {
                const int base = static_cast<int>(repeat * 5);
                SeparableConvBn layer;
                layer.depthwise = asset_meta::load_conv1d_metadata<Conv1dWeights>(
                    *source,
                    "encoder.encoder." + std::to_string(block_index) + ".mconv." + std::to_string(base) + ".conv",
                    block_cfg.stride,
                    block_cfg.dilation,
                    (block_cfg.dilation * (block_cfg.kernel - 1)) / 2,
                    repeat_in,
                    false);
                layer.pointwise = asset_meta::load_conv1d_metadata<Conv1dWeights>(
                    *source,
                    "encoder.encoder." + std::to_string(block_index) + ".mconv." + std::to_string(base + 1) + ".conv",
                    1,
                    1,
                    0,
                    1,
                    false);
                layer.bn = asset_meta::load_batch_norm1d_metadata<BatchNorm1dWeights>(
                    *source,
                    "encoder.encoder." + std::to_string(block_index) + ".mconv." + std::to_string(base + 2));
                block.separable_repeats.push_back(std::move(layer));
                repeat_in = block_cfg.filters;
            }
        } else {
            block.conv_repeats.reserve(static_cast<size_t>(block_cfg.repeat));
            for (int64_t repeat = 0; repeat < block_cfg.repeat; ++repeat) {
                const int base = static_cast<int>(repeat * 3);
                ConvBn layer;
                layer.conv = asset_meta::load_conv1d_metadata<Conv1dWeights>(
                    *source,
                    "encoder.encoder." + std::to_string(block_index) + ".mconv." + std::to_string(base) + ".conv",
                    block_cfg.stride,
                    block_cfg.dilation,
                    (block_cfg.dilation * (block_cfg.kernel - 1)) / 2,
                    1,
                    false);
                layer.bn = asset_meta::load_batch_norm1d_metadata<BatchNorm1dWeights>(
                    *source,
                    "encoder.encoder." + std::to_string(block_index) + ".mconv." + std::to_string(base + 1));
                block.conv_repeats.push_back(std::move(layer));
            }
        }
        block.has_residual = block_cfg.residual;
        if (block.has_residual) {
            block.residual_conv = asset_meta::load_conv1d_metadata<Conv1dWeights>(
                *source,
                "encoder.encoder." + std::to_string(block_index) + ".res.0.0.conv",
                1,
                1,
                0,
                1,
                false);
            block.residual_bn = asset_meta::load_batch_norm1d_metadata<BatchNorm1dWeights>(
                *source,
                "encoder.encoder." + std::to_string(block_index) + ".res.0.1");
        }
        in_channels = block_cfg.filters;
    }

    weights.decoder = asset_meta::load_linear_as_conv1d_metadata<Conv1dWeights>(*source, "decoder.layer0", true);
    return weights;
}

std::string checkpoint_cache_key(const std::filesystem::path & checkpoint_path) {
    std::error_code ec;
    const auto canonical = std::filesystem::weakly_canonical(checkpoint_path, ec);
    return ec ? checkpoint_path.lexically_normal().string() : canonical.string();
}

}  // namespace

std::shared_ptr<const MarbleNetWeights> load_marblenet_weights_cached(const std::filesystem::path & checkpoint_path) {
    static std::mutex cache_mutex;
    static std::unordered_map<std::string, std::weak_ptr<const MarbleNetWeights>> cache;
    const auto key = checkpoint_cache_key(checkpoint_path);
    {
        std::lock_guard<std::mutex> lock(cache_mutex);
        if (const auto it = cache.find(key); it != cache.end()) {
            if (auto existing = it->second.lock()) {
                return existing;
            }
        }
    }
    auto loaded = std::make_shared<const MarbleNetWeights>(load_marblenet_weights(checkpoint_path));
    {
        std::lock_guard<std::mutex> lock(cache_mutex);
        cache[key] = loaded;
    }
    return loaded;
}

}  // namespace engine::models::marblenet_vad
