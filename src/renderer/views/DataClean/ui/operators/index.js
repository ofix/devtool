import { meta as csvReaderMeta } from "./csvReader.js"
import { meta as jsonReaderMeta } from "./jsonReader.js"
import { meta as folderInputMeta } from "./folderInput.js"
import { meta as dbConnectionMeta } from "./dbConnection.js"
import { meta as filterMeta } from "./filter.js"
import { meta as selectMeta } from "./select.js"
import { meta as formulaMeta } from "./formula.js"
import { meta as dynamicRenameMeta } from "./dynamicRename.js"
import { meta as uniqueMeta } from "./unique.js"
import { meta as sampleMeta } from "./sample.js"
import { meta as regexExtractMeta } from "./regexExtract.js"
import { meta as textToColumnsMeta } from "./textToColumns.js"
import { meta as transposeMeta } from "./transpose.js"
import { meta as summarizeMeta } from "./summarize.js"
import { meta as crossTabMeta } from "./crossTab.js"
import { meta as unionMeta } from "./union.js"
import { meta as joinMeta } from "./join.js"
import { meta as countRecordsMeta } from "./countRecords.js"
import { meta as jsonExtractMeta } from "./jsonExtract.js"
import { meta as jsonUnnestMeta } from "./jsonUnnest.js"
import { meta as jsonUnpivotMeta } from "./jsonUnpivot.js"
import { meta as jsonFlattenMeta } from "./jsonFlatten.js"
import { meta as jsonFilterMeta } from "./jsonFilter.js"
import { meta as jqExpressionMeta } from "./jqExpression.js"
import { meta as csvWriterMeta } from "./csvWriter.js"
import { meta as xlsxWriterMeta } from "./xlsxWriter.js"
import { meta as jsonWriterMeta } from "./jsonWriter.js"
import { meta as dbWriterMeta } from "./dbWriter.js"

// 将所有元数据集中管理
export const operatorMetas = {
  csvReader: csvReaderMeta,
  jsonReader: jsonReaderMeta,
  folderInput: folderInputMeta,
  dbConnection: dbConnectionMeta,
  filter: filterMeta,
  select: selectMeta,
  formula: formulaMeta,
  dynamicRename: dynamicRenameMeta,
  unique: uniqueMeta,
  sample: sampleMeta,
  regexExtract: regexExtractMeta,
  textToColumns: textToColumnsMeta,
  transpose: transposeMeta,
  summarize: summarizeMeta,
  crossTab: crossTabMeta,
  union: unionMeta,
  join: joinMeta,
  countRecords: countRecordsMeta,
  jsonExtract: jsonExtractMeta,
  jsonUnnest: jsonUnnestMeta,
  jsonUnpivot: jsonUnpivotMeta,
  jsonFlatten: jsonFlattenMeta,
  jsonFilter: jsonFilterMeta,
  jqExpression: jqExpressionMeta,
  csvWriter: csvWriterMeta,
  xlsxWriter: xlsxWriterMeta,
  jsonWriter: jsonWriterMeta,
  dbWriter: dbWriterMeta,
}

export function getOperatorMeta(type) {
  return operatorMetas[type] || null
}
