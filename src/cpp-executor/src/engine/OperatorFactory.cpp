#include "PortTransformRegistry.h"
using namespace dataclean;
REGISTER_PORT_TRANSFORM(PortDataKind::kChunk, PortDataKind::kTable, "ChunkToTable");
REGISTER_PORT_TRANSFORM(PortDataKind::kJson, PortDataKind::kTable, "JsonToTable");