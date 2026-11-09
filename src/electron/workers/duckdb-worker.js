const duckdb = require("duckdb");

let conn = null;

function ensureInit() {
  if (conn) return;
  const db = new duckdb.Database(":memory:");
  conn = db.connect();
}

function runSql(sql) {
  return new Promise((resolve, reject) => {
    conn.run(sql, err => (err ? reject(err) : resolve()));
  });
}

function queryAll(sql) {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function handleMessage(msg) {
  await ensureInit();
  const { type, ...payload } = msg;

  switch (type) {
    case "run": {
      await runSql(payload.sql);
      let rowCount = 0;
      const m = /CREATE\s+TABLE\s+"?(\w+)"?\s+AS/i.exec(payload.sql);
      if (m) {
        const rows = await queryAll(`SELECT COUNT(*) AS c FROM "${m[1]}"`);
        rowCount = Number(rows[0]?.c ?? 0);
      }
      return { rowCount };
    }

    case "createTable": {
      const cols = payload.columns.map(c => `"${c.name}" VARCHAR`).join(", ");
      await runSql(`CREATE TABLE "${payload.tableName}" (${cols})`);
      return {};
    }

    case "insertBatch": {
      const { tableName, rows } = payload;
      if (!rows?.length) return { inserted: 0 };
      const keys = Object.keys(rows[0]);
      const values = rows.map(r => `(${keys.map(k => sqlLiteral(r[k])).join(", ")})`).join(", ");
      await runSql(
        `INSERT INTO "${tableName}" (${keys.map(k => `"${k}"`).join(", ")}) VALUES ${values}`,
      );
      return { inserted: rows.length };
    }

    case "fetchWindow": {
      const { tableName, offset, limit } = payload;
      const rows = await queryAll(
        `SELECT * FROM "${tableName}" LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      );
      const [{ c: total }] = await queryAll(`SELECT COUNT(*) AS c FROM "${tableName}"`);
      return {
        rows,
        total: Number(total),
        hasMore: Number(offset) + rows.length < Number(total),
      };
    }

    case "dropTable": {
      await runSql(`DROP TABLE IF EXISTS "${payload.tableName}"`);
      return {};
    }

    case "count": {
      const rows = await queryAll(`SELECT COUNT(*) AS c FROM "${payload.tableName}"`);
      return { total: Number(rows[0]?.c ?? 0) };
    }

    default:
      throw new Error(`未知消息类型: ${type}`);
  }
}

process.parentPort.once("message", e => {
  const [port] = e.ports;
  port.start();

  port.on("message", async event => {
    const msg = event.data;
    const { id } = msg;
    try {
      const result = await handleMessage(msg);
      port.postMessage({ id, result });
    } catch (err) {
      port.postMessage({ id, error: err.message });
    }
  });
});
