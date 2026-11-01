// RegexExtract 算子：正则提取命名捕获组
export default {
  type: "regexExtract",
  meta: {
    label: "RegexExtract",
    icon: "IconSearch",
    color: "#f59e0b",
    category: "parse",
    inputs: 1,
    outputs: 1,
    inputPortType: "table",
    outputPortType: "table",
  },
  schema: [
    { field: "sourceField", label: "源字段", component: "fieldSelect", multiple: false },
    { field: "regex", label: "正则表达式", component: "input", defaultValue: "(?<year>\\d{4})" },
  ],
  execute(inputs, params) {
    const data = inputs[0]
    if (!data || !data.rows) return { rows: [], columns: [] }

    const { sourceField, regex } = params
    if (!sourceField || !regex) return data

    let re
    try {
      re = new RegExp(regex)
    } catch (err) {
      throw new Error(`正则表达式无效: ${err.message}`)
    }

    // 获取所有命名捕获组
    const groupNames = []
    const match = regex.match(/\(\?<([^>]+)>/g)
    if (match) {
      for (const m of match) {
        groupNames.push(m.slice(3, -1))
      }
    }

    // 只有命名捕获组时才能识别输出列名
    const outCols = [
      ...data.columns,
      ...groupNames.map(name => ({ name: `regex_${name}`, type: "string" })),
    ]

    const outRows = data.rows.map(row => {
      const newRow = { ...row }
      const val = String(row[sourceField] || "")
      const matchResult = val.match(re)
      if (matchResult) {
        for (const name of groupNames) {
          newRow[`regex_${name}`] = matchResult.groups[name] || null
        }
      } else {
        for (const name of groupNames) {
          newRow[`regex_${name}`] = null
        }
      }
      return newRow
    })

    return { rows: outRows, columns: outCols }
  },
}
