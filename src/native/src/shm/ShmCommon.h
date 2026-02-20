#pragma once
#include <stdint.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/mman.h>
#include <sys/fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

#define MAX_CHANNELS 16
#define MAX_READERS 8
#define SHM_NAME_MAX 64
#define CHANNEL_NAME_MAX 32
#define DATA_PATH_MAX 256

#define CHANNEL_PROXY 1
#define CHANNEL_API 2
#define CHANNEL_FILE_DIFF 3
#define CHANNEL_FOLDER_DIFF 4

struct ShmMessage
{
  uint64_t id;
  uint32_t channel_type;
  uint64_t file_offset;
  uint32_t data_len;
  uint64_t ts;
};

struct ShmChannelHeader
{
  uint32_t capacity;
  uint32_t wpos;
  uint32_t rpos[MAX_READERS];
  uint32_t msg_count;
};

struct GlobalShmCtrl
{
  uint32_t version;
  uint32_t channel_count;
  struct
  {
    char name[CHANNEL_NAME_MAX];
    char shm_name[SHM_NAME_MAX];
    char data_path[DATA_PATH_MAX];
    int32_t type;
    int32_t enabled;
  } channels[MAX_CHANNELS];
};

struct ShmHandle
{
#ifdef _WIN32
  HANDLE hMap;
#else
  int fd;
#endif
  void *ptr;
  uint32_t size;
  char name[SHM_NAME_MAX];
};