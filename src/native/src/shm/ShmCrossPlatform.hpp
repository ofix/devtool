#pragma once
#include "ShmCommon.h"

class ShmCrossPlatform
{
public:
  static bool create(ShmHandle *h, const char *name, uint32_t size)
  {
    strncpy(h->name, name, SHM_NAME_MAX - 1);
    h->size = size;
    h->ptr = nullptr;

#ifdef _WIN32
    h->hMap = CreateFileMappingA(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, size, name);
    if (!h->hMap)
      return false;
    h->ptr = MapViewOfFile(h->hMap, FILE_MAP_ALL_ACCESS, 0, 0, size);
#else
    h->fd = shm_open(name, O_CREAT | O_RDWR, 0666);
    if (h->fd < 0)
      return false;
    ftruncate(h->fd, size);
    h->ptr = mmap(nullptr, size, PROT_READ | PROT_WRITE, MAP_SHARED, h->fd, 0);
#endif
    return h->ptr != nullptr;
  }

  static bool open(ShmHandle *h, const char *name, uint32_t size)
  {
    strncpy(h->name, name, SHM_NAME_MAX - 1);
    h->size = size;
    h->ptr = nullptr;

#ifdef _WIN32
    h->hMap = OpenFileMappingA(FILE_MAP_ALL_ACCESS, FALSE, name);
    if (!h->hMap)
      return false;
    h->ptr = MapViewOfFile(h->hMap, FILE_MAP_ALL_ACCESS, 0, 0, size);
#else
    h->fd = shm_open(name, O_RDWR, 0666);
    if (h->fd < 0)
      return false;
    h->ptr = mmap(nullptr, size, PROT_READ | PROT_WRITE, MAP_SHARED, h->fd, 0);
#endif
    return h->ptr != nullptr;
  }

  static void close(ShmHandle *h)
  {
    if (!h->ptr)
      return;
#ifdef _WIN32
    UnmapViewOfFile(h->ptr);
    CloseHandle(h->hMap);
#else
    munmap(h->ptr, h->size);
    ::close(h->fd);
#endif
    h->ptr = nullptr;
  }
};