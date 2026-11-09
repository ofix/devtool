const metaJsonExtract = {
  type: "jsonExtract",
  label: "JSON Extract",
  icon: "IconExtract",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [{ field: "fields", label: "提取字段", component: "jsonFieldPicker" }],
}

const metaJsonFilter = {
  type: "jsonFilter",
  label: "JSON Filter",
  icon: "IconFilter",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "json",
  supportedEngines: ["js"],
  schema: [
    { field: "field", label: "过滤字段", component: "jsonFieldPicker" },
    {
      field: "operator",
      label: "操作符",
      component: "select",
      options: [
        { label: "等于", value: "=" },
        { label: "不等于", value: "!=" },
        { label: "大于", value: ">" },
        { label: "小于", value: "<" },
        { label: "包含", value: "CONTAINS" },
        { label: "为空", value: "IS NULL" },
      ],
    },
    { field: "value", label: "值", component: "input" },
  ],
}

const metaJsonFlattern = {
  type: "jsonFlatten",
  label: "JSON Flatten",
  icon: "IconLayers",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [{ field: "delimiter", label: "路径分隔符", component: "input", defaultValue: "." }],
}

const metaJsonUnnest = {
  type: "jsonUnnest",
  label: "JSON Unnest",
  icon: "IconExpand",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [{ field: "targetPath", label: "展开数组", component: "arrayPicker" }],
}

export const metaJsonUnpivot = {
  type: "jsonUnpivot",
  label: "JSON Unpivot",
  icon: "IconGrid",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [{ field: "keyName", label: "动态键列名", component: "input", defaultValue: "ip" }],
}

export const metaJqExpression = {
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

export const metaJson = {
  jsonExtract: metaJsonExtract,
  jsonFilter: metaJsonFilter,
  jsonFlatten: metaJsonFlattern,
  jsonUnnest: metaJsonUnnest,
  jsonUnpivot: metaJsonUnpivot,
  jqExpression: metaJqExpression,
}
