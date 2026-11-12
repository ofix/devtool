#include <cassert>
#include <cstdio>

#include "contract/Enums.h"
using namespace dc;

int main() {
  PortKind all[] = {PortKind::kChunk, PortKind::kTable, PortKind::kJson,
                    PortKind::kText};
  int direct = 0, conv = 0;
  for (auto s : all)
    for (auto d : all) {
      auto t = ResolveTransform(s, d);
      if (s == d) {
        assert(t == TransformKind::kNone);
        ++direct;
      } else {
        assert(t != TransformKind::kNone);
        ++conv;
      }
    }
  assert(direct == 4);
  assert(conv == 12);
  std::printf("transform matrix ok: direct=%d conv=%d\n", direct, conv);

  // toResultKind 全映射
  assert(ToResultKind(PortKind::kChunk) == ResultKind::kDbTable);
  assert(ToResultKind(PortKind::kTable) == ResultKind::kDbTable);
  assert(ToResultKind(PortKind::kJson) == ResultKind::kJson);
  assert(ToResultKind(PortKind::kText) == ResultKind::kText);
  std::printf("toResultKind ok\n");
  return 0;
}