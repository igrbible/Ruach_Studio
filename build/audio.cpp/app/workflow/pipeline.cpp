#include "pipeline.h"

#include <algorithm>
#include <stdexcept>

namespace minitts::app {

void AppPipelineRegistry::add(std::unique_ptr<IAppPipeline> pipeline) {
    if (pipeline == nullptr) {
        throw std::runtime_error("cannot register a null app pipeline");
    }
    const std::string id = pipeline->id();
    if (id.empty()) {
        throw std::runtime_error("app pipeline id must not be empty");
    }
    const auto [_, inserted] = pipelines_.emplace(id, std::move(pipeline));
    if (!inserted) {
        throw std::runtime_error("duplicate app pipeline id: " + id);
    }
}

const IAppPipeline & AppPipelineRegistry::require(std::string_view id) const {
    const auto it = pipelines_.find(std::string(id));
    if (it == pipelines_.end()) {
        throw std::runtime_error("unknown app pipeline: " + std::string(id));
    }
    return *it->second;
}

std::vector<std::string> AppPipelineRegistry::ids() const {
    std::vector<std::string> out;
    out.reserve(pipelines_.size());
    for (const auto & [id, _] : pipelines_) {
        out.push_back(id);
    }
    std::sort(out.begin(), out.end());
    return out;
}

AppPipelineRegistry make_default_pipeline_registry() {
    return AppPipelineRegistry{};
}

}  // namespace minitts::app
