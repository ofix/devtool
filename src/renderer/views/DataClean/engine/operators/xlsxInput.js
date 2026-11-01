export default {
  type: "xlsxInput",
  meta: {
    label: "XLSX Reader",
    icon: "IconExcel",
    color: "#16a34a",
    category: "source",
    inputs: 0,
    outputs: 1,
    inputPortType: null,
    outputPortType: "table",
  },
  schema: [
    { field: "filePath", label: "文件路径", component: "file", extensions: ["xlsx"] },
    { field: "configMode", label: "数据范围", component: "xlsxConfigDialog" },
  ],
  async execute(_inputs, params, ctx) {
    if (!params.filePath) throw new Error("未配置文件路径")

    if (!params.tasks || params.tasks.length === 0) {
      if (ctx?.log) ctx.log("未配置任何读取区域，直接返回空数据", "warn")
      return { rows: [], columns: [] }
    }

    const ExcelJS = (await import("exceljs")).default
    const workbook = new ExcelJS.Workbook()

    if (ctx?.log) ctx.log(`[XLSX Reader] 开始加载: ${params.filePath}`)

    try {
      const buffer = await window.api.dataClean.fs.readBuffer(params.filePath)
      await workbook.xlsx.load(buffer)
    } catch (err) {
      throw new Error(`加载 Excel 失败: ${err.message}`)
    }

    const allRows = []
    let masterColumns = []
    const hasHeader = params.hasHeader !== false
    const alignStrategy = params.alignStrategy || "name"

    for (const task of params.tasks) {
      const sheet = workbook.getWorksheet(task.sheetName)
      if (!sheet) {
        console.warn("找不到 Sheet:", task.sheetName)
        continue
      }

      const regions = task.regions || []
      const targetRegions = regions.length > 0 ? regions : [null]

      for (const region of targetRegions) {
        const bounds = parseA1Range(region, sheet)
        console.log(`解析区域: ${region}, 坐标:`, bounds)

        let localHeaders = []
        let rowCount = 0

        for (let r = bounds.startRow; r <= bounds.endRow; r++) {
          const row = sheet.getRow(r)
          const values = []
          const excelColNames = []

          for (let c = bounds.startCol; c <= bounds.endCol; c++) {
            const cell = row.getCell(c)
            let val = cell.value
            if (val && typeof val === "object") {
              if (val.richText) val = val.richText.map(t => t.text).join("")
              else if (val.formula) val = val.result
              else if (val instanceof Date) val = val.toISOString()
            }
            values.push(val)
            excelColNames.push(`${getExcelColumnLetter(c)}${bounds.startRow}`)
          }

          // 强行判断是否有真实数据
          const hasRealValue = values.some(v => v !== null && v !== undefined && v !== "")

          // 打印每一行的状态
          if (r < bounds.startRow + 5) {
            console.log(`行 ${r} | hasRealValue: ${hasRealValue} | 值:`, values)
          }

          if (!hasRealValue) continue
          rowCount++

          if (hasHeader && r === bounds.startRow) {
            localHeaders = values.map((v, i) => (v ? String(v) : excelColNames[i]))
            if (masterColumns.length === 0) {
              masterColumns = localHeaders.map(name => ({ name, type: "string" }))
            }
          } else {
            const colsToUse = hasHeader && localHeaders.length > 0 ? localHeaders : excelColNames
            const rowData = {}
            values.forEach((v, i) => {
              rowData[colsToUse[i]] = v
            })
            allRows.push(rowData)
          }
        }
      }
    }

    // 对齐逻辑
    let finalRows = []
    if (alignStrategy === "position") {
      const colNames = masterColumns.map(c => c.name)
      finalRows = allRows.map(row => {
        const newRow = {}
        const rowValues = Object.values(row)
        colNames.forEach((colName, i) => {
          newRow[colName] = rowValues[i] !== undefined ? rowValues[i] : null
        })
        return newRow
      })
    } else {
      const allKeys = new Set(masterColumns.map(c => c.name))
      allRows.forEach(row => {
        Object.keys(row).forEach(k => allKeys.add(k))
      })
      masterColumns = Array.from(allKeys).map(name => ({ name, type: "string" }))

      finalRows = allRows.map(row => {
        const newRow = {}
        masterColumns.forEach(col => {
          newRow[col.name] = row[col.name] !== undefined ? row[col.name] : null
        })
        return newRow
      })
    }

    if (ctx?.log) {
      ctx.log(`[XLSX Reader] 读取完成，共 ${finalRows.length} 行数据`)
    }

    return { rows: finalRows, columns: masterColumns }
  },
}

function parseA1Range(rangeStr, sheet) {
  if (!rangeStr) {
    return {
      startRow: 1,
      startCol: 1,
      endRow: sheet.actualRowCount,
      endCol: sheet.actualColumnCount,
    }
  }
  const parts = rangeStr.split(":")
  const start = parseCell(parts[0])
  const end = parts[1] ? parseCell(parts[1]) : start
  return { startRow: start.row, startCol: start.col, endRow: end.row, endCol: end.col }
}

function parseCell(cellStr) {
  const match = String(cellStr)
    .toUpperCase()
    .match(/^([A-Z]+)(\d+)$/)
  if (!match) return { row: 1, col: 1 }
  return { col: colToNumber(match[1]), row: parseInt(match[2], 10) }
}

function colToNumber(colStr) {
  let num = 0
  for (let i = 0; i < colStr.length; i++) {
    num = num * 26 + (colStr.charCodeAt(i) - 64)
  }
  return num
}

function getExcelColumnLetter(colNumber) {
  let result = ""
  let n = colNumber
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}
