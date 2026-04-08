import StockManager from '../service/mini-stock/StockManager.js';
import { app } from 'electron';
import { join, dirname } from 'node:path';
import path from "path";
import fs from 'fs';
import BaiduFinanceProvider from '../service/mini-stock/providers/BaiduFinanceProvider.js';
import { KlineStorage } from '../service/mini-stock/storage/KlineStorage.js';
import { KlineRecord } from '../service/mini-stock/storage/KlineRecord.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 关闭 GPU 硬件加速 → 永久消除告警
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

async function testSearchStock() {
    let manager = new StockManager();
    await manager.init();
    let matches = await manager.searchLocalStock("柳");
    for (let i = 0; i < matches.length; i++) {
        let stock = matches[i];
        console.log(`${stock.name},${stock.code},${stock.market}`);
    }

    console.log("找到股票数: ", matches.length);
}


// 加载本地模拟数据测试 KlineStorage 功能
async function testKlineStorage() {
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
}

// 延迟工具（防封）
// 随机延迟 3000～7000 毫秒（3-7秒）
const randomSleep = () => {
    const ms = Math.floor(Math.random() * 4000) + 2000;
    return new Promise(resolve => setTimeout(resolve, ms));
};

// 请求重试工具
async function retry(fn, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === retries - 1) throw e;
            await sleep(1500 * (i + 1));
        }
    }
}


// 原生写入 CSV（无第三方依赖）
async function saveToCSV(ipoList, filePath) {
    try {
        // CSV 表头
        let csvContent = '';

        // 拼接数据行
        for (const item of ipoList) {
            const code = item.code || '';
            const market = item.market || '';
            const issuePrice = item.issuePrice || '';
            const issueDate = item.issueDate || '';

            csvContent += `${code},${market},${issuePrice},${issueDate}\n`;
        }

        // 原生写入文件
        await fs.writeFileSync(filePath, csvContent, 'utf8');
        console.log(`✅ CSV 已保存：${filePath}`);
    } catch (err) {
        console.error('💥 保存CSV失败：', err.message);
    }
}


async function testBaiduIPOInfo() {
    let manager = new StockManager();
    await manager.init();
    let shares = manager.getAllShares();
    let baiduProvider = new BaiduFinanceProvider();
    let ipoList = [];
    let total = shares.length;
    let progress = 0;
    let existIpoInfo = manager.getIPOInfo();
    let ipoFilePath = manager.getFilePaths().ipoInfo;
    let code = "";
    let errorShares = [];
    let fetchCount = 0;
    try {
        for (let i = 0; i < shares.length; i++) {
            let share = shares[i];
            code = share.code;
            progress += 1;
            if (existIpoInfo.has(code)) {
                let ipo = JSON.parse(JSON.stringify(existIpoInfo.get(code)));
                ipo.market = share.market;
                ipo.code = code;
                ipoList.push(ipo);
                console.log(`[缓存][${progress}/${total}]${ipo.code},${ipo.market},${ipo.issuePrice},${ipo.issueDate}`);
            } else {
                try {
                    let ipo = await baiduProvider.getIPOInfo(code, share.market);
                    ipoList.push(ipo);
                    console.log(`[${progress}/${total}]${ipo.code},${ipo.market},${ipo.issuePrice},${ipo.issueDate}`);
                    await randomSleep(); // 防封间隔
                    fetchCount += 1;
                    if (fetchCount >= 5) {
                        await saveToCSV(ipoList, ipoFilePath);
                        fetchCount = 0;
                    }
                } catch (e) {
                    errorShares.push(share);
                    progress += 1;
                    console.error(`股票 ${share.code}, ${share.name} 获取失败`);
                }
            }
        }
        if (errorShares.length > 0) {
            console.log("-------------- 无法获取的股票 -------------");
            for (let i = 0; i < errorShares.length; i++) {
                let share = errorShares[i];
                console.log(`${share.code},${share.name}`);
            }
        }

        await saveToCSV(ipoList, ipoFilePath);
    } catch (e) {
        // 保存到CSV文件中

        await saveToCSV(ipoList, ipoFilePath);
    }
}

async function testEastMoneyBkList() {
    let manager = new StockManager();
    await manager.init();
    manager.setProvider('eastmoney');
    let bkMenu = manager.getBkMenu();
    let concepts = bkMenu.concepts;
    let progress = 1;
    for (let concept of concepts) {
        try {
            let result = await manager.getBk(concept);
            let response = JSON.stringify(result.data);
            if (result.cache) {
                console.log(`[缓存][${progress}/${concepts.length}][${response.shares.length}]:${response}`);
            } else {
                console.log(`[${progress}/${concepts.length}][${response.shares.length}]:${response}`);
            }
            await manager.saveBkList('concept');
            progress += 1;
            await randomSleep(); // 防封间隔
        } catch (e) {
            console.error(e.message);
            await randomSleep(); // 防封间隔            
        }
    }
}

// testBaiduIPOInfo();
testEastMoneyBkList();

// let providers = [
//     "eastmoney",
//     "tencent",
//     "yahoo",
//     "baidu",
//     "tushare",
//     "sina",
// ];
// manager.setProvider('baidu');
// let data = manager.getKlines('603687', 'SH', 'day', '2020-01-01', '2026-04-04');

