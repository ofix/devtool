import StockManager from '../service/mini-stock/StockManager.js';
import { app } from 'electron';
import { join, dirname } from 'node:path';
import BaiduFinanceProvider from '../service/mini-stock/providers/BaiduFinanceProvider.js';
import { KlineStorage } from '../service/mini-stock/storage/KlineStorage.js';
import { KlineRecord } from '../service/mini-stock/storage/KlineRecord.js';
import { fileURLToPath } from 'url';
import path from "path";
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 关闭 GPU 硬件加速 → 永久消除告警
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

let manager = new StockManager();
let matches = await manager.searchLocalStock("柳");
for (let i = 0; i < matches.length; i++) {
    let stock = matches[i];
    console.log(`${stock.name},${stock.code},${stock.market}`);
}

console.log("找到股票数: ", matches.length);

// 加载本地模拟数据测试 KlineStorage 功能
const mockDataPath = join(__dirname, '../service/mini-stock/mock/002252.json');
let baiduProvider = new BaiduFinanceProvider();
let mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
let klineRecords = baiduProvider.parseDayKline(mockData);

let records = klineRecords.map(r => new KlineRecord(
    r.timestamp, r.open, r.high, r.low, r.close,
    r.preClose, r.turnoverratio, r.change, r.changeratio,
    r.volume, r.amount
));

console.log("K线记录数: ", records.length);

let dayKlinePath = path.join(__dirname, '../data/day');
// 初始化存储
const storage = new KlineStorage(dayKlinePath);
await storage.init();
try {
    await storage.batchAppend('002252', records);
    const queryRecords = await storage.query('002252', '2026-01-01', '2026-04-08');
    queryRecords.map(record => {
        console.log(record.toCSV());
    });
    console.log(`查询到 ${queryRecords.length} 条记录`);
} catch (e) {
    console.error("批量追加失败：", e);
}


let providers = [
    "eastmoney",
    "tencent",
    "yahoo",
    "baidu",
    "tushare",
    "sina",
];
// manager.setProvider('baidu');
// let data = manager.getKlines('603687', 'SH', 'day', '2020-01-01', '2026-04-04');

