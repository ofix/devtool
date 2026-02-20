#pragma once
#include "ShmChannel.hpp"

#define GLOBAL_SHM_NAME "GlobalShmCtrl"
#define GLOBAL_SHM_SIZE (16 * 1024)

class GlobalShm
{
private:
  ShmHandle _h{};
  GlobalShmCtrl *_ctrl{};

public:
  bool create()
  {
    if (!ShmCrossPlatform::create(&_h, GLOBAL_SHM_NAME, GLOBAL_SHM_SIZE))
      return false;
    _ctrl = (GlobalShmCtrl *)_h.ptr;
    _ctrl->version = 1;
    _ctrl->channel_count = 0;
    return true;
  }

  bool open()
  {
    if (!ShmCrossPlatform::open(&_h, GLOBAL_SHM_NAME, GLOBAL_SHM_SIZE))
      return false;
    _ctrl = (GlobalShmCtrl *)_h.ptr;
    return true;
  }

  bool addChannel(const char *name, const char *shmName, const char *path, int type)
  {
    if (_ctrl->channel_count >= MAX_CHANNELS)
      return false;
    auto &ch = _ctrl->channels[_ctrl->channel_count++];
    strncpy(ch.name, name, CHANNEL_NAME_MAX - 1);
    strncpy(ch.shm_name, shmName, SHM_NAME_MAX - 1);
    strncpy(ch.data_path, path, DATA_PATH_MAX - 1);
    ch.type = type;
    ch.enabled = 1;
    return true;
  }

  GlobalShmCtrl *ctrl() { return _ctrl; }
  void close() { ShmCrossPlatform::close(&_h); }
};