# HERESY 1834 (Viktor 28.10.2026: «вживляй MuScriptor в Студию — в паспорт треков и в самого Огранщика»): ruach-muscriptor, a take, a stem or any
# sound into multi-instrument MIDI with MuScriptor (Mirelo and Kyutai; its weights CC BY-NC 4.0) through muscriptor.cpp (DamRsn, MIT, on ggml) at its
# pinned commit, with the ggml it pins itself (the engine's own ggml is not touched). build.sh builds it into build/build-muscriptor beside the
# engine, for the machine it runs on; not part of the server's build, so it never restarts the studio.
cmake_minimum_required(VERSION 3.24)
project(ruach_muscriptor LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
include(FetchContent)
set(MUSCRIPTOR_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(MUSCRIPTOR_BUILD_BENCH OFF CACHE BOOL "" FORCE)
set(MUSCRIPTOR_VULKAN OFF CACHE BOOL "" FORCE)
set(MUSCRIPTOR_NATIVE ON CACHE BOOL "" FORCE)
FetchContent_Declare(muscriptor
    GIT_REPOSITORY https://github.com/DamRsn/muscriptor.cpp.git
    GIT_TAG c8adc019677ed3479fa3c22c1a117d662382f347
    SOURCE_SUBDIR cpp)
FetchContent_MakeAvailable(muscriptor)
add_executable(ruach-muscriptor ruach_muscriptor.cpp)
target_link_libraries(ruach-muscriptor PRIVATE muscriptor_ggml)
