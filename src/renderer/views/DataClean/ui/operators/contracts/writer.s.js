import { WriterTypes } from "../types/writer.js";

export const WritersContracts = Object.freeze({
  [WriterTypes.CsvWriter]: {
    type: WriterTypes.CsvWriter,
    executeMode: "barrier",
    parallelSafe: false,
    cteOptimize: false,
    inputPorts: [{ index: 0, acceptedKinds: ["table"], possibleResultKinds: ["db_table"] }],
    outputPorts: [{ index: 0, acceptedKinds: [], possibleResultKinds: ["text"] }],
    schema: [],
    params: [
      { key: "path", kind: "string", required: true },
      { key: "delimiter", kind: "string", required: false, defaultValue: "," },
      { key: "overwrite", kind: "boolean", required: false, defaultValue: false },
    ],
  },
  [WriterTypes.ParquetWriter]: {
    type: WriterTypes.ParquetWriter,
    executeMode: "barrier",
    parallelSafe: false,
    cteOptimize: false,
    inputPorts: [{ index: 0, acceptedKinds: ["table"], possibleResultKinds: ["db_table"] }],
    outputPorts: [{ index: 0, acceptedKinds: [], possibleResultKinds: ["text"] }],
    schema: [],
    params: [
      { key: "path", kind: "string", required: true },
      {
        key: "compression",
        kind: "enum",
        required: false,
        enumValues: ["snappy", "zstd", "none"],
        defaultValue: "snappy",
      },
      { key: "overwrite", kind: "boolean", required: false, defaultValue: false },
    ],
  },
});
