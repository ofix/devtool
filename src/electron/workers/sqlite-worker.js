import { Database } from "better-sqlite3";

let db = null;

function ensureInit() {
  if (db) return;
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
}

function handleMessage(msg) {
  ensureInit();
  const { type, ...payload } = msg;

  switch (type) {
    case "run": {
      db.exec(payload.sql);
      let rowCount = 0;
      const m = /CREATE\s+TABLE\s+"?(\w+)"?\s+AS/i.exec(payload.sql);
      if (m) {
        const r = db.prepare(`SELECT COUNT(*) AS c FROM "${m[1]}"`).get();
        rowCount = Number(r?.c ?? 0);
      }
      return { rowCount };
    }

    case "createTable": {
      const cols = payload.columns.map(c => `"${c.name}" TEXT`).join(", ");
      db.exec(`CREATE TABLE "${payload.tableName}" (${cols})`);
      return {};
    }

    case "insertBatch": {
      const { tableName, rows } = payload;
      if (!rows?.length) return { inserted: 0 };
      const keys = Object.keys(rows[0]);
      const stmt = db.prepare(
        `INSERT INTO "${tableName}" (${keys.map(k => `"${k}"`).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
      );
      const insertMany = db.transaction(rs => {
        for (const r of rs) stmt.run(keys.map(k => r[k] ?? null));
      });
      insertMany(rows);
      return { inserted: rows.length };
    }

    case "fetchWindow": {
      const { tableName, offset, limit } = payload;
      const rows = db.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`).all(limit, offset);
      const total = db.prepare(`SELECT COUNT(*) AS c FROM "${tableName}"`).get()?.c ?? 0;
      return {
        rows,
        total: Number(total),
        hasMore: Number(offset) + rows.length < Number(total),
      };
    }

    case "dropTable": {
      db.exec(`DROP TABLE IF EXISTS "${payload.tableName}"`);
      return {};
    }

    case "count": {
      const r = db.prepare(`SELECT COUNT(*) AS c FROM "${payload.tableName}"`).get();
      return { total: Number(r?.c ?? 0) };
    }

    default:
      throw new Error(`未知消息类型: ${type}`);
  }
}

process.parentPort.once("message", e => {
  const [port] = e.ports;
  port.start();

  port.on("message", event => {
    const msg = event.data;
    const { id } = msg;
    try {
      const result = handleMessage(msg);
      port.postMessage({ id, result });
    } catch (err) {
      port.postMessage({ id, error: err.message });
    }
  });
});
