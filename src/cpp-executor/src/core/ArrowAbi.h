// src/core/ArrowAbi.h
#pragma once
#include <cstdint>

namespace dataclean {

struct ArrowSchema {
    const char *format;
    const char *name;
    const char *metadata;
    int64_t flags;
    int64_t n_children;
    struct ArrowSchema **children;
    struct ArrowSchema *dictionary;
    void (*release)(struct ArrowSchema *);
    void *private_data;
};

struct ArrowArray {
    int64_t length;
    int64_t null_count;
    int64_t offset;
    int64_t n_buffers;
    int64_t n_children;
    const void **buffers;
    struct ArrowArray **children;
    struct ArrowArray *dictionary;
    void (*release)(struct ArrowArray *);
    void *private_data;
};

struct ArrowArrayStream {
    int (*get_schema)(struct ArrowArrayStream *, struct ArrowSchema *out);
    int (*get_next)(struct ArrowArrayStream *, struct ArrowArray *out);
    const char *(*get_last_error)(struct ArrowArrayStream *);
    void (*release)(struct ArrowArrayStream *);
    void *private_data;
};

// RAII 包装，自动释放 C 结构体
struct ArrowArrayHolder {
    ArrowArray *array = nullptr;
    ArrowSchema *schema = nullptr;
    ~ArrowArrayHolder() {
        if (array && array->release) array->release(array);
        delete array;
        if (schema && schema->release) schema->release(schema);
        delete schema;
    }
};

} // namespace dataclean