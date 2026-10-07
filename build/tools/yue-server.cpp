// yue-server.cpp: HTTP server (async job queue; the page from disk)
//
// The compute endpoint creates a job and returns its ID immediately. A single
// worker thread owns the resident models and runs jobs in FIFO order. The
// client polls the job and fetches its result, which pairs a replay request
// with its audio: the replay carries the semantic stream, the score and the
// resolved seed, so re-rendering never pays the autoregression again.
//
// The binary orchestrates only: generation, cancellation and encoding all
// live in src/.

#include "audio-io.h"
#include "flac-enc.h"
#include "httplib.h"
#include "pipeline.h"
#include "version.h"
#include "yyjson.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <condition_variable>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <random>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#ifdef _WIN32
#    include <fcntl.h>
#    include <io.h>
#    ifndef STDERR_FILENO
#        define STDERR_FILENO 2
#    endif
#else
#    include <unistd.h>
#endif

// portable fd wrappers. avoids macros that collide with C++ method names
// (e.g. sink.write() in httplib would be eaten by a write() macro).
#ifdef _WIN32
static int fd_pipe(int fd[2]) {
    return _pipe(fd, 4096, _O_BINARY);
}

static int fd_dup(int fd) {
    return _dup(fd);
}

static int fd_dup2(int src, int dst) {
    return _dup2(src, dst);
}

static int fd_read(int fd, void * buf, size_t n) {
    return _read(fd, buf, (unsigned) n);
}

static int fd_write(int fd, const void * buf, size_t n) {
    return _write(fd, buf, (unsigned) n);
}

static void fd_close(int fd) {
    _close(fd);
}

static int fd_isatty(int) {  // Local addition: no log colours on Windows consoles
    return 0;
}
#else
static int fd_pipe(int fd[2]) {
    return pipe(fd);
}

static int fd_dup(int fd) {
    return dup(fd);
}

static int fd_dup2(int src, int dst) {
    return dup2(src, dst);
}

static int fd_read(int fd, void * buf, size_t n) {
    return (int) read(fd, buf, n);
}

static int fd_write(int fd, const void * buf, size_t n) {
    return (int) write(fd, buf, n);
}

static void fd_close(int fd) {
    close(fd);
}

static int fd_isatty(int fd) {  // Local addition
    return isatty(fd);
}
#endif

static httplib::Server * g_svr = nullptr;

// Build a multipart/mixed body with one JSON replay request part followed by
// its audio part, per rendered track. The boundary is fixed; the client splits
// on it and types parts by their header.
static const char * MULTIPART_BOUNDARY = "yue2-batch-boundary";

static std::string multipart_build_tracks(const std::vector<std::string> & request_parts,
                                          const std::vector<std::string> & audio_parts,
                                          const char *                     audio_mime) {
    // One set of literal fragments sizes the body exactly and builds it:
    // audio parts weigh tens of MB, growing the string through repeated
    // appends would reallocate and copy them
    const char * dash       = "--";
    const char * json_head  = "\r\nContent-Type: application/json\r\n\r\n";
    const char * audio_head = "\r\nContent-Type: ";
    const char * head_end   = "\r\n\r\n";
    const char * crlf       = "\r\n";
    const char * close_end  = "--\r\n";

    const size_t boundary_len = strlen(MULTIPART_BOUNDARY);
    const size_t per_track    = 2 * strlen(dash) + 2 * boundary_len + strlen(json_head) + 2 * strlen(crlf) +
                             strlen(audio_head) + strlen(audio_mime) + strlen(head_end);
    size_t total = strlen(dash) + boundary_len + strlen(close_end);
    for (size_t i = 0; i < audio_parts.size(); i++) {
        total += per_track + request_parts[i].size() + audio_parts[i].size();
    }

    std::string body;
    body.reserve(total);
    for (size_t i = 0; i < audio_parts.size(); i++) {
        body += dash;
        body += MULTIPART_BOUNDARY;
        body += json_head;
        body += request_parts[i];
        body += crlf;
        body += dash;
        body += MULTIPART_BOUNDARY;
        body += audio_head;
        body += audio_mime;
        body += head_end;
        body += audio_parts[i];
        body += crlf;
    }
    body += dash;
    body += MULTIPART_BOUNDARY;
    body += close_end;
    return body;
}

static const std::string MULTIPART_MIME = std::string("multipart/mixed; boundary=") + MULTIPART_BOUNDARY;

// job system: the compute endpoint creates a job and returns its ID
// immediately. the worker thread processes jobs in FIFO order, stores
// the result. the client polls GET /job?id=N until done, then fetches
// the result with GET /job?id=N&result=1.
// cancel: POST /job?id=N&cancel=1 sets the per-job flag.
enum class JobStatus : int {
    RUNNING   = 0,
    DONE      = 1,
    FAILED    = 2,
    CANCELLED = 3,
};

struct Job {
    std::string            id;
    std::atomic<JobStatus> status{ JobStatus::RUNNING };
    std::string            result_body;
    std::string            result_mime;
    std::atomic<bool>      cancel{ false };

    // Local additions, written before status like the result fields: the
    // library names of the saved tracks, the score of a plan_only job, and a
    // short reason when the job failed
    std::vector<std::string> takes;
    std::string              abc;
    std::string              error;
    std::atomic<bool>        started{ false };  // false while it waits in the queue
    int64_t                  lm_seed = -1;      // resolved seeds of a synth job
    int64_t                  seed    = -1;

    // memory ordering contract: result_body and result_mime are written
    // before status is stored (seq_cst). the client loads status (seq_cst)
    // and only reads result fields after seeing done/failed. this guarantees
    // visibility without an explicit mutex on the result fields.
};

static std::mutex                                            mtx_jobs;
static std::unordered_map<std::string, std::shared_ptr<Job>> g_jobs;
static std::deque<std::string>                               g_job_order;
static const int                                             MAX_JOBS = 32;

// job currently on the GPU, tracked so shutdown can cancel it and return
// within one pipeline cancel poll instead of waiting out the generation.
static std::mutex           mtx_active;
static std::shared_ptr<Job> g_active_job;

// HERESY 1167 (Viktor: «таймер вбить для `Models auto unload`. Дефолт 60 минут»): when the last job began or ended, on the
// steady clock, and whether this idle spell has had its unload yet
static std::atomic<int64_t> g_idle_since{ 0 };
static std::atomic<bool>    g_idle_unloaded{ false };

