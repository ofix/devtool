export class BatchWriter {
  constructor({ client, tableName, batchSize = 1000 }) {
    this.client = client;
    this.tableName = tableName;
    this.batchSize = batchSize;
    this.buffer = [];
    this.rowCount = 0;
    this.closed = false;
  }

  async flush() {
    if (!this.buffer.length) return;
    const batch = this.buffer;
    this.buffer = [];
    await this.client.insertBatch(this.tableName, batch);
    this.rowCount += batch.length;
  }

  async write(rows) {
    for (const r of rows) {
      this.buffer.push(r);
      if (this.buffer.length >= this.batchSize) await this.flush();
    }
  }

  async close() {
    if (this.closed) return { rowCount: this.rowCount };
    this.closed = true;
    await this.flush();
    return { rowCount: this.rowCount };
  }

  async abort() {
    this.closed = true;
    this.buffer = [];
  }
}
