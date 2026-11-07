import { JsCsvReader } from "./JsCsvReader.js"
import { JsFilter } from "./JsFilter.js"
import { JsSelect } from "./JsSelect.js"
import { JsFormula } from "./JsFormula.js"
import { JsDynamicRename } from "./JsDynamicRename.js"
import { JsUnique } from "./JsUnique.js"
import { JsSample } from "./JsSample.js"
import { JsRegexExtract } from "./JsRegexExtract.js"
import { JsTranspose } from "./JsTranspose.js"
import { JsJsonExtract } from "./JsJsonExtract.js"
import { JsUnion } from "./JsUnion.js"
import { JsJoin } from "./JsJoin.js"
import { JsSummarize } from "./JsSummarize.js"
import { JsCrossTab } from "./JsCrossTab.js"
import { JsTextToColumns } from "./JsTextToColumns.js"
import { JsCsvWriter } from "./JsCsvWriter.js"

export const opMap = {
  csvReader: JsCsvReader,
  filter: JsFilter,
  select: JsSelect,
  formula: JsFormula,
  dynamicRename: JsDynamicRename,
  unique: JsUnique,
  sample: JsSample,
  regexExtract: JsRegexExtract,
  transpose: JsTranspose,
  jsonExtract: JsJsonExtract,
  union: JsUnion,
  join: JsJoin,
  summarize: JsSummarize,
  crossTab: JsCrossTab,
  textToColumns: JsTextToColumns,
  csvWriter: JsCsvWriter,
}
