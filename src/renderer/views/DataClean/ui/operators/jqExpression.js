export const meta = {
  type: "jqExpression",
  label: "JQ Expression",
  icon: "IconCode",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "json",
  supportedEngines: ["js"],
  schema: [{ field: "jqCode", label: "JQ 表达式", component: "jqEditor" }],
}
