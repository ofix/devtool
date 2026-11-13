import { SourceTypes } from "./source.js";
import { WorkflowTypes } from "./workflow.js";
import { TransformTypes } from "./transform.js";
import { BarrierTypes } from "./barrier.js";
import { WriterTypes } from "./writer.js";

export const OperatorType = Object.freeze({
  ...SourceTypes,
  ...WorkflowTypes,
  ...TransformTypes,
  ...BarrierTypes,
  ...WriterTypes,
});

export const OperatorTypeList = Object.freeze(Object.values(OperatorType));
export const DeprecatedOperatorTypes = Object.freeze([]);
