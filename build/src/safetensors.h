#pragma once
// safetensors.h: read only safetensors mapping
//
// Format: 8 byte LE header length, a flat JSON header, the raw tensor data.
// The file is mapped, the header parsed into entries (name, dtype, shape,
// byte range) and the string values of __metadata__. Every byte range is
// checked against the data section, so st_data never reads past the map.
//
// The JSON scanner covers the flat objects safetensors headers and adapter
// configs are made of, not general JSON.

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#ifdef _WIN32
#    include <windows.h>
#else
#    include <fcntl.h>
#    include <sys/mman.h>
#    include <sys/stat.h>
#    include <unistd.h>
#endif

struct STEntry {
    std::string name;
    std::string dtype;  // "F32", "BF16", "F16", ...
    int64_t     shape[4];
    int         n_dims;
    size_t      data_start;  // byte offset into the data section
    size_t      data_end;
};

struct STFile {
    uint8_t *                          mapping;
    size_t                             file_size;
    size_t                             data_offset;  // 8 + header length
    std::vector<STEntry>               entries;
    std::map<std::string, std::string> metadata;     // string values of __metadata__
#ifdef _WIN32
    HANDLE fh, mh;
#else
    int fd;
#endif
};

static size_t st_ws(const char * s, size_t p, size_t len) {
    while (p < len && (s[p] == ' ' || s[p] == '\t' || s[p] == '\n' || s[p] == '\r')) {
        p++;
    }
    return p;
}

// Quoted string at s[p] == '"', escapes kept verbatim. Returns the position
// after the closing quote.
static size_t st_str(const char * s, size_t p, size_t len, std::string * out) {
    size_t start = ++p;
    while (p < len && s[p] != '"') {
        p += s[p] == '\\' ? 2 : 1;
    }
    out->assign(s + start, (p < len ? p : len) - start);
    return p + 1;
}

// Any JSON value: string, object, array or scalar
static size_t st_skip(const char * s, size_t p, size_t len) {
    p = st_ws(s, p, len);
    if (p >= len) {
        return p;
    }
    if (s[p] == '"') {
        std::string tmp;
        return st_str(s, p, len, &tmp);
    }
    if (s[p] == '{' || s[p] == '[') {
        int depth = 0;
        while (p < len) {
            if (s[p] == '"') {
                std::string tmp;
                p = st_str(s, p, len, &tmp);
                continue;
            }
            depth += (s[p] == '{' || s[p] == '[') - (s[p] == '}' || s[p] == ']');
            p++;
            if (depth == 0) {
                break;
            }
        }
        return p;
    }
    while (p < len && s[p] != ',' && s[p] != '}' && s[p] != ']') {
        p++;
    }
    return p;
}

// Walks the members of the object at s[p] == '{', calling fn(key, value
// position) for each. fn returns the position after the value.
template <typename F> static bool st_object(const char * s, size_t p, size_t len, F fn) {
    p = st_ws(s, p, len);
    if (p >= len || s[p] != '{') {
        return false;
    }
    p++;
    while (true) {
        p = st_ws(s, p, len);
        if (p >= len) {
            return false;
        }
        if (s[p] == '}') {
            return true;
        }
        if (s[p] == ',') {
            p++;
            continue;
        }
        if (s[p] != '"') {
            return false;
        }
        std::string key;
        p = st_ws(s, st_str(s, p, len, &key), len);
        if (p >= len || s[p] != ':') {
            return false;
        }
        p = fn(key, st_ws(s, p + 1, len));
    }
}

// Integers of a JSON array at s[p] == '[', at most max of them
static size_t st_ints(const char * s, size_t p, size_t len, int64_t * out, int max, int * n) {
    *n = 0;
    p++;
    while (p < len && s[p] != ']') {
        p = st_ws(s, p, len);
        if (s[p] == ',') {
            p++;
            continue;
        }
        char *  end;
        int64_t v = strtoll(s + p, &end, 10);
        if (end == s + p) {
            break;
        }
        if (*n < max) {
            out[*n] = v;
        }
        (*n)++;
        p = (size_t) (end - s);
    }
    return p + 1;
}

