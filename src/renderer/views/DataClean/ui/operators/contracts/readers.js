import { SourceTypes } from "../types/source.js";

export const ReadersContracts = Object.freeze({
  [SourceTypes.CsvReader]: {
    type: SourceTypes.CsvReader,
    executeMode: "stream",
    parallelSafe: true,
    cteOptimize: false,
    inputPorts: [],
    outputPorts: [{ index: 0, acceptedKinds: [], possibleResultKinds: ["chunk"] }],
    schema: [],
    params: [
      { key: "path", kind: "string", required: true },
      { key: "delimiter", kind: "string", required: false, defaultValue: "," },
      { key: "hasHeader", kind: "boolean", required: false, defaultValue: true },
      {
        key: "encoding",
        kind: "enum",
        required: false,
        enumValues: ["utf-8", "gbk"],
        defaultValue: "utf-8",
      },
    ],
  },
  [SourceTypes.ExcelReader]: {
    type: SourceTypes.ExcelReader,
    executeMode: "barrier",
    parallelSafe: false,
    cteOptimize: false,
    inputPorts: [],
    outputPorts: [{ index: 0, acceptedKinds: [], possibleResultKinds: ["db_table"] }],
    schema: [],
    params: [
      { key: "path", kind: "string", required: true },
      { key: "sheetName", kind: "string", required: false },
      { key: "hasHeader", kind: "boolean", required: false, defaultValue: true },
    ],
  },
  [SourceTypes.ParquetReader]: {
    type: SourceTypes.ParquetReader,
    executeMode: "barrier",
    parallelSafe: true,
    cteOptimize: false,
    inputPorts: [],
    outputPorts: [{ index: 0, acceptedKinds: [], possibleResultKinds: ["db_table"] }],
    schema: [],
    params: [{ key: "path", kind: "string", required: true }],
  },
});
