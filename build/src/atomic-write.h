#pragma once
// HERESY 2371: every file the engine and its tools write lands whole or not at all. The bytes go to a part file beside the
// target, named for this process and this write (two requests writing the same cache, or the same take's file, no longer
// interleave in one shared «.part»), then one rename puts it in the target's place; a failed write, a full disk or a short
// fwrite removes the part file and says false, and the target keeps what it held. On Windows std::filesystem::rename replaces
// an existing target, as rename(2) does on Linux.

#include <atomic>
#include <cstdio>
#include <filesystem>
#include <string>
#include <system_error>

#ifdef _WIN32
#    include <process.h>
#else
#    include <unistd.h>
#endif

// the part file's name: «target.<pid>-<n>.part», still ending in .part as the lab's own (a sweep by that suffix finds it)
inline std::string atomic_part_name(const std::string & path) {
    static std::atomic<unsigned long> n{ 0 };
#ifdef _WIN32
    long pid = (long) _getpid();
#else
    long pid = (long) getpid();
#endif
    return path + "." + std::to_string(pid) + "-" + std::to_string(n.fetch_add(1)) + ".part";
}

// the part file in the target's place, or gone: true when the target now holds the new bytes
inline bool atomic_commit(const std::string & part, const std::string & path, bool ok) {
    std::error_code ec;
    if (ok) {
        std::filesystem::rename(part, path, ec);
        ok = !ec;
    }
    if (!ok) {
        std::filesystem::remove(part, ec);
    }
    return ok;
}

// bytes to a file, whole or not at all
inline bool atomic_write_file(const std::string & path, const void * data, size_t bytes) {
    std::string part = atomic_part_name(path);
    FILE *      f    = fopen(part.c_str(), "wb");
    if (!f) {
        return false;
    }
    bool ok = bytes == 0 || fwrite(data, 1, bytes, f) == bytes;
    ok      = fclose(f) == 0 && ok;
    return atomic_commit(part, path, ok);
}

inline bool atomic_write_file(const std::string & path, const std::string & data) {
    return atomic_write_file(path, data.data(), data.size());
}

// a writer that streams (the latents' quantized forms): the part file opened here, atomic_close() commits or drops it
struct AtomicFile {
    std::string path, part;
    FILE *      f  = nullptr;
    bool        ok = true;

    explicit AtomicFile(const std::string & target) : path(target), part(atomic_part_name(target)) {
        f = fopen(part.c_str(), "wb");
    }

    size_t write(const void * data, size_t size, size_t count) {
        size_t n = f ? fwrite(data, size, count, f) : 0;
        if (n != count) {
            ok = false;
        }
        return n;
    }

    bool close() {
        if (!f) {
            return false;
        }
        bool done = !ferror(f) && ok;   // the stream's own fwrite calls (the latents' writers) counted too
        done      = fclose(f) == 0 && done;
        f         = nullptr;
        return atomic_commit(part, path, done);
    }

    ~AtomicFile() {
        if (f) {   // never closed: an early return, so nothing takes the target's place
            fclose(f);
            atomic_commit(part, path, false);
        }
    }
};
