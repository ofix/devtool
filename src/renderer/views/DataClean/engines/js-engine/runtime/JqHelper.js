import initJq from "jq-wasm"

let jqInstance = null
let initPromise = null

/**
 * 初始化 JQ WASM 引擎（单例懒加载）
 */
async function getJqInstance() {
  if (jqInstance) return jqInstance

  if (!initPromise) {
    initPromise = (async () => {
      try {
        // 注意：这里的路径取决于你项目里 wasm 文件的存放位置
        // 需要确保 jq.wasm 放在了 public 目录下，或者通过 Vite 的 ?url 引入
        const wasmURL = new URL("jq.wasm", window.location.origin).href
        jqInstance = await initJq({ wasmURL })
        console.log("[JqHelper] WASM 引擎初始化成功")
        return jqInstance
      } catch (err) {
        console.error("[JqHelper] WASM 初始化失败", err)
        initPromise = null // 允许重试
        throw new Error(`JQ 引擎加载失败: ${err.message}`)
      }
    })()
  }

  return initPromise
}

/**
 * 执行 JQ 表达式
 * @param {any} inputJson 输入的 JSON 数据
 * @param {string} jqCode JQ 表达式，如 '.items[] | select(.price > 100)'
 * @returns {Promise<any>} 处理后的 JSON 数据
 */
export async function executeJq(inputJson, jqCode) {
  const jq = await getJqInstance()

  // 将输入序列化为 JSON 字符串
  const inputStr = JSON.stringify(inputJson)

  try {
    // jq.raw 返回的是 JSON 字符串结果
    const resultStr = await jq.raw(inputStr, jqCode)

    // 如果是纯字符串（比如 jq 的 -r 模式），直接返回
    if (!resultStr) return null

    // 尝试反序列化为对象
    try {
      return JSON.parse(resultStr)
    } catch (e) {
      // 如果解析失败（比如 JQ 输出了纯文本），直接返回字符串
      return resultStr
    }
  } catch (err) {
    throw new Error(`JQ 执行失败: ${err.message}`)
  }
}
