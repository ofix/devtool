import { SqlTranslator } from "./SqlTranslator.js"
import { DuckCsvReader } from "./operators/DuckCsvReader.js"
import { DuckFilter } from "./operators/DuckFilter.js"
import { DuckJoin } from "./operators/DuckJoin.js"
import { DuckSelect } from "./operators/DuckSelect.js"
import { DuckUnique } from "./operators/DuckUnique.js"
import { DuckFormula } from "./operators/DuckFormula.js"
import { DuckSample } from "./operators/DuckSample.js"
import { DuckSummarize } from "./operators/DuckSummarize.js"
import { DuckUnion } from "./operators/DuckUnion.js"
import { DuckDynamicRename } from "./operators/DuckDynamicRename.js"
import { DuckRegexExtract } from "./operators/DuckRegexExtract.js"
import { DuckCountRecords } from "./operators/DuckCountRecords.js"
import { DuckTranspose } from "./operators/DuckTranspose.js"
import { DuckCrossTab } from "./operators/DuckCrossTab.js"
import { DuckJoin } from "./operators/DuckJoin.js"
import { DuckTextToColumns } from "./operators/DuckTextToColumns.js"

export function createEngineInstance() {
  const translator = new SqlTranslator()

  const opMap = {
    csvReader: DuckCsvReader,
    filter: DuckFilter,
    join: DuckJoin,
    select: DuckSelect,
    unique: DuckUnique,
    formula: DuckFormula,
    sample: DuckSample,
    summarize: DuckSummarize,
    union: DuckUnion,
    dynamicRename: DuckDynamicRename,
    regexExtract: DuckRegexExtract,
    countRecords: DuckCountRecords,
    transpose: DuckTranspose,
    crossTab: DuckCrossTab,
    join: DuckJoin,
    textToColumns: DuckTextToColumns,
  }

  return {
    async init() {
      console.log("[DuckDB 引擎] 已就绪")
    },
    async destroy() {},
    getExecutor(opType) {
      const Cls = opMap[opType]
      if (!Cls) throw new Error(`DuckDB 引擎暂不支持算子: ${opType}`)
      return new Cls(translator)
    },
    async getPreviewData(payload, limit = 1000) {
      if (!payload || !payload.tableName) return []
      return await translator.fetchPreview(payload.tableName, limit)
    },
  }
}
