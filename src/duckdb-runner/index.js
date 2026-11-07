const duckdb = require("duckdb")
const readline = require("readline")

// 开启 DuckDB 内存实例（后续如果需要溢出，可改成文件路径，如 'data.duckdb'）
const db = new duckdb.Database(":memory:")

// 阻塞式等待主进程发来的 SQL 指令
const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
})

rl.on("line", line => {
  if (!line.trim()) return
  try {
    const { id, sql } = JSON.parse(line)

    db.all(sql, (err, rows) => {
      if (err) {
        process.stdout.write(JSON.stringify({ id, error: err.message }) + "\n")
      } else {
        // 返回结果。为了节省带宽，这里直接返回 rows
        process.stdout.write(JSON.stringify({ id, data: rows }) + "\n")
      }
    })
  } catch (e) {
    process.stdout.write(JSON.stringify({ id: -1, error: "指令解析失败: " + e.message }) + "\n")
  }
})

// 捕获错误，防止 Runner 崩溃导致主进程无响应
process.on("uncaughtException", err => {
  console.error("[DuckRunner] 未捕获异常:", err)
})
process.on("unhandledRejection", err => {
  console.error("[DuckRunner] Promise 异常:", err)
})

console.log("[DuckRunner] 引擎独立进程已启动，等待 SQL 指令...")
