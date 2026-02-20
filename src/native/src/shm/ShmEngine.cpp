
#include "GlobalShm.hpp"
#include <stdio.h>
#include <thread>

int main()
{
  GlobalShm g;
  g.create();

  g.addChannel("proxy", "ShmProxy", "/tmp/proxy.dat", CHANNEL_PROXY);
  g.addChannel("api", "ShmApi", "/tmp/api.dat", CHANNEL_API);
  g.addChannel("filediff", "ShmFileDiff", "/tmp/fdiff.dat", CHANNEL_FILE_DIFF);
  g.addChannel("folderdiff", "ShmFolderDiff", "/tmp/ddiff.dat", CHANNEL_FOLDER_DIFF);

  ShmChannel chan;
  chan.create("ShmProxy");

  uint64_t id = 0;
  while (true)
  {
    ShmMessage msg{};
    msg.id = id++;
    msg.channel_type = CHANNEL_PROXY;
    msg.file_offset = 1000 + id;
    msg.data_len = 128;
    msg.ts = time(nullptr);
    chan.push(msg);
    printf("write msg %lu\n", msg.id);
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
  }

  chan.close();
  g.close();
  return 0;
}