static int64_t steady_seconds() {
    return std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

static void active_job_set(std::shared_ptr<Job> job) {
    std::lock_guard<std::mutex> lock(mtx_active);
    g_active_job = std::move(job);
    g_idle_since.store(steady_seconds());
    g_idle_unloaded.store(false);
}

static void active_job_cancel() {
    std::lock_guard<std::mutex> lock(mtx_active);
    if (g_active_job && g_active_job->status.load() == JobStatus::RUNNING) {
        fprintf(stderr, "[Server] Cancelling active job %s\n", g_active_job->id.c_str());
        g_active_job->cancel.store(true);
    }
}

// cancel callback the pipeline polls, reads the per-job atomic flag
static bool server_cancel_job(void * data) {
    auto * flag = (const std::atomic<bool> *) data;
    return flag && flag->load(std::memory_order_relaxed);
}

// generate a random hex ID (64 bits of entropy, non-predictable)
static std::string job_make_id() {
    static std::mt19937_64      rng(std::random_device{}());
    static std::mutex           mtx_rng;
    std::lock_guard<std::mutex> lock(mtx_rng);
    char                        buf[17];
    snprintf(buf, sizeof(buf), "%016llx", (unsigned long long) rng());
    return buf;
}

static std::shared_ptr<Job> job_create() {
    std::lock_guard<std::mutex> lock(mtx_jobs);
    auto                        job = std::make_shared<Job>();
    job->id                         = job_make_id();
    g_jobs[job->id]                 = job;
    g_job_order.push_back(job->id);

    // evict oldest completed jobs to stay under MAX_JOBS.
    // running jobs are never evicted.
    while ((int) g_job_order.size() > MAX_JOBS) {
        bool evicted = false;
        for (auto it = g_job_order.begin(); it != g_job_order.end(); ++it) {
            auto jit = g_jobs.find(*it);
            if (jit == g_jobs.end() || jit->second->status.load() != JobStatus::RUNNING) {
                if (jit != g_jobs.end()) {
                    g_jobs.erase(jit);
                }
                g_job_order.erase(it);
                evicted = true;
                break;
            }
        }
        if (!evicted) {
            break;
        }
    }
    return job;
}

static std::shared_ptr<Job> job_find(const std::string & id) {
    std::lock_guard<std::mutex> lock(mtx_jobs);
    auto                        it = g_jobs.find(id);
    return it != g_jobs.end() ? it->second : nullptr;
}

// HERESY 1114 (Viktor, 02.10.2026): most machines stand open to the internet on every port, so the studio answers
// this machine and private networks only: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16 (link-local), 100.64/10
// (carrier-grade NAT, where Tailscale lives: a laptop reaching its home server), ::1, fc00::/7,
// fe80::/10, and IPv4 in IPv6 dress. RUACH_ALLOW_PUBLIC=1 opens it to anyone (behind one's own proxy and guard).
static bool is_private_addr(const std::string & addr) {
    std::string a = addr;
    if (a.rfind("::ffff:", 0) == 0) a = a.substr(7);
    if (a == "::1") return true;
    if (a.find(':') != std::string::npos) {
        std::string l = a;
        for (auto & c : l) c = (char) tolower((unsigned char) c);
        return l.rfind("fc", 0) == 0 || l.rfind("fd", 0) == 0 || l.rfind("fe8", 0) == 0 || l.rfind("fe9", 0) == 0 ||
               l.rfind("fea", 0) == 0 || l.rfind("feb", 0) == 0;
    }
    unsigned b[4];
    char     rest;
    if (sscanf(a.c_str(), "%u.%u.%u.%u%c", &b[0], &b[1], &b[2], &b[3], &rest) != 4) return false;
    return b[0] == 127 || b[0] == 10 || (b[0] == 192 && b[1] == 168) || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||
           (b[0] == 169 && b[1] == 254) || (b[0] == 100 && b[1] >= 64 && b[1] <= 127);
}

static const char * job_status_str(JobStatus s) {
    switch (s) {
        case JobStatus::RUNNING:
            return "running";
        case JobStatus::DONE:
            return "done";
        case JobStatus::FAILED:
            return "failed";
        case JobStatus::CANCELLED:
            return "cancelled";
    }
    return "running";
}

// log capture: intercept stderr via pipe, forward to terminal + ring buffer.
// SSE clients connect to /logs and receive lines in real time.
#define LOG_RING_BITS 9
#define LOG_RING_SIZE (1 << LOG_RING_BITS)
#define LOG_RING_MASK (LOG_RING_SIZE - 1)

static std::mutex              mtx_log;
static std::condition_variable cv_log;
static std::string             log_ring[LOG_RING_SIZE];
static uint64_t                log_seq = 0;

static int         g_real_stderr_fd = -1;
static int         g_pipe_read_fd   = -1;
static std::thread g_log_reader;

// Local addition: colours on the terminal copy of the log; the ring (the page's
// /logs) stays plain. On when stderr is a terminal and NO_COLOR is unset. Whole
// lines by meaning: errors red, warnings and cancels yellow, a finished song or
// save green, loading chatter, graph notes, counters and request dumps dim.
// Otherwise the [Tag] by stage (writing music magenta, sound stage cyan, VAE
// blue, sliders and LoRAs pink, transcriber bright cyan, the rest bold), with
// stage summaries (ms/step, load and decode times, a new job) in bold.
static bool g_log_color = false;

static bool log_has(const std::string & s, const char * t) {
    return s.find(t) != std::string::npos;
}

static bool log_starts(const std::string & s, const char * t) {
    return s.compare(0, strlen(t), t) == 0;
}

// "[AR] Semantic 100/9000", "[NAR] Step 3/32, 451 ms": a counter, not news
static bool log_is_progress(const std::string & s) {
    if (log_starts(s, "[NAR] Step ")) {
        return true;
    }
    size_t sp = s.rfind(' ');
    if (!log_starts(s, "[AR] ") || sp == std::string::npos) {
        return false;
    }
    std::string last = s.substr(sp + 1);
    return last.find('/') != std::string::npos && last[0] != '/' &&
           last.find_first_not_of("0123456789/") == std::string::npos;
}

static std::string log_colorize(const std::string & s) {
    const char * whole = nullptr;
    if (log_has(s, "FATAL") || log_has(s, "ERROR") || log_has(s, "OOM") || log_has(s, "Cannot ") ||
        log_has(s, "cannot ") || log_has(s, "Failed") || log_has(s, "failed")) {
        whole = "\033[31m";
    } else if (log_has(s, "WARNING") || log_has(s, "warning") || log_has(s, "Cancel")) {
        whole = "\033[33m";
    } else if (log_starts(s, "[Pipeline] Done") || log_starts(s, "[Library] Saved") || log_starts(s, "[Server] Listening")) {
        whole = "\033[1;32m";
    } else if (s.empty() || s[0] != '[' || log_is_progress(s) || log_starts(s, "[GGUF]") || log_starts(s, "[Load]") ||
               log_starts(s, "[WeightCtx]") || log_starts(s, "[BPE]") || log_starts(s, "[LM-Config]") ||
               log_starts(s, "[LM-KV]") || log_starts(s, "[Qwen3]") || log_starts(s, "[Dedup]") ||
               log_has(s, "] Graph") || log_has(s, "] Attn:") || log_has(s, "] MLP:")) {
        whole = "\033[2m";
    }
    if (whole) {
        return std::string(whole) + s + "\033[0m";
    }
    size_t end = s.find(']');
    if (end == std::string::npos || end > 24) {
        return s;
    }
    std::string  tag = s.substr(0, end + 1), rest = s.substr(end + 1);
    const char * tc  = "\033[1m";
    if (tag == "[AR]" || log_starts(tag, "[LM")) {
        tc = "\033[35m";
    } else if (tag == "[NAR]") {
        tc = "\033[36m";
    } else if (log_starts(tag, "[VAE")) {
        tc = "\033[34m";
    } else if (tag == "[Sliders]" || tag == "[LoRA]") {
        tc = "\033[95m";
    } else if (tag == "[SheetSage]") {
        tc = "\033[96m";
    }
    bool summary = log_has(rest, "ms/step") || log_starts(s, "[NAR] Solved") || log_has(rest, "decode done") ||
                   log_starts(s, "[Store] Load ") || log_starts(s, "[Server] Job ");
    return std::string(tc) + tag + "\033[0m" + (summary ? "\033[1m" + rest + "\033[0m" : rest);
}

// reader thread: drain pipe, forward to real stderr, push lines to ring.
// exits when the write end of the pipe is closed (fd_dup2 restores real stderr).
static void log_reader_main() {
    char        buf[4096];
    std::string partial;
    for (;;) {
        int n = fd_read(g_pipe_read_fd, buf, sizeof(buf));
        if (n <= 0) {
            break;
        }
        if (!g_log_color) {
            fd_write(g_real_stderr_fd, buf, (size_t) n);
        }
        partial.append(buf, (size_t) n);
        size_t pos;
        while ((pos = partial.find('\n')) != std::string::npos) {
            if (g_log_color) {  // Local addition: whole lines, coloured
                std::string out = log_colorize(partial.substr(0, pos)) + "\n";
                fd_write(g_real_stderr_fd, out.data(), out.size());
            }
            std::lock_guard<std::mutex> lock(mtx_log);
            log_ring[log_seq & LOG_RING_MASK] = partial.substr(0, pos);
            log_seq++;
            cv_log.notify_all();
            partial.erase(0, pos + 1);
        }
    }
    if (!partial.empty()) {
        if (g_log_color) {
            std::string out = log_colorize(partial);
            fd_write(g_real_stderr_fd, out.data(), out.size());
        }
        std::lock_guard<std::mutex> lock(mtx_log);
        log_ring[log_seq & LOG_RING_MASK] = std::move(partial);
        log_seq++;
        cv_log.notify_all();
    }
    fd_close(g_pipe_read_fd);
}

// Restore stderr and drain the reader before the pipe dies with the process.
// Idempotent: the destructor and the exit hook both land here, either order.
static void log_capture_stop() {
    if (g_real_stderr_fd < 0) {
        return;
    }
    fflush(stderr);
    // the restore drops the last write end, so the reader reads EOF and returns
    fd_dup2(g_real_stderr_fd, STDERR_FILENO);
    cv_log.notify_all();
    if (g_log_reader.joinable()) {
        g_log_reader.join();
    }
    fd_close(g_real_stderr_fd);
    g_real_stderr_fd = -1;
}

static void setup_log_capture() {
    g_real_stderr_fd = fd_dup(STDERR_FILENO);
    g_log_color      = g_real_stderr_fd >= 0 && fd_isatty(g_real_stderr_fd) && !getenv("NO_COLOR");  // Local addition
    int pipefd[2];
    if (fd_pipe(pipefd) != 0) {
        fd_close(g_real_stderr_fd);
        g_real_stderr_fd = -1;
        return;
    }
    g_pipe_read_fd = pipefd[0];
    fd_dup2(pipefd[1], STDERR_FILENO);
    fd_close(pipefd[1]);
    // A loader aborts the process with exit() on a fatal error, which skips
    // every destructor: the hook still drains the pipe, so the message that
    // explains the failure reaches the terminal.
    atexit(log_capture_stop);
    g_log_reader = std::thread(log_reader_main);
}

// RAII: captures stderr on construction, restores and drains on destruction.
struct LogCapture {
    LogCapture() { setup_log_capture(); }

    ~LogCapture() { log_capture_stop(); }
};

// GET /logs: SSE stream of stderr lines.
// sends backlog (up to LOG_RING_SIZE) then streams new lines in real time.
static void handle_logs(const httplib::Request &, httplib::Response & res) {
    res.set_header("Cache-Control", "no-cache");
    res.set_header("X-Accel-Buffering", "no");
    res.set_chunked_content_provider(
        "text/event-stream", [cursor = uint64_t(0), init = false](size_t, httplib::DataSink & sink) mutable -> bool {
            std::unique_lock<std::mutex> lock(mtx_log);
            if (!init) {
                uint64_t avail = log_seq < LOG_RING_SIZE ? log_seq : (uint64_t) LOG_RING_SIZE;
                cursor         = log_seq - avail;
                while (cursor < log_seq) {
                    std::string ev = "data: " + log_ring[cursor & LOG_RING_MASK] + "\n\n";
                    cursor++;
                    lock.unlock();
                    if (!sink.write(ev.c_str(), ev.size())) {
                        return false;
                    }
                    lock.lock();
                }
                init = true;
            }
            cv_log.wait_for(lock, std::chrono::seconds(2));
            while (cursor < log_seq) {
                std::string ev = "data: " + log_ring[cursor & LOG_RING_MASK] + "\n\n";
                cursor++;
                lock.unlock();
                if (!sink.write(ev.c_str(), ev.size())) {
                    return false;
                }
                lock.lock();
            }
            return true;
        });
}

// work queue: one worker owns the models, jobs run in FIFO order
static std::deque<std::function<void()>> g_work_queue;
static std::mutex                        mtx_work;
static std::condition_variable           cv_work;
static bool                              g_work_stop = false;

static void idle_unload_check();   // HERESY 1167: below, with the settings

static void work_push(std::function<void()> fn) {
    {
        std::lock_guard<std::mutex> lock(mtx_work);
        g_work_queue.push_back(std::move(fn));
    }
    cv_work.notify_one();
}

static void worker_main() {
    for (;;) {
        std::function<void()> job;
        {
            std::unique_lock<std::mutex> lock(mtx_work);
            // HERESY 1167: idle, the worker looks every 5 s whether the models have stayed past their time
            if (!cv_work.wait_for(lock, std::chrono::seconds(5), [] { return g_work_stop || !g_work_queue.empty(); })) {
                lock.unlock();
                idle_unload_check();
                continue;
            }
            if (g_work_stop && g_work_queue.empty()) {
                return;
            }
            job = std::move(g_work_queue.front());
            g_work_queue.pop_front();
        }
        job();
    }
}

static Yue2Pipeline g_pipeline;
static bool         g_keep_loaded = false;
static std::string  g_model_path;
static std::string  g_vae_path;
static std::string  g_transcriber_path;

// Local additions: named decoders, the slider catalog and the song library
struct SliderInfo {
    std::string id, label, description, path;
};

static std::vector<std::pair<std::string, std::string>> g_vaes;    // name, path; the first is the default
static std::vector<std::pair<std::string, std::string>> g_models;  // backbone name, path; see --model
static std::string                                       g_settings_path;

// Engine settings the console can change between jobs, persisted to --settings
struct EngineSettings {
    std::string model;        // a name from g_models
    bool        keep_loaded;  // every module stays in VRAM between songs
    int         max_seq;      // KV cache rows, 0 = the whole context
    int         vae_core;     // VAE tile core frames
    int         unload_after_min;  // HERESY 1167: idle minutes before the models leave VRAM, 15..240 by 15
    bool        unload_at_once;    // HERESY 1167: or 15 s after a song
};

static EngineSettings      g_settings;
static std::mutex          mtx_settings;
static std::atomic<size_t> g_loaded_bytes{ 0 };
static std::atomic<int>    g_loaded_modules{ 0 };
static std::vector<SliderInfo>                           g_sliders;

// Local addition: the LoRA catalog (every .safetensors under --loras), described
// the same way as the other console's loras.py
static yyjson_mut_val * lora_catalog_json(yyjson_mut_doc * doc) {
    yyjson_mut_val * list = yyjson_mut_arr(doc);
    for (const LoraInfo & l : lora_catalog(g_pipeline.lora_dir)) {
        yyjson_mut_val * item = yyjson_mut_obj(doc);
        yyjson_mut_obj_add_strcpy(doc, item, "id", l.id.c_str());
        yyjson_mut_obj_add_strcpy(doc, item, "name", l.name.c_str());
        yyjson_mut_obj_add_real(doc, item, "size_mb", l.size_mb);
        yyjson_mut_val * halves = yyjson_mut_arr(doc);
        if (l.ar) {
            yyjson_mut_arr_add_str(doc, halves, "ar");
        }
        if (l.nar) {
            yyjson_mut_arr_add_str(doc, halves, "nar");
        }
        yyjson_mut_obj_add_val(doc, item, "halves", halves);
        if (!l.error.empty()) {
            yyjson_mut_obj_add_strcpy(doc, item, "error", l.error.c_str());
        } else {
            yyjson_mut_obj_add_int(doc, item, "rank", l.rank);
            yyjson_mut_obj_add_strcpy(doc, item, "layout", l.layout.c_str());
            yyjson_mut_obj_add_int(doc, item, "pairs", l.pairs);
            yyjson_mut_obj_add_strcpy(doc, item, "trigger", l.trigger.c_str());
            yyjson_mut_obj_add_strcpy(doc, item, "hint", l.hint.c_str());
            yyjson_mut_obj_add_strcpy(doc, item, "mode", l.mode.c_str());
        }
        yyjson_mut_arr_append(list, item);
    }
    return list;
}
static std::string                                       g_outputs_dir;
static std::mutex                                        mtx_library;

static const char * vae_label(const std::string & name) {
    if (name == "standard") {
        return "Standard";
    }
    if (name == "legacy") {
        return "Legacy";
    }
    if (name == "blend") {
        return "Blend";
    }
    return name.c_str();
}

static const char * vae_repo(const std::string & name) {
    if (name == "standard") {
        return "m-a-p/YuE2-Vae";
    }
    if (name == "legacy") {
        return "m-a-p/YuE2-Vae-legacy";
    }
    if (name == "blend") {
        return "Mothersuperior/YuE2-Vae-merge-0.666";
    }
    return "";
}

static std::string read_file(const std::string & path) {
    std::ifstream f(path, std::ios::binary);
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

static bool write_file(const std::string & path, const std::string & data) {
    std::string   tmp = path + ".part";
    std::ofstream f(tmp, std::ios::binary);
    if (!f) {
        return false;
    }
    f.write(data.data(), (std::streamsize) data.size());
    f.close();
    if (!f) {
        return false;
    }
    std::error_code ec;
    std::filesystem::rename(tmp, path, ec);
    return !ec;
}

// catalog.json written by convert-extras.py: {"sliders": [{id, label, description, file}]}
static bool load_slider_catalog(const std::string & dir) {
    std::string  text = read_file(dir + "/catalog.json");
    yyjson_doc * doc  = yyjson_read(text.c_str(), text.size(), 0);
    if (!doc) {
        fprintf(stderr, "[Server] FATAL: cannot read %s/catalog.json\n", dir.c_str());
        return false;
    }
    yyjson_val * list = yyjson_obj_get(yyjson_doc_get_root(doc), "sliders");
    size_t       idx, max;
    yyjson_val * item;
    yyjson_arr_foreach(list, idx, max, item) {
        SliderInfo   s;
        yyjson_val * v;
        if ((v = yyjson_obj_get(item, "id")) && yyjson_is_str(v)) {
            s.id = yyjson_get_str(v);
        }
        if ((v = yyjson_obj_get(item, "label")) && yyjson_is_str(v)) {
            s.label = yyjson_get_str(v);
        }
        if ((v = yyjson_obj_get(item, "description")) && yyjson_is_str(v)) {
            s.description = yyjson_get_str(v);
        }
        if ((v = yyjson_obj_get(item, "file")) && yyjson_is_str(v)) {
            s.path = dir + "/" + yyjson_get_str(v);
        }
        if (!s.id.empty() && std::filesystem::is_regular_file(s.path)) {
            g_sliders.push_back(s);
            g_pipeline.slider_files.push_back({ s.id, s.path });
        }
    }
    yyjson_doc_free(doc);
    fprintf(stderr, "[Server] Sliders: %zu from %s\n", g_sliders.size(), dir.c_str());
    return true;
}

// A library name is one folder directly under the outputs directory
static bool library_name_ok(const std::string & name) {
    if (name.empty() || name.size() > 200 || name[0] == '.') {
        return false;
    }
    for (char c : name) {
        if (!(isalnum((unsigned char) c) || c == '-' || c == '_' || c == '.')) {
            return false;
        }
    }
    return name.find("..") == std::string::npos && std::filesystem::is_directory(g_outputs_dir + "/" + name);
}

static std::string slugify(const std::string & title) {
    std::string out;
    for (char c : title) {
        if (isalnum((unsigned char) c)) {
            out += (char) tolower((unsigned char) c);
        } else if (!out.empty() && out.back() != '-') {
            out += '-';
        }
        if (out.size() >= 40) {
            break;
        }
    }
    while (!out.empty() && out.back() == '-') {
        out.pop_back();
    }
    return out.empty() ? "song" : out;
}

static std::string audio_file_of(const std::string & dir) {
    if (std::filesystem::is_regular_file(dir + "/audio.mp3")) {
        return dir + "/audio.mp3";
    }
    return dir + "/audio.wav";
}

// HERESY 1053 (Viktor): the player hears listen.flac, written beside audio.wav when the take is saved
// (lossless, about 70 % of the bytes at 24 bit); a take older than that gets it at its first listen.
// Downloads, the lab and the trash keep working on audio.wav, as before.
static bool write_listen_flac(const std::string & dir, const std::string & wav, const std::string & title,
                              const std::string & lyrics) {
    std::string err;
    int         bits = 0;
    std::string flac = flac_encode_wav(wav, title, lyrics, err, &bits);
    if (flac.empty() || !write_file(dir + "/listen.flac", flac)) {
        fprintf(stderr, "[Library] no listen.flac in %s: %s\n", dir.c_str(), err.empty() ? "cannot write" : err.c_str());
        return false;
    }
    return true;
}

// HERESY 1168 (Viktor 07.10.2026: «прикрутить бы этот код к движку, и тогда будет реальная практически моментальная
// декОда другим VAE»): a take keeps its acoustic latents beside its audio, latents.f32 in the layout of the engine's own
// tensor dumps (debug.h: [ndims = 2] [T_lat] [64] as int32, then f32 time major), about 3 MB for eight minutes; another
// decoder makes the take again from them in seconds, the sound stage not run again
static bool latents_save(const std::string & dir, const Yue2Song & song) {
    if (song.T_lat <= 0 || song.latents.size() != (size_t) song.T_lat * YUE2_LATENT_DIM) {
        return false;
    }
    int32_t     head[3] = { 2, (int32_t) song.T_lat, YUE2_LATENT_DIM };
    std::string out((const char *) head, sizeof(head));
    out.append((const char *) song.latents.data(), song.latents.size() * sizeof(float));
    return write_file(dir + "/latents.f32", out);
}

static bool latents_load(const std::string & dir, Yue2Song * song) {
    std::string in = read_file(dir + "/latents.f32");
    int32_t     head[3];
    if (in.size() < sizeof(head)) {
        return false;
    }
    memcpy(head, in.data(), sizeof(head));
    if (head[0] != 2 || head[1] <= 0 || head[2] != YUE2_LATENT_DIM ||
        in.size() != sizeof(head) + (size_t) head[1] * YUE2_LATENT_DIM * sizeof(float)) {
        return false;
    }
    song->T_lat = head[1];
    song->latents.resize((size_t) head[1] * YUE2_LATENT_DIM);
    memcpy(song->latents.data(), in.data() + sizeof(head), song->latents.size() * sizeof(float));
    return true;
}

static bool listen_flac_fresh(const std::string & dir) {
    std::error_code ec;
    auto            f = std::filesystem::last_write_time(dir + "/listen.flac", ec);
    if (ec) {
        return false;
    }
    auto w = std::filesystem::last_write_time(dir + "/audio.wav", ec);
    return !ec && f >= w;
}

// One library entry: meta.json plus the prompt fields of request.json
static yyjson_mut_val * library_entry(yyjson_mut_doc * out, const std::string & name) {
    std::string  dir      = g_outputs_dir + "/" + name;
    std::string  meta_txt = read_file(dir + "/meta.json");
    std::string  req_txt  = read_file(dir + "/request.json");
    yyjson_doc * meta     = yyjson_read(meta_txt.c_str(), meta_txt.size(), 0);
    if (!meta) {
        return nullptr;
    }
    yyjson_mut_val * e = yyjson_val_mut_copy(out, yyjson_doc_get_root(meta));
    yyjson_doc_free(meta);
    yyjson_mut_obj_remove_key(e, "name");
    yyjson_mut_obj_add_strcpy(out, e, "name", name.c_str());
    yyjson_mut_obj_add_bool(out, e, "latents", std::filesystem::is_regular_file(dir + "/latents.f32"));   // HERESY 1168
    Yue2Request r;
    if (request_parse_json(&r, req_txt.c_str())) {
        yyjson_mut_obj_add_strncpy(out, e, "style", r.style.c_str(), r.style.size());
        yyjson_mut_obj_add_strncpy(out, e, "lyrics", r.lyrics.c_str(), r.lyrics.size());
        yyjson_mut_obj_add_strncpy(out, e, "cot", r.cot.c_str(), r.cot.size());
        yyjson_mut_obj_add_sint(out, e, "lm_seed", r.lm_seed);
        yyjson_mut_obj_add_sint(out, e, "seed", r.seed);
        std::string vae = r.vae.empty() && !g_vaes.empty() ? g_vaes[0].first : r.vae;
        yyjson_mut_obj_add_strcpy(out, e, "vae", vae.c_str());
        yyjson_mut_val * sl = yyjson_mut_arr(out);
        for (const Yue2SliderChoice & c : r.sliders) {
            yyjson_mut_val * item = yyjson_mut_obj(out);
            yyjson_mut_obj_add_strcpy(out, item, "id", c.id.c_str());
            yyjson_mut_obj_add_real(out, item, "strength", c.strength);
            yyjson_mut_arr_append(sl, item);
        }
        yyjson_mut_obj_add_val(out, e, "sliders", sl);
        yyjson_mut_val * lo = yyjson_mut_arr(out);
        for (const Yue2LoraChoice & c : r.loras) {
            yyjson_mut_val * item = yyjson_mut_obj(out);
            yyjson_mut_obj_add_strcpy(out, item, "id", c.id.c_str());
            yyjson_mut_obj_add_real(out, item, "ar", std::round((double) c.ar * 1000.0) / 1000.0);
            yyjson_mut_obj_add_real(out, item, "nar", std::round((double) c.nar * 1000.0) / 1000.0);
            yyjson_mut_arr_append(lo, item);
        }
        yyjson_mut_obj_add_val(out, e, "loras", lo);
        yyjson_mut_obj_add_int(out, e, "steps", r.steps);
        yyjson_mut_obj_add_real(out, e, "cfg_scale", r.cfg_scale);
        yyjson_mut_obj_add_real(out, e, "duration", r.duration);
        yyjson_mut_obj_add_strcpy(out, e, "parent", r.parent.c_str());
        yyjson_mut_obj_add_bool(out, e, "has_score", !r.abc.empty());
    }
    return e;
}

static std::string library_list_json() {
    std::vector<std::string> names;
    std::error_code          ec;
    for (const auto & d : std::filesystem::directory_iterator(g_outputs_dir, ec)) {
        if (d.is_directory() && std::filesystem::is_regular_file(d.path() / "meta.json")) {
            names.push_back(d.path().filename().string());
        }
    }
    std::sort(names.begin(), names.end(), std::greater<std::string>());
    yyjson_mut_doc * doc  = yyjson_mut_doc_new(NULL);
    yyjson_mut_val * root = yyjson_mut_obj(doc);
    yyjson_mut_doc_set_root(doc, root);
    yyjson_mut_val * list = yyjson_mut_arr(doc);
    for (const auto & n : names) {
        yyjson_mut_val * e = library_entry(doc, n);
        if (e) {
            yyjson_mut_arr_append(list, e);
        }
    }
    yyjson_mut_obj_add_val(doc, root, "takes", list);
    char *      json = yyjson_mut_write(doc, 0, NULL);
    std::string out  = json ? json : "{\"takes\":[]}";
    if (json) {
        free(json);
    }
    yyjson_mut_doc_free(doc);
    return out;
}

static std::string library_entry_json(const std::string & name) {
    yyjson_mut_doc * doc = yyjson_mut_doc_new(NULL);
    yyjson_mut_val * e   = library_entry(doc, name);
    std::string      out = "{}";
    if (e) {
        yyjson_mut_doc_set_root(doc, e);
        char * json = yyjson_mut_write(doc, 0, NULL);
        if (json) {
            out = json;
            free(json);
        }
    }
    yyjson_mut_doc_free(doc);
    return out;
}

// Save one rendered track into the library: audio, replay request, meta
static std::string library_save(const Yue2Request & replay,
                                const std::string & audio,
                                bool                is_mp3,
                                const Yue2Song &    song,
                                int                 track,
                                int                 tracks,
                                int                 song_index,
                                int                 variation,
                                bool                provided_score,
                                double              render_seconds) {
    std::lock_guard<std::mutex> lock(mtx_library);
    char                        stamp[32];
    time_t                      now = time(nullptr);
    struct tm                   tmv;
#ifdef _WIN32
    localtime_s(&tmv, &now);
#else
    localtime_r(&now, &tmv);
#endif
    strftime(stamp, sizeof(stamp), "%Y%m%d-%H%M%S", &tmv);
    std::string base = std::string(stamp) + "-" + slugify(replay.title);
    if (tracks > 1) {
        base += "-" + std::to_string(track + 1);
    }
    std::string name = base;
    for (int n = 2; std::filesystem::exists(g_outputs_dir + "/" + name); n++) {
        name = base + "-v" + std::to_string(n);
    }
    std::string     dir = g_outputs_dir + "/" + name;
    std::error_code ec;
    std::filesystem::create_directories(dir, ec);
    if (ec) {
        fprintf(stderr, "[Library] cannot create %s: %s\n", dir.c_str(), ec.message().c_str());
        return "";
    }
    bool ok = write_file(dir + (is_mp3 ? "/audio.mp3" : "/audio.wav"), audio) &&
              write_file(dir + "/request.json", request_to_json(&replay, false));

    yyjson_mut_doc * doc  = yyjson_mut_doc_new(NULL);
    yyjson_mut_val * root = yyjson_mut_obj(doc);
    yyjson_mut_doc_set_root(doc, root);
    yyjson_mut_obj_add_strncpy(doc, root, "title", replay.title.c_str(), replay.title.size());
    yyjson_mut_obj_add_int(doc, root, "created", (int64_t) now);
    yyjson_mut_obj_add_real(doc, root, "seconds", (double) song.T_audio / YUE2_SAMPLE_RATE);
    yyjson_mut_obj_add_strncpy(doc, root, "format", replay.output_format.c_str(), replay.output_format.size());
    yyjson_mut_obj_add_bool(doc, root, "favorite", false);
    yyjson_mut_obj_add_bool(doc, root, "truncated", song.truncated);
    yyjson_mut_obj_add_real(doc, root, "render_seconds", render_seconds);
    yyjson_mut_obj_add_int(doc, root, "song", song_index);
    yyjson_mut_obj_add_int(doc, root, "variation", variation);
    yyjson_mut_obj_add_bool(doc, root, "provided_score", provided_score);
    {
        std::lock_guard<std::mutex> settings_lock(mtx_settings);
        yyjson_mut_obj_add_strcpy(doc, root, "model", g_settings.model.c_str());
    }
    char * json = yyjson_mut_write(doc, YYJSON_WRITE_PRETTY, NULL);
    ok          = ok && json && write_file(dir + "/meta.json", json);
    if (json) {
        free(json);
    }
    yyjson_mut_doc_free(doc);
    if (!ok) {
        fprintf(stderr, "[Library] cannot write %s\n", dir.c_str());
        return "";
    }
    if (!is_mp3) {
        write_listen_flac(dir, audio, replay.title, replay.lyrics);   // HERESY 1053; a failure only costs the WAV's bytes
    }
    fprintf(stderr, "[Library] Saved %s\n", name.c_str());
    return name;
}

// Update title and/or favorite in meta.json
static bool library_update(const std::string & name, const std::string & body) {
    std::lock_guard<std::mutex> lock(mtx_library);
    std::string                 path = g_outputs_dir + "/" + name + "/meta.json";
    std::string                 text = read_file(path);
    yyjson_doc *                meta = yyjson_read(text.c_str(), text.size(), 0);
    yyjson_doc *                req  = yyjson_read(body.c_str(), body.size(), 0);
    if (!meta || !req) {
        if (meta) {
            yyjson_doc_free(meta);
        }
        if (req) {
            yyjson_doc_free(req);
        }
        return false;
    }
    yyjson_mut_doc * doc  = yyjson_doc_mut_copy(meta, NULL);
    yyjson_mut_val * root = yyjson_mut_doc_get_root(doc);
    yyjson_val *     v;
    if ((v = yyjson_obj_get(yyjson_doc_get_root(req), "title")) && yyjson_is_str(v)) {
        yyjson_mut_obj_remove_key(root, "title");
        yyjson_mut_obj_add_strcpy(doc, root, "title", yyjson_get_str(v));
    }
    if ((v = yyjson_obj_get(yyjson_doc_get_root(req), "favorite")) && yyjson_is_bool(v)) {
        yyjson_mut_obj_remove_key(root, "favorite");
        yyjson_mut_obj_add_bool(doc, root, "favorite", yyjson_get_bool(v));
    }
    char * json = yyjson_mut_write(doc, YYJSON_WRITE_PRETTY, NULL);
    bool   ok   = json && write_file(path, json);
    if (json) {
        free(json);
    }
    yyjson_mut_doc_free(doc);
    yyjson_doc_free(meta);
    yyjson_doc_free(req);
    return ok;
}

static std::string model_name_of(const std::string & path) {
    std::string base = std::filesystem::path(path).stem().string();  // YuE2-3B-BF16
    size_t      dash = base.rfind('-');
    return dash == std::string::npos ? base : base.substr(dash + 1);
}

static std::string settings_json(const EngineSettings & st) {
    yyjson_mut_doc * doc  = yyjson_mut_doc_new(NULL);
    yyjson_mut_val * root = yyjson_mut_obj(doc);
    yyjson_mut_doc_set_root(doc, root);
    yyjson_mut_obj_add_strcpy(doc, root, "model", st.model.c_str());
    yyjson_mut_val * models = yyjson_mut_arr(doc);
    for (const auto & m : g_models) {
        yyjson_mut_arr_add_strcpy(doc, models, m.first.c_str());
    }
    yyjson_mut_obj_add_val(doc, root, "models", models);
    yyjson_mut_obj_add_bool(doc, root, "keep_loaded", st.keep_loaded);
    yyjson_mut_obj_add_int(doc, root, "unload_after_min", st.unload_after_min);
    yyjson_mut_obj_add_bool(doc, root, "unload_at_once", st.unload_at_once);
    yyjson_mut_obj_add_int(doc, root, "max_seq", st.max_seq);
    yyjson_mut_obj_add_int(doc, root, "max_seq_full", YUE2_CONTEXT);
    yyjson_mut_obj_add_int(doc, root, "vae_core", st.vae_core);
    char *      json = yyjson_mut_write(doc, YYJSON_WRITE_PRETTY, NULL);
    std::string out  = json ? json : "{}";
    if (json) {
        free(json);
    }
    yyjson_mut_doc_free(doc);
    return out;
}

// Read settings JSON over a base; false with a reason when a value is out of range
static bool settings_parse(const std::string & body, EngineSettings * st, std::string * why) {
    yyjson_doc * doc = yyjson_read(body.c_str(), body.size(), 0);
    if (!doc || !yyjson_is_obj(yyjson_doc_get_root(doc))) {
        if (doc) {
            yyjson_doc_free(doc);
        }
        *why = "invalid JSON";
        return false;
    }
    yyjson_val * root = yyjson_doc_get_root(doc);
    yyjson_val * v;
    bool         ok = true;
    if ((v = yyjson_obj_get(root, "model")) && yyjson_is_str(v)) {
        std::string name  = yyjson_get_str(v);
        bool        known = false;
        for (const auto & m : g_models) {
            known = known || m.first == name;
        }
        if (known) {
            st->model = name;
        } else {
            *why = "unknown model";
            ok   = false;
        }
    }
    if ((v = yyjson_obj_get(root, "keep_loaded")) && yyjson_is_bool(v)) {
        st->keep_loaded = yyjson_get_bool(v);
    }
    if ((v = yyjson_obj_get(root, "unload_after_min")) && yyjson_is_int(v)) {
        int n = (int) yyjson_get_int(v);
        if (n >= 15 && n <= 240 && n % 15 == 0) {
            st->unload_after_min = n;
        } else {
            *why = "the models' idle time must be 15 to 240 minutes, by 15";
            ok   = false;
        }
    }
    if ((v = yyjson_obj_get(root, "unload_at_once")) && yyjson_is_bool(v)) {
        st->unload_at_once = yyjson_get_bool(v);
    }
    if ((v = yyjson_obj_get(root, "max_seq")) && yyjson_is_int(v)) {
        int n = (int) yyjson_get_int(v);
        if (n == 0 || (n >= 4096 && n <= YUE2_CONTEXT)) {
            st->max_seq = n;
        } else {
            *why = "context must be 0 (whole) or between 4096 and 24576";
            ok   = false;
        }
    }
    if ((v = yyjson_obj_get(root, "vae_core")) && yyjson_is_int(v)) {
        int n = (int) yyjson_get_int(v);
        if (n >= 64 && n <= 4096) {
            st->vae_core = n;
        } else {
            *why = "VAE tile frames must be between 64 and 4096";
            ok   = false;
        }
    }
    yyjson_doc_free(doc);
    return ok;
}

static void refresh_loaded() {
    g_loaded_bytes.store(store_vram_bytes(g_pipeline.store));
    g_loaded_modules.store(store_gpu_module_count(g_pipeline.store));
}

// Runs on the worker thread, between jobs: nothing is held while it acts
static void settings_apply(const EngineSettings & next) {
    for (const auto & m : g_models) {
        if (m.first == next.model && g_pipeline.model_path != m.second) {
            fprintf(stderr, "[Server] Backbone now %s (%s)\n", m.first.c_str(), m.second.c_str());
            g_pipeline.model_path = m.second;
            g_model_path          = m.second;
            store_unload_idle(g_pipeline.store);
        }
    }
    store_set_policy(g_pipeline.store, next.keep_loaded ? EVICT_NEVER : EVICT_STRICT);
    g_pipeline.params.vae_core = next.vae_core;
    if (next.max_seq != g_pipeline.params.max_seq) {
        qw3lm_kv_free(&g_pipeline.kv);
        g_pipeline.params.max_seq       = next.max_seq;
        g_pipeline.kv.cfg.max_seq_len = next.max_seq > 0 ? next.max_seq : YUE2_CONTEXT;
        fprintf(stderr, "[Server] Context now %d rows\n", g_pipeline.kv.cfg.max_seq_len);
    }
    refresh_loaded();
    {
        std::lock_guard<std::mutex> lock(mtx_settings);
        g_settings = next;
    }
    if (!g_settings_path.empty()) {
        write_file(g_settings_path, settings_json(next));
    }
}

// HERESY 1167 (Viktor: «Models auto unload… ползунок от 15 минут до 4 часов… мгновенная выгрузка моделей (15 секунд
// grace)»): on the worker, between jobs: what has stayed in GPU memory through the idle time set in Engine leaves it, the
// cache with it, once per idle spell; the next song loads them again
static void idle_unload_check() {
    int64_t limit;
    {
        std::lock_guard<std::mutex> lock(mtx_settings);
        limit = g_settings.unload_at_once ? 15 : (int64_t) g_settings.unload_after_min * 60;
    }
    {
        std::lock_guard<std::mutex> lock(mtx_active);
        if (g_active_job) {
            return;
        }
    }
    int64_t idle = steady_seconds() - g_idle_since.load();
    if (g_idle_unloaded.load() || idle < limit) {
        return;
    }
    g_idle_unloaded.store(true);
    size_t held = store_vram_bytes(g_pipeline.store);
    if (held == 0) {
        return;
    }
    size_t freed = store_unload_idle(g_pipeline.store);
    qw3lm_kv_free(&g_pipeline.kv);
    refresh_loaded();
    fprintf(stderr, "[Server] Idle %lld s: the models left GPU memory (%.0f MB)\n", (long long) idle,
            (double) freed / (1024.0 * 1024.0));
}

static std::string hardware_json() {
    yyjson_mut_doc * doc  = yyjson_mut_doc_new(NULL);
    yyjson_mut_val * root = yyjson_mut_obj(doc);
    yyjson_mut_doc_set_root(doc, root);
    yyjson_mut_val * list = yyjson_mut_arr(doc);
    for (size_t i = 0; i < ggml_backend_dev_count(); i++) {
        ggml_backend_dev_t dev = ggml_backend_dev_get(i);
        if (ggml_backend_dev_type(dev) != GGML_BACKEND_DEVICE_TYPE_GPU) {
            continue;
        }
        size_t free_b = 0, total_b = 0;
        ggml_backend_dev_memory(dev, &free_b, &total_b);
        yyjson_mut_val * d = yyjson_mut_obj(doc);
        yyjson_mut_obj_add_strcpy(doc, d, "name", ggml_backend_dev_name(dev));
        yyjson_mut_obj_add_strcpy(doc, d, "description", ggml_backend_dev_description(dev));
        yyjson_mut_obj_add_uint(doc, d, "total_bytes", total_b);
        yyjson_mut_obj_add_uint(doc, d, "free_bytes", free_b);
        yyjson_mut_arr_append(list, d);
    }
    yyjson_mut_obj_add_val(doc, root, "gpus", list);
    yyjson_mut_obj_add_uint(doc, root, "loaded_bytes", g_loaded_bytes.load());
    yyjson_mut_obj_add_int(doc, root, "loaded_modules", g_loaded_modules.load());
    {
        std::lock_guard<std::mutex> lock(mtx_active);
        yyjson_mut_obj_add_bool(doc, root, "busy", g_active_job != nullptr);
    }
    char *      json = yyjson_mut_write(doc, 0, NULL);
    std::string out  = json ? json : "{}";
    if (json) {
        free(json);
    }
    yyjson_mut_doc_free(doc);
    return out;
}

// Queue a task behind any running job and wait briefly for it; true when it ran
static bool work_run_soon(std::function<void()> fn, int wait_ms) {
    auto done = std::make_shared<std::promise<void>>();
    auto fut  = done->get_future();
    work_push([fn, done] {
        fn();
        done->set_value();
    });
    return fut.wait_for(std::chrono::milliseconds(wait_ms)) == std::future_status::ready;
}

// ID3v2.4 tag with the title and the lyrics (UTF-8), for the shareable MP3 copies
// A take's title (meta.json, else its library name), for file tags and download names
static std::string take_title(const std::string & dir, const std::string & name) {
    std::string  title    = name;
    std::string  meta_txt = read_file(dir + "/meta.json");
    yyjson_doc * meta     = yyjson_read(meta_txt.c_str(), meta_txt.size(), 0);
    yyjson_val * v        = meta ? yyjson_obj_get(yyjson_doc_get_root(meta), "title") : nullptr;
    if (v && yyjson_is_str(v) && yyjson_get_len(v)) {
        title = yyjson_get_str(v);
    }
    if (meta) {
        yyjson_doc_free(meta);
    }
    return title;
}

// A take's title and lyrics (request.json), for file tags
static void take_title_lyrics(const std::string & dir, const std::string & name, std::string & title, std::string & lyrics) {
    title = take_title(dir, name);
    lyrics.clear();
    Yue2Request r;
    if (request_parse_json(&r, read_file(dir + "/request.json").c_str())) {
        lyrics = r.lyrics;
    }
}

// Local addition: saved copies are named after the song ("Last Train Home.wav"): the title without the
// characters Windows refuses in a file name, an ASCII fallback for old clients and the full name in UTF-8.
// by_title false (the page's "names=library") keeps the library name, with its date and time.
static std::string download_header(const char * how, const std::string & dir, const std::string & name, const char * ext,
                                   bool by_title) {
    std::string title = by_title ? take_title(dir, name) : name, safe;
    for (unsigned char c : title) {
        bool bad = c < 0x20 || c == 0x7f || strchr("\\/:*?\"<>|", c);
        if (bad || c == ' ') {
            if (!safe.empty() && safe.back() != ' ') {
                safe += ' ';
            }
        } else {
            safe += (char) c;
        }
    }
    while (!safe.empty() && (safe.back() == ' ' || safe.back() == '.')) {
        safe.pop_back();
    }
    if (safe.empty()) {
        safe = name;
    }
    safe += ext;
    std::string ascii, encoded;
    for (unsigned char c : safe) {
        ascii += c < 0x80 ? (char) c : '_';
        if ((c < 0x80 && isalnum(c)) || strchr("-._~", c)) {
            encoded += (char) c;
        } else {
            char hex[4];
            snprintf(hex, sizeof(hex), "%%%02X", c);
            encoded += hex;
        }
    }
    return std::string(how) + "; filename=\"" + ascii + "\"; filename*=UTF-8''" + encoded;
}

static std::string id3_synchsafe(size_t n) {
    std::string out(4, '\0');
    for (int i = 3; i >= 0; i--) {
        out[(size_t) i] = (char) (n & 0x7f);
        n >>= 7;
    }
    return out;
}

static std::string id3_frame(const char * id, const std::string & payload) {
    return std::string(id, 4) + id3_synchsafe(payload.size()) + std::string(2, '\0') + payload;
}

static std::string id3_tag(const std::string & title, const std::string & lyrics, const std::string & jpeg = "") {
    std::string frames = id3_frame("TIT2", std::string(1, '\x03') + title);
    if (!lyrics.empty()) {
        // encoding, language, empty content descriptor, text
        frames += id3_frame("USLT", std::string(1, '\x03') + "eng" + std::string(1, '\0') + lyrics);
    }
    if (!jpeg.empty()) {
        // HERESY 1120: the take's artwork as the front cover: encoding (Latin-1), MIME, picture type 3, empty description
        frames += id3_frame("APIC", std::string(1, '\0') + "image/jpeg" + std::string(1, '\0') + std::string(1, '\x03') +
                                    std::string(1, '\0') + jpeg);
    }
    return std::string("ID3\x04\x00\x00", 6) + id3_synchsafe(frames.size()) + frames;
}

static std::string job_status_json(const Job & job) {
    JobStatus        status = job.status.load();
    yyjson_mut_doc * doc    = yyjson_mut_doc_new(NULL);
    yyjson_mut_val * root   = yyjson_mut_obj(doc);
    yyjson_mut_doc_set_root(doc, root);
    yyjson_mut_obj_add_str(doc, root, "status",
                           status == JobStatus::RUNNING && !job.started.load() ? "queued" : job_status_str(status));
    if (job.lm_seed >= 0) {
        yyjson_mut_obj_add_sint(doc, root, "lm_seed", job.lm_seed);
        yyjson_mut_obj_add_sint(doc, root, "seed", job.seed);
    }
    if (status == JobStatus::DONE) {
        yyjson_mut_val * list = yyjson_mut_arr(doc);
        for (const auto & t : job.takes) {
            yyjson_mut_arr_add_strcpy(doc, list, t.c_str());
        }
        yyjson_mut_obj_add_val(doc, root, "takes", list);
        if (!job.abc.empty()) {
            yyjson_mut_obj_add_strncpy(doc, root, "abc", job.abc.c_str(), job.abc.size());
        }
    }
    if (status == JobStatus::FAILED && !job.error.empty()) {
        yyjson_mut_obj_add_strncpy(doc, root, "error", job.error.c_str(), job.error.size());
        if (!job.abc.empty()) {
            yyjson_mut_obj_add_strncpy(doc, root, "abc", job.abc.c_str(), job.abc.size());
        }
    }
    char *      json = yyjson_mut_write(doc, 0, NULL);
    std::string out  = json ? json : "{}";
    if (json) {
        free(json);
    }
    yyjson_mut_doc_free(doc);
    return out;
}

static void on_signal(int) {
    active_job_cancel();
    if (g_svr) {
        g_svr->stop();
    }
}

static std::string json_string(const char * key, const std::string & value) {
    yyjson_mut_doc * doc  = yyjson_mut_doc_new(NULL);
    yyjson_mut_val * root = yyjson_mut_obj(doc);
    yyjson_mut_doc_set_root(doc, root);
    yyjson_mut_obj_add_strncpy(doc, root, key, value.c_str(), value.size());
    char *      json = yyjson_mut_write(doc, 0, NULL);
    std::string out  = json ? json : "{}";
    if (json) {
        free(json);
    }
    yyjson_mut_doc_free(doc);
    return out;
}

static void handle_props(const httplib::Request &, httplib::Response & res) {
    Yue2Request d;
    request_init(&d);

    yyjson_mut_doc * doc  = yyjson_mut_doc_new(NULL);
    yyjson_mut_val * root = yyjson_mut_obj(doc);
    yyjson_mut_doc_set_root(doc, root);
    yyjson_mut_obj_add_str(doc, root, "version", YUE2_VERSION);
    yyjson_mut_obj_add_strncpy(doc, root, "model", g_model_path.c_str(), g_model_path.size());
    yyjson_mut_obj_add_strncpy(doc, root, "vae", g_vae_path.c_str(), g_vae_path.size());
    yyjson_mut_obj_add_int(doc, root, "sample_rate", YUE2_SAMPLE_RATE);
    yyjson_mut_obj_add_int(doc, root, "frame_rate", YUE2_FRAME_RATE);
    yyjson_mut_obj_add_int(doc, root, "context", YUE2_CONTEXT);

    // Local additions: decoders, sliders, batch limit, optional features
    yyjson_mut_val * vaes = yyjson_mut_arr(doc);
    for (const auto & v : g_vaes) {
        yyjson_mut_val * item = yyjson_mut_obj(doc);
        yyjson_mut_obj_add_strcpy(doc, item, "name", v.first.c_str());
        yyjson_mut_obj_add_strcpy(doc, item, "label", vae_label(v.first));
        yyjson_mut_obj_add_strcpy(doc, item, "repo", vae_repo(v.first));
        yyjson_mut_arr_append(vaes, item);
    }
    yyjson_mut_obj_add_val(doc, root, "vaes", vaes);
    yyjson_mut_obj_add_strcpy(doc, root, "default_vae", g_vaes.empty() ? "" : g_vaes[0].first.c_str());
    yyjson_mut_val * sliders = yyjson_mut_arr(doc);
    for (const auto & s : g_sliders) {
        yyjson_mut_val * item = yyjson_mut_obj(doc);
        yyjson_mut_obj_add_strcpy(doc, item, "id", s.id.c_str());
        yyjson_mut_obj_add_strcpy(doc, item, "label", s.label.c_str());
        yyjson_mut_obj_add_strcpy(doc, item, "description", s.description.c_str());
        yyjson_mut_arr_append(sliders, item);
    }
    yyjson_mut_obj_add_val(doc, root, "sliders", sliders);
    yyjson_mut_obj_add_val(doc, root, "loras", lora_catalog_json(doc));
    // <loras>/sources.json: where each LoRA and VAE came from and what it does,
    // passed through for the page ({} when there is none)
    yyjson_doc * sources = g_pipeline.lora_dir.empty() ? nullptr
        : yyjson_read_file((g_pipeline.lora_dir + "/sources.json").c_str(), 0, nullptr, nullptr);
    if (sources && yyjson_is_obj(yyjson_doc_get_root(sources))) {
        yyjson_mut_obj_add_val(doc, root, "sources", yyjson_val_mut_copy(doc, yyjson_doc_get_root(sources)));
    } else {
        yyjson_mut_obj_add_val(doc, root, "sources", yyjson_mut_obj(doc));
    }
    yyjson_doc_free(sources);
    yyjson_mut_obj_add_int(doc, root, "max_batch", g_pipeline.params.max_batch);
    yyjson_mut_obj_add_bool(doc, root, "transcriber", !g_transcriber_path.empty());
    yyjson_mut_obj_add_bool(doc, root, "outputs", !g_outputs_dir.empty());

    // The defaults are the request schema itself, serialized by the request
    // writer and grafted here: one source of truth, one float formatting
    std::string  def_json = request_to_json(&d, false);
    yyjson_doc * def_doc  = yyjson_read(def_json.c_str(), def_json.size(), 0);
    if (def_doc) {
        yyjson_mut_obj_add_val(doc, root, "defaults", yyjson_val_mut_copy(doc, yyjson_doc_get_root(def_doc)));
        yyjson_doc_free(def_doc);
    }

    char * json = yyjson_mut_write(doc, 0, NULL);
    res.set_content(json ? json : "{}", "application/json");
    if (json) {
        free(json);
    }
    yyjson_mut_doc_free(doc);
}

// Validates what the pipeline would refuse anyway, so a bad request fails
// fast with a 400 instead of occupying the worker
static bool validate(const httplib::Request & req, httplib::Response & res, Yue2Request * r) {
    if (!request_parse_json(r, req.body.c_str())) {
        res.status = 400;
        res.set_content(json_string("error", "invalid JSON"), "application/json");
        return false;
    }
    Yue2Cot cot;
    if (!yue2_cot_parse(r->cot, &cot)) {
        res.status = 400;
        res.set_content(json_string("error", "cot must be full, melody or off"), "application/json");
        return false;
    }
    bool      is_mp3  = false;
    WavFormat wav_fmt = WAV_S16;
    if (!audio_parse_format(r->output_format.c_str(), is_mp3, wav_fmt)) {
        res.status = 400;
        res.set_content(json_string("error", "unknown output format"), "application/json");
        return false;
    }
    // HERESY 1004: only the solvers nar_solve knows; anything else would silently run midpoint
    if (r->solver != "midpoint" && r->solver != "euler" && r->solver != "heun" && r->solver != "multistep") {
        res.status = 400;
        res.set_content(json_string("error", "solver must be midpoint, euler, heun or multistep"), "application/json");
        return false;
    }
    // HERESY 1003: a ceiling of 160. Before it only "at least 1" was checked, so a slip
    // of the finger (1600) meant an hour of flow matching for nothing.
    if (r->steps < 1 || r->steps > 160) {
        res.status = 400;
        res.set_content(json_string("error", "steps must be between 1 and 160"), "application/json");
        return false;
    }
    if (r->lm_batch_size < 1 || r->lm_batch_size > g_pipeline.params.max_batch) {
        res.status = 400;
        res.set_content(json_string("error", "lm_batch_size exceeds --max-batch"), "application/json");
        return false;
    }
    if (r->synth_batch_size < 1 || r->synth_batch_size > 9) {
        res.status = 400;
        res.set_content(json_string("error", "synth_batch_size must be between 1 and 9"), "application/json");
        return false;
    }
    if (!yue2_sampling_valid(r->abc_sampling, "abc") || !yue2_sampling_valid(r->semantic_sampling, "semantic")) {
        res.status = 400;
        res.set_content(json_string("error", "sampling preset outside the protocol bounds"), "application/json");
        return false;
    }
    // Local additions: decoder, sliders, plan_only
    auto fail = [&](const char * msg) {
        res.status = 400;
        res.set_content(json_string("error", msg), "application/json");
        return false;
    };
    if (!r->vae.empty()) {
        bool known = false;
        for (const auto & v : g_vaes) {
            known = known || v.first == r->vae;
        }
        if (!known) {
            return fail("unknown decoder (see /props vaes)");
        }
    }
    if (!r->decode_from.empty()) {   // HERESY 1168: a take of the library that kept its latents
        const std::string & n = r->decode_from;
        if (n == "." || n == ".." || n.find('/') != std::string::npos || n.find('\\') != std::string::npos ||
            g_outputs_dir.empty() || !std::filesystem::is_regular_file(g_outputs_dir + "/" + n + "/latents.f32")) {
            return fail("this take keeps no latents (made before HERESY 1168): its sound has to be rendered again");
        }
    }
    for (size_t i = 0; i < r->sliders.size(); i++) {
        const Yue2SliderChoice & c = r->sliders[i];
        if (pipeline_slider_path(&g_pipeline, c.id).empty()) {
            return fail("unknown slider (see /props sliders)");
        }
        if (!(c.strength >= 0.0f && c.strength <= 1.0f)) {
            return fail("slider strength must be between 0 and 1");
        }
        for (size_t j = 0; j < i; j++) {
            if (r->sliders[j].id == c.id) {
                return fail("a slider is listed twice");
            }
        }
    }
    if (!r->loras.empty()) {
        // Local addition: installed LoRAs, each once, strengths 0..2; a half the file
        // lacks is set to 0, and a LoRA with both at 0 is dropped
        if (g_pipeline.lora_dir.empty()) {
            return fail("this server has no LoRA folder (--loras)");
        }
        std::map<std::string, LoraInfo> known;
        for (const LoraInfo & l : lora_catalog(g_pipeline.lora_dir)) {
            known[l.id] = l;
        }
        std::vector<Yue2LoraChoice> kept;
        for (Yue2LoraChoice c : r->loras) {
            auto it = known.find(c.id);
            if (it == known.end()) {
                return fail("unknown LoRA (see /props loras)");
            }
            if (!it->second.error.empty()) {
                std::string msg = "the LoRA " + it->second.name + " cannot load: " + it->second.error;
                return fail(msg.c_str());
            }
            if (!(c.ar >= 0.0f && c.ar <= 2.0f && c.nar >= 0.0f && c.nar <= 2.0f)) {
                return fail("LoRA strengths go from 0 to 2");
            }
            for (const auto & k : kept) {
                if (k.id == c.id) {
                    return fail("a LoRA is listed twice");
                }
            }
            c.ar  = it->second.ar ? c.ar : 0.0f;
            c.nar = it->second.nar ? c.nar : 0.0f;
            if (c.ar != 0.0f || c.nar != 0.0f) {
                kept.push_back(c);
            }
        }
        r->loras = kept;
    }
    if (r->plan_only && (cot == YUE2_COT_OFF || !r->abc.empty() || !r->semantic_tokens.empty())) {
        return fail("plan_only needs full or melody mode, no supplied score and no semantic stream");
    }
    request_resolve_seed(r);
    return true;
}

// Transcribe worker: the uploaded recording becomes an ABC score, the chord
// symbols dropped when only the melody is wanted.
static void run_transcribe(std::shared_ptr<Job> job, std::vector<float> audio, bool melody_only) {
    job->started.store(true);
    active_job_set(job);
    fprintf(stderr, "[Server] Transcribe job %s: %.1f s of audio, %s\n", job->id.c_str(),
            (double) audio.size() / SS2_SAMPLE_RATE, melody_only ? "melody only" : "full score");
    std::string abc, error;
    bool        ok = pipeline_transcribe(&g_pipeline, audio.data(), (int) audio.size(), melody_only, &abc, &error);
    active_job_set(nullptr);
    if (!ok) {
        fprintf(stderr, "[Server] Transcribe job %s failed: %s\n", job->id.c_str(), error.c_str());
        job->status.store(job->cancel.load() ? JobStatus::CANCELLED : JobStatus::FAILED);
        return;
    }
    job->result_body = json_string("abc", abc);
    job->result_mime = "application/json";
    job->status.store(JobStatus::DONE);
}

static void refresh_loaded();

// HERESY 1168: another decoder for a take: its kept latents through the VAE alone, saved as a new take of its family (the
// request as the page sent it, the take's own replay with its vae changed; it keeps the latents too, for the next one)
static void decode_job(std::shared_ptr<Job> job, const Yue2Request & request) {
    Yue2Song    song      = {};
    std::string from      = request.decode_from;
    auto        started   = std::chrono::steady_clock::now();
    song.truncated        = false;
    if (!latents_load(g_outputs_dir + "/" + from, &song)) {
        active_job_set(nullptr);
        job->error = "this take keeps no latents (made before HERESY 1168): its sound has to be rendered again";
        job->status.store(JobStatus::FAILED);
        return;
    }
    bool   ok             = pipeline_decode_latents(&g_pipeline, request.vae, &song, server_cancel_job, (void *) &job->cancel);
    double render_seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    if (!ok) {
        active_job_set(nullptr);
        job->error = g_pipeline.last_error.empty() ? "the decoding failed; the server log has the reason" : g_pipeline.last_error;
        job->status.store(job->cancel.load() ? JobStatus::CANCELLED : JobStatus::FAILED);
        return;
    }
    fprintf(stderr, "[Server] Job %s: %s decoded again in %.1f s (%d frames)\n", job->id.c_str(), from.c_str(), render_seconds, song.T_lat);
    bool      is_mp3  = false;
    WavFormat wav_fmt = WAV_S16;
    audio_parse_format(request.output_format.c_str(), is_mp3, wav_fmt);
    if (is_mp3 || wav_fmt != WAV_F32) {
        audio_normalize(song.audio.data(), song.T_audio * 2, request.peak_clip);
    }
    std::string audio = is_mp3 ? audio_encode_mp3(song.audio.data(), song.T_audio, YUE2_SAMPLE_RATE, request.mp3_bitrate) :
                                 audio_encode_wav(song.audio.data(), song.T_audio, YUE2_SAMPLE_RATE, wav_fmt);
    if (audio.empty()) {
        active_job_set(nullptr);
        job->status.store(JobStatus::FAILED);
        return;
    }
    Yue2Request replay      = request;
    replay.decode_from      = "";
    replay.lm_batch_size    = 1;
    replay.synth_batch_size = 1;
    if (replay.parent.empty()) {
        replay.parent = from;
    }
    std::vector<std::string> request_parts = { request_to_json(&replay) };
    std::vector<std::string> audio_parts   = { audio };
    if (!g_outputs_dir.empty()) {
        std::string name = library_save(replay, audio, is_mp3, song, 0, 1, 0, 0, !request.abc.empty(), render_seconds);
        if (!name.empty()) {
            job->takes.push_back(name);
            latents_save(g_outputs_dir + "/" + name, song);
        }
    }
    active_job_set(nullptr);
    job->result_body = multipart_build_tracks(request_parts, audio_parts, is_mp3 ? "audio/mpeg" : "audio/wav");
    job->result_mime = MULTIPART_MIME;
    job->status.store(JobStatus::DONE);
}

static void run_job(std::shared_ptr<Job> job, Yue2Request request) {
    struct Refresh {
        ~Refresh() { refresh_loaded(); }
    } refresh_after;
    job->started.store(true);
    active_job_set(job);
    fprintf(stderr, "[Server] Job %s: %s\n", job->id.c_str(), request_to_json(&request).c_str());
    if (!request.decode_from.empty()) {   // HERESY 1168: a take's kept latents, another decoder
        decode_job(job, request);
        return;
    }

    std::vector<Yue2Song> songs;
    auto                  started = std::chrono::steady_clock::now();
    bool ok = pipeline_generate(&g_pipeline, request, &songs, server_cancel_job, (void *) &job->cancel);
    double render_seconds =
        std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();

    if (!ok) {
        active_job_set(nullptr);
        job->error = g_pipeline.last_error.empty() ? "generation failed; the server log has the reason" : g_pipeline.last_error;
        job->abc   = g_pipeline.broken_score;      // HERESY 1087: what the AR wrote, for the page to show
        job->status.store(job->cancel.load() ? JobStatus::CANCELLED : JobStatus::FAILED);
        return;
    }

    // Local addition: a plan_only job returns the score alone
    if (request.plan_only) {
        active_job_set(nullptr);
        job->abc         = songs.empty() ? "" : songs[0].score;
        job->result_body = json_string("abc", job->abc);
        job->result_mime = "application/json";
        job->status.store(JobStatus::DONE);
        return;
    }

    bool      is_mp3  = false;
    WavFormat wav_fmt = WAV_S16;
    audio_parse_format(request.output_format.c_str(), is_mp3, wav_fmt);

    // One part pair per track, song-major. The replay request of a track
    // carries its semantic stream, its score and the seeds it consumed, so a
    // resubmit reproduces it without the autoregression.
    const int                M = request.synth_batch_size;
    std::vector<std::string> audio_parts;
    std::vector<std::string> request_parts;
    for (size_t t = 0; t < songs.size(); t++) {
        Yue2Song & song = songs[t];
        // Normalization belongs to the output stage, WAV32 keeping the full range
        if (is_mp3 || wav_fmt != WAV_F32) {
            audio_normalize(song.audio.data(), song.T_audio * 2, request.peak_clip);
        }
        audio_parts.push_back(
            is_mp3 ? audio_encode_mp3(song.audio.data(), song.T_audio, YUE2_SAMPLE_RATE, request.mp3_bitrate) :
                     audio_encode_wav(song.audio.data(), song.T_audio, YUE2_SAMPLE_RATE, wav_fmt));
        if (audio_parts.back().empty()) {
            active_job_set(nullptr);
            job->status.store(JobStatus::FAILED);
            return;
        }
        Yue2Request replay = request_replay(request, song.score.empty() ? request.abc : song.score,
                                            pipeline_format_tokens(song.tokens), (int) t / M, (int) t % M);
        request_parts.push_back(request_to_json(&replay));
        // Local addition: every track lands in the library as it is encoded
        if (!g_outputs_dir.empty()) {
            std::string name = library_save(replay, audio_parts.back(), is_mp3, song, (int) t, (int) songs.size(),
                                            (int) t / M, (int) t % M, !request.abc.empty(), render_seconds);
            if (!name.empty()) {
                job->takes.push_back(name);
                latents_save(g_outputs_dir + "/" + name, song);   // HERESY 1168: for another decoder, in seconds
            }
        }
    }

    active_job_set(nullptr);
    job->result_body = multipart_build_tracks(request_parts, audio_parts, is_mp3 ? "audio/mpeg" : "audio/wav");
    job->result_mime = MULTIPART_MIME;
    job->status.store(JobStatus::DONE);
}

static void print_usage(const char * prog) {
    fprintf(stderr, "yue2.cpp %s\n\n", YUE2_VERSION);
    fprintf(stderr,
            "Usage: %s --model <gguf> --vae <gguf> [options]\n"
            "\n"
            "Required:\n"
            "  --model <gguf>         Backbone GGUF\n"
            "  --vae <gguf>           VAE GGUF\n"
            "\n"
            "Optional:\n"
            "  --transcriber <gguf>   SheetSage2 GGUF, enables /transcribe\n"
            "  --vae <name>=<gguf>    Another named decoder, selectable per request (repeatable)\n"
            "  --sliders <dir>        Slider GGUFs + catalog.json (voice and genre sliders)\n"
            "  --loras <dir>          LoRA .safetensors files or folders (links are followed)\n"
            "  --outputs <dir>        Save every track into this song library\n"
            "  --settings <json>      Engine settings the console can change (model, keep loaded, context, VAE tiles)\n"
            "  --host <addr>          Listen address (default: 0.0.0.0)\n"
            "  --port <N>             Listen port (default: 8087)\n"
            "  --max-batch <N>        Song batch limit, one KV set each (default: 1)\n"
            "  --keep-loaded          Keep every model resident in VRAM (default: evict between stages)\n"
            "  --fp16-matmul          BF16 prefills and flow matching on FP16 tensor cores (RTX 20, Volta)\n"
            "\n"
            "Debug:\n"
            "  --max-seq <N>          KV cache size (default: model context)\n"
            "  --vae-core <N>         VAE tile core frames (default: 512)\n"
            "  --vae-halo <N>         VAE tile halo frames (default: 16)\n"
            "  --no-fa                Disable flash attention\n"
            "  --clamp-fp16           Clamp hidden states to FP16 range\n",
            prog);
}

int main(int argc, char ** argv) {
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }

    const char *       host = "0.0.0.0";
    int                port = 8087;
    Yue2PipelineParams params;

    for (int i = 1; i < argc; i++) {
        bool last = i + 1 >= argc;
        if (!strcmp(argv[i], "--model") && !last) {
            // Local addition: NAME=PATH repeatable, a bare path is named after its quant
            std::string arg = argv[++i];
            size_t      eq  = arg.find('=');
            std::string name, path;
            if (eq != std::string::npos && arg.find('/') > eq) {
                name = arg.substr(0, eq);
                path = arg.substr(eq + 1);
            } else {
                path = arg;
                name = model_name_of(path);
            }
            g_models.push_back({ name, path });
            if (g_model_path.empty()) {
                g_model_path = path;
            }
        } else if (!strcmp(argv[i], "--settings") && !last) {
            g_settings_path = argv[++i];
        } else if (!strcmp(argv[i], "--vae") && !last) {
            std::string arg = argv[++i];
            size_t      eq  = arg.find('=');
            std::string name, path;
            if (eq != std::string::npos && arg.find('/') > eq) {
                name = arg.substr(0, eq);
                path = arg.substr(eq + 1);
            } else {
                name = "standard";
                path = arg;
            }
            g_vaes.push_back({ name, path });
            if (g_vae_path.empty()) {
                g_vae_path = path;
            }
        } else if (!strcmp(argv[i], "--sliders") && !last) {
            g_pipeline.slider_files.clear();
            g_sliders.clear();
            std::string dir = argv[++i];
            if (!load_slider_catalog(dir)) {
                return 1;
            }
        } else if (!strcmp(argv[i], "--loras") && !last) {
            g_pipeline.lora_dir = argv[++i];
            fprintf(stderr, "[Server] LoRAs: %zu from %s\n", lora_catalog(g_pipeline.lora_dir).size(),
                    g_pipeline.lora_dir.c_str());
        } else if (!strcmp(argv[i], "--outputs") && !last) {
            g_outputs_dir = argv[++i];
        } else if (!strcmp(argv[i], "--transcriber") && !last) {
            g_transcriber_path = argv[++i];
        } else if (!strcmp(argv[i], "--host") && !last) {
            host = argv[++i];
        } else if (!strcmp(argv[i], "--port") && !last) {
            port = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--keep-loaded")) {
            g_keep_loaded = true;
        } else if (!strcmp(argv[i], "--max-batch") && !last) {
            params.max_batch = atoi(argv[++i]);
            if (params.max_batch < 1) {
                params.max_batch = 1;
            }
        } else if (!strcmp(argv[i], "--max-seq") && !last) {
            params.max_seq = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--vae-core") && !last) {
            params.vae_core = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--vae-halo") && !last) {
            params.vae_halo = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--no-fa")) {
            params.no_fa = true;
        } else if (!strcmp(argv[i], "--clamp-fp16")) {
            params.clamp_fp16 = true;
        } else if (!strcmp(argv[i], "--fp16-matmul")) {  // Local addition
            params.fp16_matmul = true;
        } else {
            print_usage(argv[0]);
            return 1;
        }
    }

    if (g_model_path.empty() || g_vae_path.empty()) {
        print_usage(argv[0]);
        return 1;
    }

    LogCapture log_capture;

    // Local addition: engine settings, from --settings over the boot flags
    g_settings = { g_models.empty() ? "" : g_models[0].first, g_keep_loaded, params.max_seq, params.vae_core, 60, false };
    if (!g_settings_path.empty() && std::filesystem::is_regular_file(g_settings_path)) {
        std::string why;
        if (!settings_parse(read_file(g_settings_path), &g_settings, &why)) {
            fprintf(stderr, "[Server] Settings %s: %s, keeping the valid values\n", g_settings_path.c_str(), why.c_str());
        }
        for (const auto & m : g_models) {
            if (m.first == g_settings.model) {
                g_model_path = m.second;
            }
        }
        g_keep_loaded   = g_settings.keep_loaded;
        params.max_seq  = g_settings.max_seq;
        params.vae_core = g_settings.vae_core;
        fprintf(stderr, "[Server] Settings: model %s, keep loaded %s, context %d, VAE tiles %d, idle unload %s\n",
                g_settings.model.c_str(), g_keep_loaded ? "yes" : "no", params.max_seq, params.vae_core,
                g_settings.unload_at_once ? "at once (15 s)" : (std::to_string(g_settings.unload_after_min) + " min").c_str());
    }

    // Model loads go through the store: STRICT by default (one half of the
    // backbone resident at a time, the cache staying between them), NEVER
    // with --keep-loaded (everything accumulates)
    g_pipeline.store            = store_create(g_keep_loaded ? EVICT_NEVER : EVICT_STRICT);
    g_pipeline.transcriber_path = g_transcriber_path;
    g_pipeline.vaes             = g_vaes;
    for (const auto & v : g_vaes) {
        fprintf(stderr, "[Server] Decoder %s: %s\n", v.first.c_str(), v.second.c_str());
    }
    if (!g_outputs_dir.empty()) {
        std::error_code ec;
        std::filesystem::create_directories(g_outputs_dir, ec);
        fprintf(stderr, "[Server] Library: %s\n", g_outputs_dir.c_str());
    }
    if (!pipeline_configure(&g_pipeline, g_model_path.c_str(), g_vae_path.c_str(), params)) {
        store_free(g_pipeline.store);
        return 1;
    }

    std::thread worker(worker_main);

    httplib::Server svr;
    // HERESY 1021: big answers (a stem, a spectrum, a WAV) over a phone line: a socket that stalls a few
    // seconds behind another transfer is not a dead one. The default write timeout was 5 s.
    svr.set_write_timeout(60, 0);
    // HERESY 1023: a track imported from a phone line arrives slowly, and can be large
    svr.set_read_timeout(120, 0);
    svr.set_payload_max_length((size_t) 1024 * 1024 * 1024);
    g_svr = &svr;
    // HERESY 1114: this machine and private networks only, unless RUACH_ALLOW_PUBLIC=1
    static const bool allow_public = [] { const char * e = getenv("RUACH_ALLOW_PUBLIC"); return e && *e && strcmp(e, "0") != 0; }();
    svr.set_pre_routing_handler([](const httplib::Request & req, httplib::Response & res) {
        if (allow_public || is_private_addr(req.remote_addr)) return httplib::Server::HandlerResponse::Unhandled;
        res.status = 403;
        res.set_content(json_string("error", "Ruach Studio answers this machine and private networks only (RUACH_ALLOW_PUBLIC=1 opens it)"),
                        "application/json");
        return httplib::Server::HandlerResponse::Handled;
    });

    // SO_REUSEADDR lets us rebind a port still in TIME_WAIT after a restart.
    // SO_REUSEPORT is deliberately not set: a second instance on the same port
    // then fails with EADDRINUSE instead of silently sharing the socket and
    // splitting traffic between two daemons.
    svr.set_socket_options([](socket_t sock) {
        int one = 1;
#ifdef _WIN32
        setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, (const char *) &one, sizeof(one));
#else
        setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
#endif
    });

    signal(SIGINT, on_signal);
    signal(SIGTERM, on_signal);

    svr.Get("/health", [](const httplib::Request &, httplib::Response & res) {
        res.set_content(json_string("status", "ok"), "application/json");
    });

    svr.Get("/props", handle_props);

    // HERESY 1011: the page reaches heresy-lab (the Python neighbour on this machine,
    // lab/lab.py) through this server, at the same origin: no second port to open, no
    // CORS. GET /lab/<path>?<query> goes to 127.0.0.1:LAB_PORT/<path>?<query> as it is.
    // HERESY 1023: POST /lab/… carries a body (an imported track, lyrics) to heresy-lab as it is
    svr.Post(R"(/lab/(.*))", [](const httplib::Request & req, httplib::Response & res) {
        const char *    env  = getenv("LAB_PORT");
        int             port = env && *env ? atoi(env) : 41870;
        httplib::Client lab("127.0.0.1", port);
        lab.set_connection_timeout(3, 0);
        lab.set_read_timeout(900, 0);
        lab.set_write_timeout(120, 0);
        std::string path = "/" + std::string(req.matches[1]), query;
        for (const auto & p : req.params) {
            query += (query.empty() ? "?" : "&") + httplib::encode_uri_component(p.first) + "=" +
                     httplib::encode_uri_component(p.second);
        }
        auto r = lab.Post(path + query, req.body, req.get_header_value("Content-Type", "application/octet-stream").c_str());
        if (!r) {
            res.status = 502;
            res.set_content(json_string("error", "heresy-lab is not running on this machine (lab/start-lab.sh)"),
                            "application/json");
            return;
        }
        res.status = r->status;
        res.set_content(r->body, r->get_header_value("Content-Type", "application/json").c_str());
    });

    svr.Get(R"(/lab/(.*))", [](const httplib::Request & req, httplib::Response & res) {
        const char *   env  = getenv("LAB_PORT");
        int            port = env && *env ? atoi(env) : 41870;
        httplib::Client lab("127.0.0.1", port);
        lab.set_connection_timeout(3, 0);
        lab.set_read_timeout(1800, 0);   // Whisper on a long song, and a queue before it
        // HERESY 1090: a trained adapter (100 MB and more) comes through whole; httplib stops at 100 MB by default
        lab.set_payload_max_length((size_t) 2048 * 1024 * 1024);
        std::string path = "/" + std::string(req.matches[1]);
        std::string query;
        for (const auto & p : req.params) {
            query += (query.empty() ? "?" : "&") + httplib::encode_uri_component(p.first) + "=" +
                     httplib::encode_uri_component(p.second);
        }
        // HERESY 1021: a Range goes through and comes back, so the page's players can seek a stem
        httplib::Headers fwd;
        if (req.has_header("Range")) {
            fwd.emplace("Range", req.get_header_value("Range"));
        }
        auto r = lab.Get(path + query, fwd);
        if (!r) {
            res.status = 502;
            res.set_content(json_string("error", "heresy-lab is not running on this machine (lab/start-lab.sh)"),
                            "application/json");
            return;
        }
        res.status = r->status;
        for (const char * h : { "Content-Range", "Accept-Ranges", "Content-Disposition" }) {
            if (r->has_header(h)) {
                res.set_header(h, r->get_header_value(h));
            }
        }
        res.set_content(r->body, r->get_header_value("Content-Type", "application/json").c_str());
    });

    // HERESY 1116: the studio's API (lab/api.py): /api/… goes to the lab's /api/… as it is, GET and POST, so a script, a
    // DAW or an agent on this machine or this network talks to one address, the page's own
    {
        auto lab_client = [] {
            const char *    env  = getenv("LAB_PORT");
            httplib::Client c("127.0.0.1", env && *env ? atoi(env) : 41870);
            c.set_connection_timeout(3, 0);
            c.set_read_timeout(1800, 0);
            c.set_write_timeout(120, 0);
            c.set_payload_max_length((size_t) 2048 * 1024 * 1024);
            return c;
        };
        auto query_of = [](const httplib::Request & req) {
            std::string q;
            for (const auto & p : req.params) {
                q += (q.empty() ? "?" : "&") + httplib::encode_uri_component(p.first) + "=" + httplib::encode_uri_component(p.second);
            }
            return q;
        };
        auto answer = [](httplib::Result & r, httplib::Response & res) {
            if (!r) {
                res.status = 502;
                res.set_content(json_string("error", "heresy-lab is not running on this machine"), "application/json");
                return;
            }
            res.status = r->status;
            for (const char * h : { "Content-Range", "Accept-Ranges", "Content-Disposition", "Location" }) {
                if (r->has_header(h)) res.set_header(h, r->get_header_value(h));
            }
            res.set_content(r->body, r->get_header_value("Content-Type", "application/json").c_str());
        };
        svr.Get(R"(/api/(.*))", [lab_client, query_of, answer](const httplib::Request & req, httplib::Response & res) {
            auto            c = lab_client();
            httplib::Headers fwd;
            if (req.has_header("Range")) fwd.emplace("Range", req.get_header_value("Range"));
            if (req.has_header("Authorization")) fwd.emplace("Authorization", req.get_header_value("Authorization"));
            fwd.emplace("X-Remote-Addr", req.remote_addr);
            auto r = c.Get("/api/" + std::string(req.matches[1]) + query_of(req), fwd);
            answer(r, res);
        });
        svr.Post(R"(/api/(.*))", [lab_client, query_of, answer](const httplib::Request & req, httplib::Response & res) {
            auto             c = lab_client();
            httplib::Headers fwd;
            if (req.has_header("Authorization")) fwd.emplace("Authorization", req.get_header_value("Authorization"));
            fwd.emplace("X-Remote-Addr", req.remote_addr);
            auto r = c.Post("/api/" + std::string(req.matches[1]) + query_of(req), fwd, req.body,
                            req.get_header_value("Content-Type", "application/json").c_str());
            answer(r, res);
        });
    }

    svr.Get("/logs", handle_logs);

    svr.Post("/synth", [](const httplib::Request & req, httplib::Response & res) {
        Yue2Request request;
        if (!validate(req, res, &request)) {
            return;
        }
        auto job     = job_create();
        job->lm_seed = request.lm_seed;
        job->seed    = request.seed;
        work_push([job, request] { run_job(job, request); });
        res.set_content(json_string("id", job->id), "application/json");
    });

    // POST /transcribe, multipart/form-data: an "audio" part (WAV or MP3)
    // and an optional "melody_only" field that drops the chord symbols. The
    // route is served when a transcriber is given.
    if (!g_transcriber_path.empty()) {
        svr.Post("/transcribe", [](const httplib::Request & req, httplib::Response & res) {
            // HERESY 1036: ?take=NAME transcribes a take of the library from its own audio.wav, so
            // the page need not send a song the server already holds (120 MB for seven minutes)
            std::string from_take;
            if (req.has_param("take")) {
                std::string name = req.get_param_value("take");
                if (g_outputs_dir.empty() || name.empty() || name.find('/') != std::string::npos || name.find("..") != std::string::npos) {
                    res.status = 400;
                    res.set_content(json_string("error", "bad take name"), "application/json");
                    return;
                }
                std::ifstream in(g_outputs_dir + "/" + name + "/audio.wav", std::ios::binary);
                if (!in) {
                    res.status = 404;
                    res.set_content(json_string("error", "this take has no audio.wav"), "application/json");
                    return;
                }
                from_take.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
            } else if (!req.is_multipart_form_data() || !req.form.has_file("audio")) {
                res.status = 400;
                res.set_content(json_string("error", "multipart audio part required"), "application/json");
                return;
            }
            bool                melody_only = req.has_param("melody_only") || (req.is_multipart_form_data() && req.form.has_field("melody_only"));
            const std::string & file        = from_take.empty() ? req.form.get_file("audio").content : from_take;
            int                 T = 0, sr = 0;
            float *             planar = audio_read_buf((const uint8_t *) file.data(), file.size(), &T, &sr);
            std::vector<float>  audio;
            if (!planar || !ss2_mono_24k(planar, T, sr, &audio)) {
                res.status = 400;
                res.set_content(json_string("error", "cannot decode audio"), "application/json");
                return;
            }
            auto job = job_create();
            work_push([job, audio, melody_only] { run_transcribe(job, audio, melody_only); });
            res.set_content(json_string("id", job->id), "application/json");
        });
    }

    svr.Get("/job", [](const httplib::Request & req, httplib::Response & res) {
        auto job = job_find(req.get_param_value("id"));
        if (!job) {
            res.status = 404;
            res.set_content(json_string("error", "job not found"), "application/json");
            return;
        }
        JobStatus status = job->status.load();
        if (!req.has_param("result")) {
            res.set_content(job_status_json(*job), "application/json");
            return;
        }
        if (status != JobStatus::DONE) {
            res.status = 404;
            res.set_content(json_string("error", "result not ready"), "application/json");
            return;
        }
        res.set_content(job->result_body, job->result_mime.c_str());
    });

    svr.Post("/job", [](const httplib::Request & req, httplib::Response & res) {
        auto job = job_find(req.get_param_value("id"));
        if (!job) {
            res.status = 404;
            res.set_content(json_string("error", "job not found"), "application/json");
            return;
        }
        if (req.has_param("cancel")) {
            job->cancel.store(true);
            fprintf(stderr, "[Server] Cancel requested for job %s\n", job->id.c_str());
        }
        res.set_content(json_string("status", job_status_str(job->status.load())), "application/json");
    });

    // Local additions: engine settings, unload, hardware
    svr.Get("/settings", [](const httplib::Request &, httplib::Response & res) {
        std::lock_guard<std::mutex> lock(mtx_settings);
        res.set_content(settings_json(g_settings), "application/json");
    });
    svr.Post("/settings", [](const httplib::Request & req, httplib::Response & res) {
        EngineSettings next;
        {
            std::lock_guard<std::mutex> lock(mtx_settings);
            next = g_settings;
        }
        std::string why;
        if (!settings_parse(req.body, &next, &why)) {
            res.status = 400;
            res.set_content(json_string("error", why), "application/json");
            return;
        }
        bool applied = work_run_soon([next] { settings_apply(next); }, 3000);
        std::string body = settings_json(next);
        body.insert(body.size() - 1, std::string(",\n  \"applied\": ") + (applied ? "true" : "false"));
        res.set_content(body, "application/json");
    });
    svr.Post("/unload", [](const httplib::Request &, httplib::Response & res) {
        auto freed   = std::make_shared<size_t>(0);
        bool applied = work_run_soon(
            [freed] {
                *freed = store_unload_idle(g_pipeline.store);
                if (store_policy(g_pipeline.store) == EVICT_NEVER) {
                    qw3lm_kv_free(&g_pipeline.kv);
                }
                refresh_loaded();
            },
            3000);
        char buf[96];
        snprintf(buf, sizeof(buf), "{\"applied\":%s,\"freed_mb\":%.0f}", applied ? "true" : "false",
                 applied ? (double) *freed / (1024.0 * 1024.0) : 0.0);
        res.set_content(buf, "application/json");
    });
    svr.Get("/hardware", [](const httplib::Request &, httplib::Response & res) {
        res.set_content(hardware_json(), "application/json");
    });

    // Local addition: the song library on disk (--outputs)
    if (!g_outputs_dir.empty()) {
        svr.Get("/library", [](const httplib::Request &, httplib::Response & res) {
            std::lock_guard<std::mutex> lock(mtx_library);
            res.set_content(library_list_json(), "application/json");
        });
        svr.Get("/library/audio", [](const httplib::Request & req, httplib::Response & res) {
            std::string name = req.get_param_value("name");
            if (!library_name_ok(name)) {
                res.status = 404;
                res.set_content(json_string("error", "no such take"), "application/json");
                return;
            }
            std::string path = audio_file_of(g_outputs_dir + "/" + name);
            bool        mp3  = path.size() > 4 && path.substr(path.size() - 4) == ".mp3";
            // Saved copies are named after the song, or the library name with names=library (local change)
            res.set_header("Content-Disposition", download_header("inline", g_outputs_dir + "/" + name, name, mp3 ? ".mp3" : ".wav",
                                                                  req.get_param_value("names") != "library"));
            res.set_file_content(path, mp3 ? "audio/mpeg" : "audio/wav");
        });
        // HERESY 1061: a file of a take's tree (derived/…), served by the engine itself: the lab's proxy
        // read whole bodies into memory (a 120 MB WAV came back 502) and cut a Range twice (416 on a seek).
        svr.Get("/library/file", [](const httplib::Request & req, httplib::Response & res) {
            std::string name = req.get_param_value("name"), rel = req.get_param_value("path");
            if (!library_name_ok(name) || rel.rfind("derived/", 0) != 0 || rel.find("..") != std::string::npos) {
                res.status = 404;
                res.set_content(json_string("error", "no such file"), "application/json");
                return;
            }
            std::error_code ec;
            auto dir  = std::filesystem::weakly_canonical(g_outputs_dir + "/" + name + "/derived", ec);
            auto file = std::filesystem::weakly_canonical(g_outputs_dir + "/" + name + "/" + rel, ec);
            auto d = dir.string(), f = file.string();
            if (ec || f.rfind(d + "/", 0) != 0 || !std::filesystem::is_regular_file(file)) {
                res.status = 404;
                res.set_content(json_string("error", "no such file"), "application/json");
                return;
            }
            std::string ext = file.extension().string();
            const char * type = ext == ".flac" ? "audio/flac" : ext == ".wav" ? "audio/wav" : ext == ".mp3" ? "audio/mpeg"
                              : ext == ".json" ? "application/json" : "application/octet-stream";
            res.set_file_content(f, type);
        });
        // HERESY 1053: what the player plays: listen.flac when the take is a WAV (made now if it is missing
        // or older than the WAV), the take's own file otherwise. A file response, so seeking is native.
        svr.Get("/library/listen", [](const httplib::Request & req, httplib::Response & res) {
            std::string name = req.get_param_value("name");
            if (!library_name_ok(name)) {
                res.status = 404;
                res.set_content(json_string("error", "no such take"), "application/json");
                return;
            }
            std::string dir  = g_outputs_dir + "/" + name;
            std::string path = audio_file_of(dir);
            bool        mp3  = path.size() > 4 && path.substr(path.size() - 4) == ".mp3";
            if (!mp3 && std::filesystem::is_regular_file(path)) {
                static std::mutex mtx_listen;                 // one encode at a time; a second asker finds it made
                std::lock_guard<std::mutex> lock(mtx_listen);
                if (!listen_flac_fresh(dir)) {
                    std::string wav, title, lyrics;
                    {
                        std::lock_guard<std::mutex> lib(mtx_library);
                        wav = read_file(path);
                        take_title_lyrics(dir, name, title, lyrics);
                    }
                    write_listen_flac(dir, wav, title, lyrics);
                }
                if (listen_flac_fresh(dir)) {
                    res.set_file_content(dir + "/listen.flac", "audio/flac");
                    return;
                }
            }
            res.set_file_content(path, mp3 ? "audio/mpeg" : "audio/wav");
        });
        // Waveform peaks for the player, read from the audio once and cached
        svr.Get("/library/peaks", [](const httplib::Request & req, httplib::Response & res) {
            std::string name = req.get_param_value("name");
            if (!library_name_ok(name)) {
                res.status = 404;
                res.set_content(json_string("error", "no such take"), "application/json");
                return;
            }
            std::string dir   = g_outputs_dir + "/" + name;
            std::string cache = dir + "/peaks.json";
            if (!std::filesystem::is_regular_file(cache)) {
                std::string audio = read_file(audio_file_of(dir));
                int         T = 0, sr = 0;
                float *     planar = audio_read_buf((const uint8_t *) audio.data(), audio.size(), &T, &sr);
                if (!planar || T <= 0) {
                    free(planar);
                    res.status = 500;
                    res.set_content(json_string("error", "cannot decode the audio"), "application/json");
                    return;
                }
                const int   buckets = 900;
                int         size    = T / buckets > 0 ? T / buckets : 1;
                std::string out     = "{\"peaks\":[";
                for (int b = 0; b < buckets && b * size < T; b++) {
                    float peak = 0.0f;
                    for (int i = b * size; i < (b + 1) * size && i < T; i++) {
                        peak = std::max(peak, std::max(fabsf(planar[i]), fabsf(planar[(size_t) T + i])));
                    }
                    char num[16];
                    snprintf(num, sizeof(num), "%s%.3f", b ? "," : "", (double) peak);
                    out += num;
                }
                char tail[64];
                snprintf(tail, sizeof(tail), "],\"seconds\":%.3f}", (double) T / (sr > 0 ? sr : YUE2_SAMPLE_RATE));
                out += tail;
                free(planar);
                write_file(cache, out);
            }
            res.set_content(read_file(cache), "application/json");
        });
        // A shareable MP3 of a take, encoded once per bitrate and cached beside it
        svr.Get("/library/mp3", [](const httplib::Request & req, httplib::Response & res) {
            std::string name = req.get_param_value("name");
            int         kbps = req.has_param("kbps") ? atoi(req.get_param_value("kbps").c_str()) : 320;
            if (!library_name_ok(name)) {
                res.status = 404;
                res.set_content(json_string("error", "no such take"), "application/json");
                return;
            }
            if (kbps != 128 && kbps != 192 && kbps != 256 && kbps != 320) {
                res.status = 400;
                res.set_content(json_string("error", "MP3 bitrate must be 128, 192, 256 or 320"), "application/json");
                return;
            }
            std::string dir    = g_outputs_dir + "/" + name;
            std::string source = audio_file_of(dir);
            std::string cache  = source;   // a take made as MP3 is served as it is
            if (source.size() < 4 || source.substr(source.size() - 4) != ".mp3") {
                cache = dir + "/audio-" + std::to_string(kbps) + "k.mp3";
                std::lock_guard<std::mutex> lock(mtx_library);
                std::error_code ec;
                std::string art = dir + "/artwork.jpg";     // HERESY 1120: a newer artwork makes the MP3 again
                bool fresh = std::filesystem::is_regular_file(cache) &&
                             std::filesystem::last_write_time(cache, ec) >= std::filesystem::last_write_time(source, ec) && !ec &&
                             (!std::filesystem::is_regular_file(art) ||
                              std::filesystem::last_write_time(cache, ec) >= std::filesystem::last_write_time(art, ec));
                if (!fresh) {
                    std::string wav = read_file(source);
                    int         T = 0, sr = 0;
                    float *     planar = audio_read_buf((const uint8_t *) wav.data(), wav.size(), &T, &sr);
                    if (!planar || T <= 0) {
                        free(planar);
                        res.status = 500;
                        res.set_content(json_string("error", "cannot decode the audio"), "application/json");
                        return;
                    }
                    std::string mp3 = audio_encode_mp3(planar, T, sr > 0 ? sr : YUE2_SAMPLE_RATE, kbps);
                    free(planar);
                    if (mp3.empty()) {
                        res.status = 500;
                        res.set_content(json_string("error", "the MP3 encoder failed"), "application/json");
                        return;
                    }
                    std::string title, lyrics;
                    take_title_lyrics(dir, name, title, lyrics);
                    write_file(cache, id3_tag(title, lyrics, std::filesystem::is_regular_file(art) ? read_file(art) : std::string()) + mp3);
                    fprintf(stderr, "[Library] MP3 %d kbps for %s\n", kbps, name.c_str());
                }
            }
            res.set_header("Content-Disposition",
                           download_header("attachment", dir, name, ".mp3", req.get_param_value("names") != "library"));
            res.set_file_content(cache, "audio/mpeg");
        });
        // A lossless FLAC of a WAV take, made on the spot (about a second for a 4-minute song)
        svr.Get("/library/flac", [](const httplib::Request & req, httplib::Response & res) {
            std::string name = req.get_param_value("name");
            if (!library_name_ok(name)) {
                res.status = 404;
                res.set_content(json_string("error", "no such take"), "application/json");
                return;
            }
            std::string dir    = g_outputs_dir + "/" + name;
            std::string source = audio_file_of(dir);
            if (source.size() < 4 || source.substr(source.size() - 4) != ".wav") {
                res.status = 400;
                res.set_content(json_string("error", "this take was made as MP3; a FLAC of it would not sound any better"),
                                "application/json");
                return;
            }
            std::string wav, title, lyrics;
            {
                std::lock_guard<std::mutex> lock(mtx_library);
                wav = read_file(source);
                take_title_lyrics(dir, name, title, lyrics);
            }
            auto        t0   = std::chrono::steady_clock::now();
            std::string err;
            int         bits = 0;
            std::string flac = flac_encode_wav(wav, title, lyrics, err, &bits);
            if (flac.empty()) {
                res.status = 500;
                res.set_content(json_string("error", "cannot make a FLAC: " + err), "application/json");
                return;
            }
            fprintf(stderr, "[Library] FLAC %d-bit for %s: %.1f MB (%.0f%% of the WAV), %.0f ms\n", bits, name.c_str(),
                    (double) flac.size() / 1e6, 100.0 * (double) flac.size() / (double) std::max<size_t>(wav.size(), 1),
                    std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count());
            res.set_header("Content-Disposition",
                           download_header("attachment", dir, name, ".flac", req.get_param_value("names") != "library"));
            res.set_content(std::move(flac), "audio/flac");
        });
        svr.Get("/library/request", [](const httplib::Request & req, httplib::Response & res) {
            std::string name = req.get_param_value("name");
            if (!library_name_ok(name)) {
                res.status = 404;
                res.set_content(json_string("error", "no such take"), "application/json");
                return;
            }
            res.set_content(read_file(g_outputs_dir + "/" + name + "/request.json"), "application/json");
        });
        svr.Post("/library/update", [](const httplib::Request & req, httplib::Response & res) {
            std::string name = req.get_param_value("name");
            if (!library_name_ok(name) || !library_update(name, req.body)) {
                res.status = 400;
                res.set_content(json_string("error", "cannot update that take"), "application/json");
                return;
            }
            std::lock_guard<std::mutex> lock(mtx_library);
            res.set_content(library_entry_json(name), "application/json");
        });
        svr.Post("/library/delete", [](const httplib::Request & req, httplib::Response & res) {
            std::string name = req.get_param_value("name");
            if (!library_name_ok(name)) {
                res.status = 404;
                res.set_content(json_string("error", "no such take"), "application/json");
                return;
            }
            std::lock_guard<std::mutex> lock(mtx_library);
            std::error_code             ec;
            std::filesystem::remove_all(g_outputs_dir + "/" + name, ec);
            if (ec) {
                res.status = 500;
                res.set_content(json_string("error", ec.message()), "application/json");
                return;
            }
            fprintf(stderr, "[Library] Deleted %s\n", name.c_str());
            res.set_content(json_string("deleted", name), "application/json");
        });
    }

    // HERESY 1130: the page from disk at every load, so a page built anew shows on a reload: no server build, no
    // restart. HERESY 1166: and only from disk: no copy inside the server and nothing gzipped (a studio of one machine
    // and its network has no use for it). RUACH_PAGE (start.sh points it at build/tools/public/index.html), else the
    // page beside this build (build/build/yue-server -> build/tools/public/index.html). A page not built yet is said
    // so, not served from an old copy.
    static std::string page_path;
    if (const char * env_page = getenv("RUACH_PAGE"); env_page && *env_page) {
        page_path = env_page;
    } else {
        std::error_code       ec;
        std::filesystem::path exe = std::filesystem::read_symlink("/proc/self/exe", ec);
        if (ec) {
            exe = std::filesystem::absolute(argv[0], ec);
        }
        page_path = (exe.parent_path().parent_path() / "tools" / "public" / "index.html").string();
    }
    fprintf(stderr, "[Server] The page: %s\n", page_path.c_str());
    svr.Get("/", [](const httplib::Request &, httplib::Response & res) {
        std::string page = read_file(page_path);
        if (page.empty()) {
            res.status = 503;
            res.set_content("Ruach Studio: the page is not built (" + page_path +
                                " is missing). Run ./build.sh in the studio's folder, then reload.\n",
                            "text/plain; charset=utf-8");
            return;
        }
        res.set_header("Cache-Control", "no-store");
        res.set_content(page, "text/html; charset=utf-8");
    });

    fprintf(stderr, "[Server] yue-server %s\n", YUE2_VERSION);
    // Local patch: print a full URL so terminals turn it into a clickable link.
    fprintf(stderr, "[Server] Listening on http://%s:%d\n", host, port);
    // A failed bind must reach the caller: a supervisor that reads only the
    // exit code would otherwise believe the daemon is up.
    int exit_code = 0;
    if (!svr.listen(host, port)) {
        fprintf(stderr, "[Server] FATAL: cannot bind %s:%d\n", host, port);
        exit_code = 1;
    }

    {
        std::lock_guard<std::mutex> lock(mtx_work);
        g_work_stop = true;
    }
    cv_work.notify_all();
    worker.join();
    pipeline_free(&g_pipeline);
    store_free(g_pipeline.store);
    fprintf(stderr, "[Server] Done\n");
    return exit_code;
}
