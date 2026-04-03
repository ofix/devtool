import StockManager from '../service/mini-stock/StockManager.js';
import { app } from 'electron';


// 关闭 GPU 硬件加速 → 永久消除告警
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

let manager = new StockManager();
let matches = await manager.searchLocalStock("大");
for (let i = 0; i < matches.length; i++) {
    let stock = matches[i];
    console.log(`${stock.name},${stock.code},${stock.market}`);
}

console.log("找到股票数: ", matches.length);

let providers = [
    "eastmoney",
    "tencent",
    "yahoo",
    "baidu",
    "tushare",
    "sina",
];

manager.setProvider('baidu');
let data = manager.getKlines('603687', 'SH', 'day', '2020-01-01', '2026-04-04');

