#pragma once

#include "execution.h"

#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace minitts::app {

struct AppPipelineRequest {
    std::string pipeline_id;
    std::unordered_map<std::string, std::string> inputs;
};

struct AppPipelinePlan {
    std::vector<AppBatchRequest> batches;
};

class IAppPipeline {
public:
    virtual ~IAppPipeline() = default;
    virtual std::string id() const = 0;
    virtual AppPipelinePlan plan(const AppPipelineRequest & request) const = 0;
};

class AppPipelineRegistry {
public:
    void add(std::unique_ptr<IAppPipeline> pipeline);
    const IAppPipeline & require(std::string_view id) const;
    std::vector<std::string> ids() const;

private:
    std::unordered_map<std::string, std::unique_ptr<IAppPipeline>> pipelines_;
};

AppPipelineRegistry make_default_pipeline_registry();

}  // namespace minitts::app
