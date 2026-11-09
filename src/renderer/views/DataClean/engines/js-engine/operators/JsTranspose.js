import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsTranspose extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null

    // 核心修复 1：从 inputData 提取真实的 streamDataset
    const streamDataset = inputData.payload.streamDataset

    let keepFields = params.keepFields || []
    let unpivotFields = params.unpivotFields || []
    if (unpivotFields.length === 0) return inputData

    const outCols = [
      ...keepFields.map(f => ({ name: f, type: "string" })),
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ]

    const columnMapping = {}
    keepFields.forEach(f => (columnMapping[f] = f))
    columnMapping["key"] = unpivotFields
    columnMapping["value"] = unpivotFields

    const generator = async function* (self) {
      // 核心修复 2：拉取正确的流
      for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
        let outRowsBuffer = []
        const MAX_BUFFER = 5000

        for (const row of chunk.rows) {
          const base = {}
          keepFields.forEach(f => (base[f] = row[f]))

          for (const uf of unpivotFields) {
            outRowsBuffer.push({
              ...base,
              key: uf,
              value: row[uf],
            })
            // 攒够一批就吐出，防止内存炸掉
            if (outRowsBuffer.length >= MAX_BUFFER) {
              yield { columns: outCols, rows: outRowsBuffer }
              outRowsBuffer = []
            }
          }
        }

        // 处理剩余未满 MAX_BUFFER 的数据
        if (outRowsBuffer.length > 0) {
          yield { columns: outCols, rows: outRowsBuffer }
        }
      }
    }

    return this.buildHandle(outCols, columnMapping, generator.bind(null, this))
  }
}
