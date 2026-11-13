import { ReadersContracts } from "./readers.js";
import { WorkflowContracts } from "./workflow.js";
import { TransformContracts } from "./transform.js";
import { BarrierContracts } from "./barrier.js";
import { WritersContracts } from "./writers.js";

export const OperatorContracts = Object.freeze({
  ...ReadersContracts,
  ...WorkflowContracts,
  ...TransformContracts,
  ...BarrierContracts,
  ...WritersContracts,
});
