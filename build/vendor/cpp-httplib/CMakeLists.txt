# cpp-httplib: HTTP server library (no SSL, behind reverse proxy in prod)

add_library(httplib STATIC httplib.cpp)
target_include_directories(httplib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# suppress warnings in third-party code
if(MSVC)
    target_compile_options(httplib PRIVATE /w)
else()
    target_compile_options(httplib PRIVATE -w)
endif()

if(WIN32)
    target_link_libraries(httplib PRIVATE ws2_32)
endif()

# HERESY 2035: gzip where the machine has zlib: the page and the JSON over the https door on a slow link
find_package(ZLIB)
if(ZLIB_FOUND)
    target_compile_definitions(httplib PUBLIC CPPHTTPLIB_ZLIB_SUPPORT)
    target_link_libraries(httplib PUBLIC ZLIB::ZLIB)
endif()
