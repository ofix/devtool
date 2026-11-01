// 修复：确保单选字段拿到的是字符串，并处理空值
export default {
  type: "sort",
  meta: {
    label: "Sort",
    icon: "IconSort",
    color: "#10b981",
    category: "prepare",
    inputs: 1,
    outputs: 1,
    inputPortType: "table",
    outputPortType: "table",
  },
  schema: [
    // 明确标记为单选
    { field: "field", label: "排序字段", component: "fieldSelect", multiple: false },
    {
      field: "order",
      label: "顺序",
      component: "select",
      options: [
        { label: "升序", value: "asc" },
        { label: "降序", value: "desc" },
      ],
    },
  ],
  execute(inputs, params) {
    const data = inputs[0]
    // 如果字段没选，或者上游没数据，直接透传
    if (!data || !data.rows) return data
    if (!params.field || Array.isArray(params.field)) return data

    const { field, order } = params
    const isAsc = order !== "desc"

    const sortedRows = [...data.rows].sort((a, b) => {
      let va = a[field]
      let vb = b[field]

      if (va == null) va = ""
      if (vb == null) vb = ""

      if (typeof va === "number" && typeof vb === "number") {
        return isAsc ? va - vb : vb - va
      }

      const strA = String(va)
      const strB = String(vb)
      return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA)
    })

    return { rows: sortedRows, columns: data.columns }
  },
}
