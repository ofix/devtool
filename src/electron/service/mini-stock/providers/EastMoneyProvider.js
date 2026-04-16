import axios from 'axios';
import fs from 'fs';
import path from "path";
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import Utils from "../../../core/Utils.js";
import DataProvider from "./DataProvider.js"

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class EastMoneyProvider extends DataProvider {
    constructor() {
        super();
        this.baseURL = 'https://push2.eastmoney.com/api/qt';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://quote.eastmoney.com/'
        };
        this.bkFilePath = path.join(__dirname, '../../../data/easymoney_bklist.json');

        this.supportIndexes = {
            // 沪市指数 → jp0
            "上证指数": { secid: "1.000001", cb: "miniquotechart_jp0" },
            "上证50": { secid: "1.000016", cb: "miniquotechart_jp0" },
            "中证500": { secid: "1.000905", cb: "miniquotechart_jp0" },
            "科创50": { secid: "1.000688", cb: "miniquotechart_jp0" },
            // 深市指数 → jp1
            "深证成指": { secid: "0.399001", cb: "miniquotechart_jp1" },
            "创业板指": { secid: "0.399006", cb: "miniquotechart_jp1" },
            "沪深300": { secid: "0.000300", cb: "miniquotechart_jp1" },
        };
    }

    /**
     * 获取多只股票行情最新报价
     * @param {Array} shares 多只股票
     */
    async getQuote(shares) {
       
    }

    /**
     * 获取指数分时数据，统一输出东方财富标准结构
     * @param {string} indexName 指数名称
     * @param {string} ndays 分时数据的天数，默认为1，表示获取当天的分时数据，5表示获取5日分时数据
     * @returns 标准分时数据
     */
    async getIndexMinuteData (indexName, ndays = 1) {
        const index = this.supportIndexes[indexName];
        if (!index) {
            throw new Error(`不支持的指数：${indexName}`);
        }

        const { secid, cb } = index;

        const res = await axios.get('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
            params: {
                fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f17',
                fields2: 'f51,f52,f53,f54,f55,f58',
                dect: 1,
                mpi: 1000,
                ut: 'bd1d9ddb04089700cf9c27f6f7426281',
                secid,
                ndays: 1,
                iscr: 0,
                iscca: 0,
                wbp2u: '1849325530509956|0|1|0|web',
                cb,
                dates: date
            },
            timeout: 10000
        });

        // 解析 JSONP
        const jsonStr = res.data.replace(/^[a-zA-Z0-9_]+\(/, '').replace(/\);$/, '');
        const result = JSON.parse(jsonStr);

        if (result.rc !== 0) {
            throw new Error(`接口异常，返回码：${result.rc}`);
        }

        // 统一输出：完全对齐东方财富原始分时结构
        return {
            code: result.data.code,
            name: result.data.name,
            date: date,
            preClose: result.data.preClose,
            size: result.data.trendsTotal,
            data: result.data.trends, // 标准东财分时数组
        };
    }

    /**
     * 获取股票分时数据
     * @param {string} code 股票代码
     * @param {string} name 股票名称
     * @param {string} market 股票市场：sh/sz
     * @param {number} ndays 获取分时数据的天数，默认为1，表示获取当天的分时数据，5表示获取5日分时数据
     */
    async getShareMinuteData (code, name, market, ndays = 1) {

    }

    /**
     * 获取 东方财富 涨幅榜/跌幅榜 前N只股票
     * @param {number} n - 获取股票数量
     * @param {string} order - top=涨幅榜, bottom=跌幅榜
     * @returns {Promise<Array>} 带实时行情的排行榜数据
     */
    async getShareRankList (n, order = "top") {

    }



    #getHeaders () {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000000000);

        return {
            // 'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept': '*/*',
            // 'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            // 'Accept-Language': 'zh-CN,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6',
            // 'Accept-Language': 'zh-CN,zh;q=0.9',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
            // 'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            // 关键：Cookie 不要写死！写死必封！我给你保留基础段 + 动态化
            // 'Cookie': 'qgqp_b_id=' + this.#randomString(32) + '; st_pvi=' + this.#randomNum(16) + '; st_sp=' + new Date().toISOString().slice(0, 10),
            // 'Cookie': 'qgqp_b_id=5f053c5d572b53952f1e12f7cb7cb429; st_si=43483327739694; st_asi=delete; st_nvi=6bMILVkNh0lkOLpJN1DEu8add; nid18=0408302865ac0131bca852242db06837; nid18_create_time=1775713036255; gviem=vQ6rKjHxBsJ0r_lVfeygi43d8; gviem_create_time=1775713036256; st_pvi=58524495943449; st_sp=2026-04-09%2013%3A37%3A14; st_inirUrl=; st_sn=2; st_psi=20260409133840394-113200301321-7207262247',
            // 'Cookie': 'qgqp_b_id=886ba22199663e93eb0113379a4305a8; st_nvi=ulCdncsaewxKeNZhq6bBR70e0; st_si=74919616369452; st_pvi=10901482434489; st_sp=2025-11-23%2009%3A52%3A22; st_inirUrl=https%3A%2F%2Fwww.baidu.com%2Flink; st_sn=1; st_psi=20260409222636241-113200301321-1178857012; st_asi=delete; nid18=0c5cd9c46a95566518e33e5332d1c75c; nid18_create_time=1775744796824; gviem=3ShOiHInJDywdwremiWwU4306; gviem_create_time=1775744796824',
            // 'Cookie': 'qgqp_b_id=27a950c2fe1b0653cecb79a9ccd77c91; st_nvi=QGXlBcGxvWDPSXzWQB1gLd861; nid18=09b103ec53d128b3b00c42897ed54abd; nid18_create_time=1769475151903; gviem=yn_xAEKwXkLVQMC6EvNmrf4fa; gviem_create_time=1769475151903; st_si=67985322770793; st_pvi=66081628292100; st_sp=2026-04-08%2017%3A20%3A45',
            // 'Cookie': 'st_inirUrl=; st_psi=20260410200032853-113200301321-2696679963; st_pvi=61458735512065; st_sn=3; st_sp=2026-04-10%2020%3A00%3A16; gviem=mKu3g-nWNmFL5sU870-4x0aa1; gviem_create_time=1775822417490; nid18=0e8395724eeeb47c3eb8bf817495778f; nid18_create_time=1775822417490; qgqp_b_id=009fd27f95438f644f06c67d1affb630; st_asi=delete; st_nvi=p6hlvbWu_s8tISq564Zyt601f; st_si=86944945694129',
            'Cookie': 'qgqp_b_id=870947b6a314f95b131c3316de84baba; st_nvi=vM3HWm4oPuDcXbAvFyuAD64f3; nid18=0735a491c64cc7a7c8e84431e957007a; nid18_create_time=1775921026787; gviem=_Gb0n0wTkho1xwpQJhUeFaecf; gviem_create_time=1775921026787; st_si=95669752779587; rskey=54rmXWXFaTG8vT0k3MkdKdkxvVjZUa1JpQT09qa8iQ; p_origin=https%3A%2F%2Fpassport2.eastmoney.com; mtp=1; ct=rx2UZ4RY33xSruRCfPq1Zw0ZLVB6fRM4bsJHauQOC7GyARCqDI2iZ2eBYdD31HKAtUEHAAENedu33DKt4W8HV12fvnpwC_WUkspn3f5jRyYiN9ava7tpj34-kVYMc2hWe8Ki5Q9R2S66EizaXIZRT8Bonwbp5z3Sh_ZJsWGuEEs; ut=FobyicMgeV6apd9R5fwVynY4OvVGiqZyc26aSkjEyJApE0ftD17LN7-eEUF3fiMsWQbUswFr0aSqQMwaS30aInPbWYxWMn4zDHAN84tKCyNzDQZ4YPihqd16dx_9Es21Cqhm4zR5yAh__i9B5xqMJxniEG9IKx_nXe_a_Y5AxY7xWfhqwcMsxLpWKzV-pw-Ke-MY0hc-UxI1hftDO2jrBDnhpCGRosActTMZ2W7s_ntdz12nYWjYnwj1ozEh2jXzfWjpVT7AaDoXsJIhYSKHpi-MGXeQFPrz; pi=7699345506358278%3Bm7699345506358278%3B%E4%B8%87%E9%A9%AC%E5%A5%94%E8%85%BE2026888%3B0q%2FU%2BNDfL65MF7DKMCrjVXMPDxdyfbNTHgysHDSjD6N1JVEK1xmoRYc4XrrqIhpL%2BIPekUHJ5wsG6u1SezL8MHdQ1lL%2BHhVpfJhKm3Z0VCh9ImpndEvvIRg1lid5H3iEQO3X03kxeqvjEzBquwa4V5OzXQrWnzWDS0eC2pCc0MSgf%2FEVjnYWL%2BrI9MARozW75FL%2BA4Ek%3BPq15wzZDPJeim5RWe%2B%2FxriTjmKqvqheUIXW6k0hKtQWjeL61NoRe7kZKaZ76gdWtddWS%2BGKsgf9PRF1hxWVhERWAamWnNeZul2kBsvb2nmo3FC%2Bk%2F28%2B5FpLLedgey7AbsST8yFHzjo0pkeq5rWt1HOY%2B%2BJJ0w%3D%3D; uidal=7699345506358278%e4%b8%87%e9%a9%ac%e5%a5%94%e8%85%be2026888; sid=132771940; vtpst=|; st_asi=delete; st_pvi=59156212850357; st_sp=2026-04-11%2023%3A23%3A46; st_inirUrl=https%3A%2F%2Fwww.eastmoney.com%2F; st_sn=8; st_psi=2026041211243737-113200301321-3670181932',
            // 'Cookie': 'st_inirUrl=https%3A%2F%2Fbank.eastmoney.com%2F; st_psi=20260411074111653-113200301321-2891455114; st_pvi=61458735512065; st_sn=7; st_sp=2026-04-10%2020%3A00%3A16; st_asi=delete; st_si=64623006336055; gviem=mKu3g-nWNmFL5sU870-4x0aa1; gviem_create_time=1775822417490; nid18=0e8395724eeeb47c3eb8bf817495778f; nid18_create_time=1775822417490; qgqp_b_id=009fd27f95438f644f06c67d1affb630; st_nvi=p6hlvbWu_s8tISq564Zyt601f',
            // 'Cookie': 'qgqp_b_id=870947b6a314f95b131c3316de84baba; st_nvi=zQ6WuIDUSQ5Pynf9xPFoM3fad; st_si=71252010261157; st_asi=delete; nid18=0735a491c64cc7a7c8e84431e957007a; nid18_create_time=1775901278977; gviem=f27oSiOu5_P8xP9Gc5R4f544f; gviem_create_time=1775901278977; fullscreengg=1; fullscreengg2=1; wsc_checkuser_ok=1; st_pvi=84531075945310; st_sp=2026-04-11%2017%3A54%3A38; st_inirUrl=https%3A%2F%2Fwww.eastmoney.com%2F; st_sn=3; st_psi=20260411175455527-113200301321-5840294214',
            'Referer': 'https://quote.eastmoney.com/center/gridlist.html',
            'Host': 'push2.eastmoney.com',
            // 'sec-ch-ua': '"Chromium";v="130","Not=A?Brand";v="99"',
            // 'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126"',
            'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
            'sec-ch-ua-mobile': '?0',
            // 'sec-ch-ua-platform': '"Linux"',
            'sec-ch-ua-platform': '"macOS"',
            'Priority': 'u=1, i',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            // 'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.251 Safari/537.36',
            // 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            // 'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.5005.200 Safari/537.36 Qaxbrowser',
            // 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
            // 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15',
            // 'X-Requested-With': 'XMLHttpRequest',
            // 'cb': `jQuery3710${Math.random().toString().slice(2, 18)}_${timestamp}`,
            // '_': timestamp,
            // 'ut': 'fa5fd1943c7b386f172d6893dbfba10b',
        };
    }

    // 辅助：生成随机字符串（防 Cookie 固定风控）
    #randomString (len) {
        const chars = 'abcdef1234567890';
        let str = '';
        for (let i = 0; i < len; i++) {
            str += chars[Math.floor(Math.random() * chars.length)];
        }
        return str;
    }

    // 辅助：生成随机数字串
    #randomNum (len) {
        let num = '';
        for (let i = 0; i < len; i++) {
            num += Math.floor(Math.random() * 10);
        }
        return num;
    }

    /**
     * 获取东方财富 涨幅榜/跌幅榜 前N只股票
     * @param {number} n - 获取股票数量
     * @param {string} order - top=涨幅榜, bottom=跌幅榜
     * @returns {Promise<Array>} 股票列表 [代码, 名称, 涨幅, 现价, ...]
     */
    async getTopShares (n, order = "top") {
        try {
            const baseUrl = "https://push2.eastmoney.com/api/qt/clist/get";
            const ts = Date.now();

            const params = new URLSearchParams({
                fid: "f3",
                po: order === "top" ? "1" : "0",
                pz: n,
                np: 1,
                fltt: 2,
                invt: 1,
                fields: "f12,f14,f3,f2,f6,f10,f15,f16,f17",
                cb: `jQuery3710${Math.random().toString().slice(2, 18)}_${ts}`,
                _: ts,
            });

            const url = `${baseUrl}?${params.toString()}`;

            // 使用优化后的 Header
            const res = await fetch(url, {
                headers: this.#getHeaders(),
                method: "GET",
                mode: "cors",
                credentials: "include",
            });

            let text = await res.text();
            text = text.replace(/^jQuery\d+_\d+\(/, "").replace(/\);$/, "");
            const data = JSON.parse(text);

            if (data?.rc !== 0 || !data?.data?.diff) return [];

            return data.data.diff.map(item => ({
                code: item.f12,
                name: item.f14,
                changePercent: item.f3, // 涨跌幅
                open: item.f17,
                high: item.f15,
                low: item.f16,
                price: item.f2,
                volume: item.f5,
                amount: item.f6
            }));

        } catch (err) {
            console.error("获取失败：", err);
            return [];
        }
    }

    async getStockList () {
        try {
            const url = "https://push2.eastmoney.com/api/qt/clist/get";
            const allStocks = [];
            const allShares = [];
            let currentPage = 20;
            const pageSize = 100; // 每页数量
            let hasMore = true;

            while (hasMore) {
                const params = {
                    'np': '1',
                    'fltt': '1',
                    'invt': '2',
                    'fs': 'm:0+t:6+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2,m:0+t:81+s:262144+f:!2', // 沪深京A股
                    'fields': 'f12,f13,f14,f1,f2,f4,f3,f152,f5,f6,f7,f15,f18,f16,f17,f10,f8,f9,f23', // 更多字段
                    'fid': 'f12',
                    'pn': currentPage,
                    'pz': pageSize,
                    'po': '1',
                    'dect': '1',
                    'wbp2u': '|0|0|0|web'
                };

                console.log(`正在获取第 ${currentPage} 页数据...`);
                const response = await axios.get(url, {
                    timeout: 10000, // 超时
                    headers: this.#getHeaders(),
                    params
                });

                if (response.data && response.data.data && response.data.data.diff) {
                    const stocks = response.data.data.diff;

                    if (stocks.length === 0) {
                        hasMore = false;
                        break;
                    }
                    for (let i = 0; i < stocks.length; i++) {
                        let stock = stocks[i];
                        let line = stock.f12 + "," + stock.f14 + "," + stock.f13 + "," + this.getMarketName(stock.f13);
                        console.log(line);;
                        allShares.push(line);
                    }

                    const filePath = await Utils.ensureStockListFile();
                    fs.writeFile(filePath, allShares.join('\n'), 'utf8', (err) => {
                        if (err) {
                            console.error('写入失败:', err);
                        }
                    });

                    // 格式化股票数据
                    const formattedStocks = stocks.map(stock => ({
                        code: stock.f12,           // 股票代码
                        name: stock.f14,           // 股票名称
                        market: stock.f13,         // 市场代码
                        marketType: this.getMarketName(stock.f13), // 市场名称
                        currentPrice: stock.f2,    // 最新价
                        changePercent: stock.f3,   // 涨跌幅
                        changeAmount: stock.f4,    // 涨跌额
                        volume: stock.f5,          // 成交量
                        amount: stock.f6,          // 成交额
                        amplitude: stock.f15,      // 振幅
                        open: stock.f18,           // 今开
                        high: stock.f16,           // 最高
                        low: stock.f17,            // 最低
                    }));

                    allStocks.push(...formattedStocks);

                    // 检查是否还有更多数据
                    const totalCount = response.data.data.total || 0;
                    if (allStocks.length >= totalCount) {
                        hasMore = false;
                    } else {
                        currentPage++;
                    }
                    await this.randomSleep();
                    console.log(`已获取 ${allStocks.length} 只股票...`);
                } else {
                    hasMore = false;
                }
            }

            return allStocks;
        } catch (error) {
            console.error('获取股票列表失败:', error);
            throw error;
        }
    }

    // 获取市场名称
    getMarketName (marketCode) {
        const marketMap = {
            '0': '深圳',
            '1': '上海',
            '2': '北京'
        };
        return marketMap[marketCode] || '未知';
    }

    async getKline (code, market, period, startDate, endDate) {
        try {
            // 转换周期格式
            const klt = this.convertPeriod(period);
            const secid = this.getSecId(code, market);

            const response = await axios.get(`${this.baseURL}/stock/kline/get`, {
                params: {
                    secid: secid,
                    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
                    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
                    klt: klt,
                    fqt: 1, // 复权类型：0不复权，1前复权，2后复权
                    beg: startDate,
                    end: endDate
                },
                headers: this.headers
            });
            console.log(response.data);
            return this.parseKLineData(response.data);
        } catch (error) {
            console.error('EastMoneyProvider getKLineData error:', error);
            throw error;
        }
    }

    // 分时数据接口
    async getMinuteData (code, market) {
        try {
            const secid = this.getSecId(code, market);
            // 东方财富分时数据接口
            const response = await axios.get('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
                params: {
                    secid: secid,
                    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
                    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
                    ut: 'fa5fd1943c7b386f172d6893dbfba10b',
                    ndays: 1,  // 获取1天的分时数据
                    cb: 'callback'
                },
                headers: this.headers
            });

            // 处理返回的JSONP格式
            let jsonStr = response.data;
            if (jsonStr.includes('callback(')) {
                jsonStr = jsonStr.replace(/^\w+\(/, '').replace(/\);$/, '');
            }
            const data = JSON.parse(jsonStr).data;

            if (!data || !data.trends) return null;

            // 解析分时数据
            const minuteData = data.trends.map(item => {
                const fields = item.split(',');
                return {
                    time: fields[0],      // 时间 0930, 0931...
                    price: parseFloat(fields[1]),   // 最新价
                    avgPrice: parseFloat(fields[2]), // 均价
                    volume: parseFloat(fields[5]),   // 成交量
                    amount: parseFloat(fields[6])    // 成交额
                };
            });

            return minuteData;
        } catch (error) {
            console.error('getMinuteData error:', error);
            return null;
        }
    }


    // 获取历史分时数据（支持多天）
    async getHistoryMinuteData (code, market, days = 5) {
        try {
            const secid = this.getSecId(code, market);
            const response = await axios.get('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
                params: {
                    secid: secid,
                    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
                    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
                    ut: 'fa5fd1943c7b386f172d6893dbfba10b',
                    ndays: days,  // 获取最近N天的分时数据
                    cb: 'callback'
                }
            });

            // 类似上面处理数据...
        } catch (error) {
            console.error('getHistoryMinuteData error:', error);
            return null;
        }
    }

    // 获取5日分时数据（用于5日分时图）
    async getFiveDayMinuteData (code, market) {
        try {
            const secid = this.getSecId(code, market);
            const response = await axios.get('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
                params: {
                    secid: secid,
                    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
                    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
                    ut: 'fa5fd1943c7b386f172d6893dbfba10b',
                    ndays: 5,  // 5天
                    isCR: '1',  // 是否包含当前交易日
                    cb: 'callback'
                }
            });

            // 处理返回数据...
        } catch (error) {
            console.error('getFiveDayMinuteData error:', error);
            return null;
        }
    }

    /**
   * 获取分时数据
   * @param {string} code - 股票代码
   * @param {string} market - 市场 (sh/sz)
   * @param {number} days - 获取天数，默认1天
   * @returns {Promise<object>} 处理后的分时数据
   */
    async getMinuteData (code, market, days = 1) {
        try {
            const secid = this.getSecId(code, market);
            const url = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get';

            const response = await axios.get(url, {
                params: {
                    secid: secid,
                    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
                    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
                    ut: 'fa5fd1943c7b386f172d6893dbfba10b',
                    ndays: days,
                    cb: 'callback'
                },
                headers: this.headers
            });

            // 解析JSONP响应
            const jsonData = this.parseJSONPResponse(response.data);
            if (!jsonData || !jsonData.data) {
                return null;
            }

            // 处理分时数据
            const processedData = this.processMinuteData(jsonData.data, code, market);

            return processedData;
        } catch (error) {
            console.error('EastMoneyProvider getMinuteData error:', error);
            return null;
        }
    }

    /**
     * 获取5日分时数据
     * @param {string} code - 股票代码
     * @param {string} market - 市场 (sh/sz)
     * @returns {Promise<object>} 处理后的分时数据
     */
    async getFiveDayMinuteData (code, market) {
        return this.getMinuteData(code, market, 5);
    }

    /**
     * 批量获取多个股票的分时数据
     * @param {Array} stocks - 股票列表 [{code, market}, ...]
     * @param {number} days - 获取天数
     * @returns {Promise<Array>} 分时数据列表
     */
    async batchGetMinuteData (stocks, days = 1) {
        const promises = stocks.map(stock =>
            this.getMinuteData(stock.code, stock.market, days)
        );

        const results = await Promise.allSettled(promises);

        return results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);
    }

    async searchStock (keyword) {
        try {
            const response = await axios.get('https://searchapi.eastmoney.com/api/suggest/get', {
                params: {
                    input: keyword,
                    type: '14',
                    count: 20
                }
            });

            const stocks = response.data?.QuotationCodeTable?.Data || [];
            return stocks.map(stock => ({
                code: stock.Code,
                name: stock.Name,
                market: this.detectMarket(stock.Market),
                type: stock.Type,
                pinyin: stock.PY
            }));
        } catch (error) {
            console.error('EastMoneyProvider searchStock error:', error);
            return [];
        }
    }

    convertPeriod (period) {
        const periodMap = {
            'day': 101,
            'week': 102,
            'month': 103,
            'year': 104,
            'minute': 1,    // 1分钟
            '5minute': 5    // 5分钟
        };
        return periodMap[period] || 101;
    }

    getSecId (code, market) {
        if (market === 'a') {
            // 判断上海还是深圳
            if (code.startsWith('6')) {
                return `1.${code}`; // 上海
            } else {
                return `0.${code}`; // 深圳
            }
        }
        return code;
    }

    detectMarket (marketCode) {
        const marketMap = {
            '0': 'a',   // 深圳
            '1': 'a',   // 上海
            '2': 'hk',  // 港股
            '3': 'us'   // 美股
        };
        return marketMap[marketCode] || 'a';
    }

    parseKLineData (data) {
        const klines = data?.data?.klines || [];
        return klines.map(line => {
            const items = line.split(',');
            return {
                date: items[0],
                open: parseFloat(items[1]),
                high: parseFloat(items[3]),
                low: parseFloat(items[4]),
                close: parseFloat(items[2]),
                amount: parseFloat(items[6]),
                volume: parseFloat(items[5]),
                change: parseFloat(items[9]),        // 涨跌额
                changePercent: parseFloat(items[8]), // 涨跌幅
                // amplitude: parseFloat(items[7]),  // 振幅
                // turnover: parseFloat(items[10])   // 换手率
            };
        });
    }

    /**
    * 解析JSONP格式的响应数据
    * @param {string} jsonpData - JSONP格式的字符串
    * @returns {object} 解析后的JSON对象
    */
    parseJSONPResponse (jsonpData) {
        try {
            let jsonStr = jsonpData;
            // 匹配 callback({...}) 格式
            const callbackMatch = jsonStr.match(/callback\((.*)\);?$/);
            if (callbackMatch) {
                jsonStr = callbackMatch[1];
            }
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('parseJSONPResponse error:', error);
            return null;
        }
    }

    /**
     * 解析单条分时数据字符串
     * @param {string} trendStr - 分时数据字符串，格式：时间,价格,均价,涨跌额,涨跌幅,成交量,成交额,换手率
     * @returns {object} 解析后的分时数据对象
     */
    parseMinuteDataItem (trendStr) {
        const fields = trendStr.split(',');
        return {
            time: fields[0],                      // 时间点 (如: 0930, 0931...)
            price: parseFloat(fields[1]),         // 最新价
            avgPrice: parseFloat(fields[2]),      // 均价
            change: parseFloat(fields[3]),        // 涨跌额
            changePercent: parseFloat(fields[4]), // 涨跌幅
            volume: parseFloat(fields[5]),        // 成交量
            amount: parseFloat(fields[6]),        // 成交额
            turnover: parseFloat(fields[7])       // 换手率 (如果有)
        };
    }

    /**
     * 处理分时数据，将原始数据转换为结构化数据
     * @param {object} rawData - 接口返回的原始数据
     * @param {string} code - 股票代码
     * @param {string} market - 市场
     * @returns {object} 结构化的分时数据
     */
    processMinuteData (rawData, code, market) {
        if (!rawData || !rawData.trends) {
            return null;
        }

        // 解析所有分时数据点
        const minuteDataList = rawData.trends.map(trend =>
            this.parseMinuteDataItem(trend)
        );

        // 返回结构化的分时数据
        return {
            code: code,
            market: market,
            name: rawData.name || '',
            date: rawData.date || '',           // 数据日期
            preClose: rawData.preClose || 0,     // 昨收价
            totalVolume: rawData.volume || 0,    // 总成交量
            totalAmount: rawData.amount || 0,    // 总成交额
            minuteData: minuteDataList,          // 分时数据数组
            // 统计数据
            statistics: {
                maxPrice: Math.max(...minuteDataList.map(d => d.price)),
                minPrice: Math.min(...minuteDataList.map(d => d.price)),
                avgPrice: minuteDataList.reduce((sum, d) => sum + d.price, 0) / minuteDataList.length,
                totalVolume: minuteDataList.reduce((sum, d) => sum + d.volume, 0),
                totalAmount: minuteDataList.reduce((sum, d) => sum + d.amount, 0)
            }
        };
    }

    // 东方财富接口爬取，超过1分钟10次请求容易封IP，增加随机睡眠时间
    // 可以考虑登录东方财富账号获取cookie后使用cookie请求，增加请求成功率
    randomSleep (base) {
        let baseMs = base || 4000;
        const ms = Math.floor(Math.random() * 3000) + baseMs;
        console.log("睡眠 ", ms / 1000, '秒');
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    /**
     * 爬取板块数据（完整分页拉取）
     * @param {Object} payload { type, code, name }
     * @returns {Object} { code, name, shares: [{code,name}] }
     * @example 参考页面
     * https://quote.eastmoney.com/center/gridlist.html#boards2-90.BK0590
     */
    async getBk (payload) {
        const result = {
            code: payload.code,
            name: payload.name,
            error: false,
            shares: []
        };

        const ctx = {
            payload: payload, // 请求参数对象
            maxRetries: 2, // 请求错误页最大请求次数
            errorPageRetries: 0, // 请求错误页已经重试的次数
            pageSize: 20, // 分页大小,东方财富接口默认最大就是100
            totalPages: 0, // 页码总数
            completePages: [], // 已经完成的请求页
            pendingPages: [], // 未完成的页码数
            currentPage: 1, // 当前请求页，可能被覆盖
            completePageShares: {}, // 已完成的分页share对象map
        }

        // 从临时文件恢复数据（如果有）
        await this._checkBkTempFile(ctx);

        // 获取所有页面数据
        const fetchResult = await this._fetchBkPages(ctx);
        if (fetchResult.error) {
            result.error = true;
            return result;
        }

        // 合并结果并清理
        if (this._isBkFetchComplete(ctx)) {
            result.shares = this._mergeBkSharesByPage(ctx);
            await this._deleteBkTempFile(ctx);
            console.log(`✅ 板块 ${payload.code} 成分股获取完成！共 ${result.shares.length} 只股票`);
        } else {
            console.log(`⏸️ 板块 ${payload.code} 进度: ${ctx.completePages.length}/${ctx.totalPages}`);
        }

        return result;
    }

    /**
     * 加载板块请求上下文（从临时文件恢复数据）
     * @param {Object} ctx 上下文对象（会被直接修改）
     */
    async _checkBkTempFile (ctx) {
        const tempBkFilePath = this._getBkTempFilePath(ctx.payload.code);
        if (! await this.isFileExists(tempBkFilePath)) { // 没有临时数据文件，采用默认值
            return;
        }

        let data = await fs.promises.readFile(tempBkFilePath, 'utf-8');
        let lastCtx = JSON.parse(data);

        if (lastCtx) {
            console.log(`恢复板块 ${ctx.payload.code} 数据获取，已完成 ${lastCtx.completePages?.length || 0}/${lastCtx.totalPages || 0} 页`);

            // 用临时文件数据覆盖现有上下文
            ctx.maxRetries = lastCtx.maxRetries ?? ctx.maxRetries;
            ctx.errorPageRetries = 0;  // 重置重试计数
            ctx.pageSize = lastCtx.pageSize ?? ctx.pageSize;
            ctx.totalPages = lastCtx.totalPages ?? 0;
            ctx.completePages = lastCtx.completePages ?? [];
            ctx.pendingPages = lastCtx.pendingPages ?? [];
            ctx.completePageShares = lastCtx.completePageShares ?? {};
            ctx.currentPage = lastCtx.currentPage ?? 1;
        }
    }


    /**
     * 获取所有板块页面数据
     * @param {Object} ctx 请求上下文
     */
    async _fetchBkPages (ctx) {
        // 如果没有总页数，先获取第一页（特殊处理）
        if (ctx.totalPages === 0) {
            const firstPageResult = await this._fetchBkPageWithRetry(ctx);
            if (firstPageResult.error) {
                return { error: true };
            }
            // 从第一页数据中获取总页数
            ctx.totalPages = Math.ceil(firstPageResult.total / ctx.pageSize);
            // 生成随机请求队列（排除第一页）
            ctx.pendingPages = this._generateRandomBkPageQueue(ctx.totalPages);
        }

        // 如果没有待获取的页面，直接返回
        if (ctx.pendingPages.length === 0) {
            return { error: false };
        }

        await this.randomSleep(); // 随机间隔防止被封

        // 开始获取剩余页面
        let fetchCount = 1;
        while (ctx.pendingPages.length > 0) {
            const targetPage = ctx.pendingPages[0]; // 取第一个待处理的页面
            // 跳过已完成的页面
            if (ctx.completePages.includes(targetPage)) {
                ctx.pendingPages.shift(); // 移除已完成的页码
                continue;
            }

            // 设置当前要获取的页码
            ctx.currentPage = targetPage;
            const pageResult = await this._fetchBkPageWithRetry(ctx);
            fetchCount += 1;
            if (pageResult.error) {
                await this._saveBkTempFile(ctx); // 执行出错，退出
                break;
            } else {
                ctx.pendingPages.shift();  // 成功：从待处理列表中移除当前页码
            }
            if (fetchCount % 17 == 0) {
                await this.randomSleep(30000); // 每16次请求后长时间休息，防止被封
            } else {
                await this.randomSleep(); // 随机间隔防止被封
            }
        }

        return { error: false };
    }

    /**
     * 获取单页板块数据（带重试机制）
     * @param {Object} ctx 请求上下文
     * @returns {Object} { error, total,shares }
     */
    async _fetchBkPageWithRetry (ctx) {
        const currentPage = ctx.currentPage || 1;
        const isFirstPage = ctx.totalPages === 0; // 如果还没有总页数，说明是第一页
        let retries = 0;
        const maxRetries = ctx.maxRetries;

        while (retries <= maxRetries) {
            try {
                console.log(`获取板块 ${ctx.payload.code}|${ctx.payload.name} 第 ${currentPage} 页${isFirstPage ? '（初始化）' : ''} (进度: ${ctx.completePages.length + 1}/${ctx.totalPages || '?'})`);
                const pageResult = await this._getBkInPage(ctx.payload, currentPage, ctx.pageSize);
                // 请求失败
                if (pageResult.error) {
                    throw new Error('获取板块数据失败');
                }

                // 保存数据
                if (pageResult.shares && pageResult.shares.length > 0) {
                    if (!ctx.completePages.includes(currentPage)) {
                        ctx.completePages.push(currentPage);
                        ctx.completePageShares['p' + currentPage] = pageResult.shares;
                    }
                }
                // 重置当前页的重试计数
                ctx.errorPageRetries = 0;
                return pageResult;
            } catch (err) {
                console.warn(`板块 ${ctx.payload.code}|${ctx.payload.name} 第 ${currentPage} 页获取失败 (${retries + 1}/${maxRetries}):`, err.message);
                retries++;
                ctx.errorPageRetries = retries;

                if (retries >= maxRetries) {
                    console.error(`板块 ${ctx.payload.code}|${ctx.payload.name} 第 ${currentPage} 页重试${maxRetries}次后仍然失败`);
                    ctx.errorPageRetries = 0;
                    return { error: true, total: 0, shares: [] };
                }

                // 重试间隔：错误越严重，等待时间越长
                const waitTime = retries === 1 ? 30000 : 60000; // 第1次等1分钟，之后等2分钟
                await this.randomSleep(waitTime + Math.random() * 10000);
            }
        }

        return { error: true, total: 0, shares: [] };
    }

    /**
     * 保存板块请求上下文到临时文件
     */
    async _saveBkTempFile (ctx) {
        const tempBkFilePath = this._getBkTempFilePath(ctx.payload.code);
        const data = JSON.stringify(ctx, '', 3);
        await fs.promises.writeFile(tempBkFilePath, data, 'utf-8');
    }

    _getBkTempFilePath (bkCode) {
        return path.join(__dirname, `../../../data/${bkCode}.json`);
    }

    /**
     * 删除板块临时文件
     */
    async _deleteBkTempFile (ctx) {
        try {
            const tempBkFilePath = this._getBkTempFilePath(ctx.payload.code);
            if (await this.isFileExists(tempBkFilePath)) {
                await fs.promises.rm(tempBkFilePath);
            }
        } catch (err) {
            console.error(`删除板块临时文件失败: ${err.message}`);
        }
    }

    /**
     * 生成随机页码队列（排除第一页）
     * @param {number} totalPages
     */
    _generateRandomBkPageQueue (totalPages) {
        const pages = [];
        for (let i = 2; i <= totalPages; i++) {
            pages.push(i);
        }

        // Fisher-Yates 随机打乱
        for (let i = pages.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pages[i], pages[j]] = [pages[j], pages[i]];
        }

        return pages;
    }

    /**
     * 检查板块数据是否获取完成
     */
    _isBkFetchComplete (ctx) {
        return ctx.completePages.length === ctx.totalPages && ctx.totalPages > 0;
    }


    /**
     * 按页码顺序合并板块成分股数据
     */
    _mergeBkSharesByPage (ctx) {
        const allShares = [];
        for (let page = 1; page <= ctx.totalPages; page++) {
            const shares = ctx.completePageShares['p' + page];
            if (shares && shares.length > 0) {
                allShares.push(...shares);
            }
        }

        return allShares;
    }

    /**
     * 获取单页成分股
     */
    async _getBkInPage (payload, pageIndex, pageSize) {
        try {
            const response = await axios.get('https://push2.eastmoney.com/api/qt/clist/get', {
                params: {
                    np: 1,
                    fltt: 1,
                    invt: 2,
                    cb: 'jQuery37107246009655814323_1775698454004', // 这个可以保留
                    fs: `b:${payload.code}+f:!50`,
                    fields: 'f12,f14',
                    fid: 'f12',
                    pn: pageIndex,
                    pz: pageSize,
                    po: 1,
                    dect: 1,
                    ut: 'fa5fd1943c7b386f172d6893dbfba10b',
                    wbp2u: '|0|0|0|web',
                    _: Date.now()
                },
                timeout: 15000,
                headers: this.#getHeaders(),
            });

            // ======================
            // 关键修复：剥离 JSONP 回调
            // ======================
            const text = response.data;
            // 去掉前面的 jQueryxxx(  和后面的 );
            const jsonStr = text.replace(/^[\w_]+\(/, '').replace(/\);$/, '');
            const resJson = JSON.parse(jsonStr); // 转成真正的对象

            const diff = resJson?.data?.diff || [];
            const total = resJson?.data?.total || 0;

            // 解析股票列表
            const shares = diff.map(item => ({
                code: item.f12?.trim() || '',
                name: item.f14?.trim() || ''
            })).filter(item => item.code);

            return {
                error: false,
                total,
                shares
            };
        } catch (err) {
            return { error: true, total: 0, shares: [] };
        }
    }

    async getBkList () {
        const response = await axios.get('https://quote.eastmoney.com/center/api/sidemenu_new.json');
        let bkMap = { regions: [], industries: [], concepts: [] }; // 概念
        let bklist = response.data.bklist; // 行业/概念/地域板块列表
        for (let bk of bklist) {
            let type = parseInt(bk.type);
            if (type == 1) {
                bkMap.regions.push(bk); // 地域板块
            } else if (type == 2) {
                bkMap.industries.push(bk); // 行业板块
            } else if (type == 3) {
                bkMap.concepts.push(bk); // 概念板块
            }
        }
        let data = JSON.stringify(bkMap, '', 3);
        fs.writeFileSync(this.bkFilePath, data, 'utf8');
        return bkMap;
    }
}

export default EastMoneyProvider;