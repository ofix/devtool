import { ResultSource } from "./contract/ResultSource.js";

export class DuckdbClient extends ResultSource {
  constructor(port) {
    super();
    this.port = port;
    this.pending = new Map();
    this.reqId = 0;
    this._unsub = port.onMessage(data => {
      const { id, result, error } = data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      error ? p.reject(new Error(error)) : p.resolve(result);
    });
  }

  _call(type, payload) {
    const id = ++this.reqId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port.postMessage({ id, type, ...payload });
    });
  }

  run(sql) {
    return this._call("run", { sql });
  }

  createTable(tableName, columns) {
    return this._call("createTable", { tableName, columns });
  }

  insertBatch(tableName, rows) {
    return this._call("insertBatch", { tableName, rows });
  }

  fetchWindow(tableName, offset, limit) {
    return this._call("fetchWindow", { tableName, offset, limit });
  }

  dropTable(tableName) {
    return this._call("dropTable", { tableName });
  }

  count(tableName) {
    return this._call("count", { tableName });
  }

  async *fetchAll(tableName, chunkSize = 1000) {
    const { total } = await this.count(tableName);
    for (let offset = 0; offset < total; offset += chunkSize) {
      const { rows } = await this.fetchWindow(tableName, offset, chunkSize);
      if (!rows.length) break;
      yield { rows };
    }
  }

  async release(tableName) {
    await this.dropTable(tableName);
  }
}
