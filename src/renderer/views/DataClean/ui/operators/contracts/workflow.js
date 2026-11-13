import { WorkflowTypes } from "../types/workflow.js";

export const WorkflowContracts = Object.freeze({
  [WorkflowTypes.FolderScan]: {
    type: WorkflowTypes.FolderScan,
    executeMode: "stream",
    parallelSafe: true,
    cteOptimize: false,
    inputPorts: [],
    outputPorts: [{ index: 0, acceptedKinds: [], possibleResultKinds: ["chunk"] }],
    schema: [
      { name: "file_path", arrowType: "LargeUtf8", nullable: false, inputPortIndex: -1 },
      { name: "file_size", arrowType: "Int64", nullable: false, inputPortIndex: -1 },
      { name: "modified_at", arrowType: "Int64", nullable: false, inputPortIndex: -1 },
    ],
    params: [
      { key: "directory", kind: "string", required: true },
      { key: "pattern", kind: "string", required: false, defaultValue: "*" },
      { key: "recursive", kind: "boolean", required: false, defaultValue: false },
    ],
  },
  [WorkflowTypes.HttpRequest]: {
    type: WorkflowTypes.HttpRequest,
    executeMode: "barrier",
    parallelSafe: false,
    cteOptimize: false,
    inputPorts: [],
    outputPorts: [{ index: 0, acceptedKinds: [], possibleResultKinds: ["json"] }],
    schema: [],
    params: [
      { key: "url", kind: "string", required: true, pattern: "^https?://" },
      {
        key: "method",
        kind: "enum",
        required: false,
        enumValues: ["GET", "POST"],
        defaultValue: "GET",
      },
      { key: "headers", kind: "object", required: false },
      { key: "body", kind: "string", required: false },
      { key: "timeoutMs", kind: "number", required: false, min: 0, defaultValue: 30000 },
    ],
  },
  [WorkflowTypes.Script]: {
    type: WorkflowTypes.Script,
    executeMode: "barrier",
    parallelSafe: false,
    cteOptimize: false,
    inputPorts: [{ index: 0, acceptedKinds: ["table"], possibleResultKinds: ["db_table"] }],
    outputPorts: [{ index: 0, acceptedKinds: [], possibleResultKinds: ["db_table"] }],
    schema: [],
    params: [
      { key: "code", kind: "string", required: true },
      {
        key: "language",
        kind: "enum",
        required: false,
        enumValues: ["javascript"],
        defaultValue: "javascript",
      },
    ],
  },
  [WorkflowTypes.Trigger]: {
    type: WorkflowTypes.Trigger,
    executeMode: "stream",
    parallelSafe: true,
    cteOptimize: false,
    inputPorts: [],
    outputPorts: [{ index: 0, acceptedKinds: [], possibleResultKinds: ["text"] }],
    schema: [{ name: "event_path", arrowType: "LargeUtf8", nullable: false, inputPortIndex: -1 }],
    params: [
      { key: "watchPath", kind: "string", required: true },
      { key: "events", kind: "array", required: false, defaultValue: ["create", "modify"] },
    ],
  },
});
