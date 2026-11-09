const { utilityProcess, MessageChannelMain } = require("electron");
const path = require("node:path");

let duckdbWorker = null;
let sqliteWorker = null;

/**
 * 启动 DuckDB utilityProcess，把 port1 给它，port2 给渲染进程
 */
function setupDuckdbPort(mainWindow) {
  if (duckdbWorker) return duckdbWorker;

  duckdbWorker = utilityProcess.fork(path.join(__dirname, "duckdb-worker.js"));
  const { port1, port2 } = new MessageChannelMain();

  duckdbWorker.postMessage({ type: "init-port" }, [port1]);
  mainWindow.webContents.postMessage("duckdb-port", null, [port2]);

  duckdbWorker.on("exit", () => {
    duckdbWorker = null;
  });

  return duckdbWorker;
}

/**
 * 启动 SQLite utilityProcess
 */
function setupSqlitePort(mainWindow) {
  if (sqliteWorker) return sqliteWorker;

  sqliteWorker = utilityProcess.fork(path.join(__dirname, "sqlite-worker.js"));
  const { port1, port2 } = new MessageChannelMain();

  sqliteWorker.postMessage({ type: "init-port" }, [port1]);
  mainWindow.webContents.postMessage("sqlite-port", null, [port2]);

  sqliteWorker.on("exit", () => {
    sqliteWorker = null;
  });

  return sqliteWorker;
}

/**
 * 在窗口加载完成后调用
 */
function setupDbPorts(mainWindow) {
  mainWindow.webContents.on("did-finish-load", () => {
    setupDuckdbPort(mainWindow);
    setupSqlitePort(mainWindow);
  });
}

module.exports = { setupDbPorts, setupDuckdbPort, setupSqlitePort };
