import csvReader from "./csvReader.js"
import jsonReader from "./jsonReader.js"
import jqExpression from "./jqExpression.js"
import jsonUnnest from "./jsonUnnest.js"
import jsonUnpivot from "./jsonUnpivot.js"
import jsonFlatten from "./jsonFlatten.js"
import jsonExtract from "./jsonExtract.js"
import jsonFilter from "./jsonFilter.js"
import output from "./output.js"
import message from "./message.js"
import filter from "./filter.js"
import select from "./select.js"
import sort from "./sort.js"
import unique from "./unique.js"
import sample from "./sample.js"
import formula from "./formula.js"
import join from "./join.js"
import union from "./union.js"
import summarize from "./summarize.js"
import transpose from "./transpose.js"
import crossTab from "./crossTab.js"
import countRecords from "./countRecords.js"
import textToColumns from "./textToColumns.js"
import regexExtract from "./regexExtract.js"
import folderInput from "./folderInput.js"
import folderOutput from "./folderOutput.js"
import script from "./script.js"
import dynamicRename from "./dynamicRename.js"
import xlsxInput from "./xlsxInput.js"
import xlsxOutput from "./xlsxOutput.js"
import dbConnection from "./dbConnection.js"
import dbQuery from "./dbQuery.js"

const modules = [
  csvReader,
  jsonReader,
  jqExpression,
  jsonUnnest,
  jsonUnpivot,
  jsonFlatten,
  jsonExtract,
  jsonFilter,
  output,
  message,
  filter,
  select,
  sort,
  unique,
  sample,
  formula,
  join,
  union,
  summarize,
  transpose,
  crossTab,
  countRecords,
  textToColumns,
  regexExtract,
  folderInput,
  folderOutput,
  script,
  dynamicRename,
  xlsxInput,
  xlsxOutput,
  dbConnection,
  dbQuery,
]

export const OPERATORS = {}
for (const mod of modules) {
  OPERATORS[mod.type] = mod
}

export function getOperator(type) {
  return OPERATORS[type] || null
}

export function listOperators() {
  return modules.slice()
}

export default OPERATORS
