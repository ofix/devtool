import { inferColumns } from "../runtime/Dataset.js"

function splitCsvLine(line) {
  const cells = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        cells.push(cur)
        cur = ""
      } else {
        cur += ch
      }
    }
  }
  cells.push(cur)
  return cells
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return { rows: [], columns: [] }

  const header = splitCsvLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const row = {}
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = cells[c] !== undefined ? cells[c] : ""
    }
    rows.push(row)
  }
  return { rows, columns: inferColumns(rows, header) }
}

export default {
  type: "csvReader",
  meta: {
    label: "CSV Reader",
    icon: "IconDocument",
    color: "#3b82f6",
    category: "source",
    inputs: 0,
    outputs: 1,
    inputPortType: null,
    outputPortType: "table",
  },
  schema: [
    {
      field: "filePath",
      label: "文件",
      component: "file",
      extensions: ["csv"],
    },
    {
      field: "encoding",
      label: "编码",
      component: "select",
      options: [
        {
          label: "UTF-8",
          value: "utf-8",
        },
        {
          label: "GBK",
          value: "gbk",
        },
      ],
    },
  ],
  execute(_inputs, params, ctx) {
    return parseCsv(ctx.rawText || "")
  },
}