static bool st_parse(STFile * st, const char * hdr, size_t len) {
    return st_object(hdr, 0, len, [&](const std::string & key, size_t p) {
        if (key == "__metadata__") {
            size_t end = st_skip(hdr, p, len);
            st_object(hdr, p, end, [&](const std::string & k, size_t q) {
                if (hdr[q] == '"') {
                    return st_str(hdr, q, end, &st->metadata[k]);
                }
                return st_skip(hdr, q, end);
            });
            return end;
        }
        STEntry e  = {};
        e.name     = key;
        size_t end = st_skip(hdr, p, len);
        st_object(hdr, p, end, [&](const std::string & field, size_t q) {
            if (field == "dtype") {
                return st_str(hdr, q, end, &e.dtype);
            }
            if (field == "shape") {
                return st_ints(hdr, q, end, e.shape, 4, &e.n_dims);
            }
            if (field == "data_offsets") {
                int64_t r[2] = { 0, 0 };
                int     n    = 0;
                q            = st_ints(hdr, q, end, r, 2, &n);
                e.data_start = (size_t) r[0];
                e.data_end   = (size_t) r[1];
                return q;
            }
            return st_skip(hdr, q, end);
        });
        st->entries.push_back(e);
        return end;
    });
}

static void st_close(STFile * st) {
#ifdef _WIN32
    if (st->mapping) {
        UnmapViewOfFile(st->mapping);
    }
    if (st->mh) {
        CloseHandle(st->mh);
    }
    if (st->fh && st->fh != INVALID_HANDLE_VALUE) {
        CloseHandle(st->fh);
    }
#else
    if (st->mapping) {
        munmap(st->mapping, st->file_size);
    }
    if (st->fd >= 0) {
        close(st->fd);
    }
#endif
    *st = {};
#ifndef _WIN32
    st->fd = -1;
#endif
}

static bool st_open(STFile * st, const char * path) {
    *st = {};
#ifdef _WIN32
    st->fh = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (st->fh == INVALID_HANDLE_VALUE) {
        fprintf(stderr, "[Safetensors] Cannot open %s\n", path);
        return false;
    }
    LARGE_INTEGER li;
    GetFileSizeEx(st->fh, &li);
    st->file_size = (size_t) li.QuadPart;
    st->mh        = CreateFileMappingA(st->fh, NULL, PAGE_READONLY, 0, 0, NULL);
    st->mapping   = st->mh ? (uint8_t *) MapViewOfFile(st->mh, FILE_MAP_READ, 0, 0, 0) : NULL;
#else
    st->fd = open(path, O_RDONLY);
    if (st->fd < 0) {
        fprintf(stderr, "[Safetensors] Cannot open %s\n", path);
        return false;
    }
    struct stat sb;
    fstat(st->fd, &sb);
    st->file_size = (size_t) sb.st_size;
    st->mapping   = (uint8_t *) mmap(NULL, st->file_size, PROT_READ, MAP_PRIVATE, st->fd, 0);
    if (st->mapping == MAP_FAILED) {
        st->mapping = NULL;
    }
#endif
    if (!st->mapping || st->file_size < 8) {
        fprintf(stderr, "[Safetensors] Cannot map %s\n", path);
        st_close(st);
        return false;
    }
    uint64_t hdr_len;
    memcpy(&hdr_len, st->mapping, 8);
    if (hdr_len > st->file_size - 8 || !st_parse(st, (const char *) st->mapping + 8, (size_t) hdr_len)) {
        fprintf(stderr, "[Safetensors] Bad header in %s\n", path);
        st_close(st);
        return false;
    }
    st->data_offset   = 8 + (size_t) hdr_len;
    size_t data_bytes = st->file_size - st->data_offset;
    for (const STEntry & e : st->entries) {
        if (e.n_dims > 4 || e.data_start > e.data_end || e.data_end > data_bytes) {
            fprintf(stderr, "[Safetensors] Tensor %s out of bounds in %s\n", e.name.c_str(), path);
            st_close(st);
            return false;
        }
    }
    return true;
}

static inline const void * st_data(const STFile & st, const STEntry & e) {
    return st.mapping + st.data_offset + e.data_start;
}

// Number of a top level member of a flat JSON object, 0 when absent
static float st_json_number(const std::string & json, const char * key) {
    float value = 0.0f;
    st_object(json.c_str(), 0, json.size(), [&](const std::string & k, size_t p) {
        if (k == key) {
            value = strtof(json.c_str() + p, NULL);
        }
        return st_skip(json.c_str(), p, json.size());
    });
    return value;
}
