import { DATA_CATEGORY } from "../../constants/DataCategories.js"

export default {
  type: "jsonReader",
  meta: {
    label: "JSON Reader",
    icon: "IconFile",
    color: "#8b5cf6",
    category: "source",
    inputs: 0,
    outputs: 1,
    inputCategory: null,
    outputCategory: DATA_CATEGORY.JSON, // 强制 JSON
  },
  schema: [{ field: "filePath", label: "文件", component: "file", extensions: ["json"] }],
  execute(_inputs, params, ctx) {
    if (!params.filePath) throw new Error("未配置文件路径")
    const text = ctx && ctx.rawText ? ctx.rawText : ""

    if (!text || !text.trim()) {
      if (ctx?.log) ctx.log("[JSON Reader] 尚未读取到文件内容", "warn")
      return { dataCategory: DATA_CATEGORY.EMPTY, json: null }
    }

    try {
      // 基本的大文件保护（未来可替换为流式处理）
      let isTruncated = false
      let processText = text
      if (text.length > 50 * 1024 * 1024) {
        // 50MB
        throw new Error("文件超过 50MB，请先使用命令行工具过滤后再导入。")
      } else if (text.length > 4 * 1024 * 1024) {
        // 4MB
        // 降级截断：强行把前 4MB 当作合法 JSON 解析（实际场景需更严谨的截断策略）
        isTruncated = true
        processText = text.slice(0, 4 * 1024 * 1024)
        if (ctx?.log) ctx.log("[JSON Reader] 文件过大，仅展示前 4MB 数据", "warn")
      }

      const parsedData = JSON.parse(processText)
      // 供 UI 渲染的格式化文本（也做截断保护）
      const formattedText = JSON.stringify(parsedData, null, 2).slice(0, 5 * 1024 * 1024)

      if (ctx?.log)
        ctx.log(
          `[JSON Reader] 解析成功，共 ${Array.isArray(parsedData) ? parsedData.length : 1} 个对象`,
        )

      return {
        dataCategory: DATA_CATEGORY.JSON,
        json: parsedData,
        formattedText: formattedText,
        isTruncated: isTruncated,
        rows: [],
        columns: [], // 强制为空
      }
    } catch (err) {
      // 如果截断导致 JSON 解析失败，尝试回退到正则/简易解析，或者直接抛错
      throw new Error(`JSON 解析失败: ${err.message}`)
    }
  },
}
