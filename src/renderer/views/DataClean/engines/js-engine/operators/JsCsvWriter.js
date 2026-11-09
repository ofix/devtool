import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsCsvWriter extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) throw new Error("无输入数据")
    if (!params.filePath) throw new Error("请选择保存路径")

    const { filePath, includeHeader = true } = params

    // 核心修复 1：精准提取真实的流
    const streamDataset = inputData.payload.streamDataset

    // 保证每次运行都是覆盖模式，防止文件无限追加
    if (ctx.log) ctx.log(`[JsCsvWriter] 初始化写入文件: ${filePath}`)
    await window.api.dataClean.fs.writeFile(filePath, "")

    const generator = async function* (self) {
      let isFirstChunk = true

      // 核心修复 2：传入 streamDataset
      for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
        if (ctx.signal.aborted) break

        let csvString = ""
        if (isFirstChunk && includeHeader) {
          csvString += chunk.columns.map(c => c.name).join(",") + "\n"
          isFirstChunk = false
        }

        const rowsStr =
          chunk.rows
            .map(row => {
              return chunk.columns
                .map(c => {
                  let val = row[c.name]
                  if (val === null || val === undefined) return ""
                  let str = String(val)
                  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                    str = `"${str.replace(/"/g, '""')}"`
                  }
                  return str
                })
                .join(",")
            })
            .join("\n") + "\n"

        csvString += rowsStr

        // 核心修复 3：调用正确的接口 appendFile
        await window.api.dataClean.fs.appendFile(filePath, csvString)

        if (ctx.metrics) {
          ctx.metrics.mainRows += chunk.rows.length
        }
      }
    }

    // Writer 是终点，手动启动流
    const iterator = generator.bind(null, this)()
    await iterator.next()

    if (ctx.log) ctx.log(`[JsCsvWriter] 写入完成: ${filePath}`)

    return inputData // 透传给下游（如果有的话）
  }
}
