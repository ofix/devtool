#pragma once
#include "ShmCrossPlatform.hpp"

class ShmChannel
{
private:
  ShmHandle _h{};
  ShmChannelHeader *_hdr{};
  ShmMessage *_buf{};

public:
  bool create(const char *name, uint32_t cap = 2048)
  {
    uint32_t total = sizeof(ShmChannelHeader) + cap * sizeof(ShmMessage);
    if (!ShmCrossPlatform::create(&_h, name, total))
      return false;
    _hdr = (ShmChannelHeader *)_h.ptr;
    _buf = (ShmMessage *)((char *)_h.ptr + sizeof(ShmChannelHeader));
    _hdr->capacity = cap;
    _hdr->wpos = _hdr->msg_count = 0;
    for (int i = 0; i < MAX_READERS; i++)
      _hdr->rpos[i] = 0;
    return true;
  }

  bool open(const char *name, uint32_t cap = 2048)
  {
    uint32_t total = sizeof(ShmChannelHeader) + cap * sizeof(ShmMessage);
    if (!ShmCrossPlatform::open(&_h, name, total))
      return false;
    _hdr = (ShmChannelHeader *)_h.ptr;
    _buf = (ShmMessage *)((char *)_h.ptr + sizeof(ShmChannelHeader));
    return true;
  }

  bool push(const ShmMessage &msg)
  {
    if (_hdr->msg_count >= _hdr->capacity)
      return false;
    _buf[_hdr->wpos] = msg;
    _hdr->wpos = (_hdr->wpos + 1) % _hdr->capacity;
    __sync_add_and_fetch(&_hdr->msg_count, 1);
    return true;
  }

  bool pop(uint8_t readerId, ShmMessage &out)
  {
    if (readerId >= MAX_READERS)
      return false;
    if (_hdr->msg_count == 0)
      return false;
    out = _buf[_hdr->rpos[readerId]];
    _hdr->rpos[readerId] = (_hdr->rpos[readerId] + 1) % _hdr->capacity;
    __sync_sub_and_fetch(&_hdr->msg_count, 1);
    return true;
  }

  void close() { ShmCrossPlatform::close(&_h); }
};