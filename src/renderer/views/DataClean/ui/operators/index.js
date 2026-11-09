import { metaReaders } from "./readers.js"
import { metaFilters } from "./filters.js"
import { metaTransform } from "./transform.js"
import { metaJson } from "./json.js"
import { metaStatistics } from "./statistics.js"
import { metaJoinUnion } from "./join.js"
import { metaWriters } from "./writers.js"

// 将所有元数据集中管理
export const metaOperators = {
    ...metaReaders,
    ...metaFilters,
    ...metaTransform,
    ...metaJson,
    ...metaStatistics,
    ...metaJoinUnion,
    ...metaWriters,
}

export function getOperatorMeta(type) {
  return metaOperators[type] || null
}
