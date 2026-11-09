// 边操作：0 成功，1+ 错误
export const EDGE_OK = 0;
export const EDGE_ERR_SELF_LOOP = 1;
export const EDGE_ERR_DUPLICATE = 2;
export const EDGE_ERR_CYCLE = 3;
export const EDGE_ERR_PORT_OCCUPIED = 4;

export function edgeErrorI18nKey(code) {
  switch (code) {
    case EDGE_ERR_SELF_LOOP:
      return "graph.edge.selfLoop";
    case EDGE_ERR_DUPLICATE:
      return "graph.edge.duplicate";
    case EDGE_ERR_CYCLE:
      return "graph.edge.cycle";
    case EDGE_ERR_PORT_OCCUPIED:
      return "graph.edge.portOccupied";
    default:
      return "graph.edge.unknown";
  }
}