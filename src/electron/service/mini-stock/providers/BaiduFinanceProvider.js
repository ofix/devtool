import axios from 'axios';
import DataProvider from "./DataProvider.js";

class BaiduFinanceProvider extends DataProvider {
    constructor() {
        super();
        this.baseURL = 'https://finance.pae.baidu.com/api';
    }

    // 百度财经 - 获取涨幅榜 / 跌幅榜前 N 只股票
    async getTopSharesFromBaidu (n, order = "top") {
        try {
            const isAsc = order !== 'top'; // 涨幅降序，跌幅升序
            const timestamp = Date.now();
            const url = new URL("https://gushitong.baidu.com/opendata");
            url.search = new URLSearchParams({
                // 沪深A股实时排行接口
                apiName: "market",
                classify: "sha",
                sortName: "changePercent",
                sortType: isAsc ? "1" : "0", // 0=desc 1=asc
                pageSize: String(n),
                pageIndex: "1",
                type: "ALL",
                ts: String(timestamp),
            }).toString();

            const res = await fetch(url.toString(), {
                headers: this.#getHeaders(),
                method: "GET",
            });

            const data = await res.json();

            if (data.status !== 0 || !data.result?.list) {
                return [];
            }

            return data.result.list.map(item => ({
                code: item.code,
                name: item.name,
                changePercent: item.changePercent, // 涨跌幅 %
                price: item.price,
                change: item.change,
                volume: item.volume,
                amount: item.amount,
            }));

        } catch (err) {
            console.error("百度财经获取失败：", err);
            return [];
        }
    }

    // 百度专用请求头（防反爬）
    #getHeaders () {
        return {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": "https://gushitong.baidu.com/",
            "Origin": "https://gushitong.baidu.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
        };
    }

    async getKline (code, market, period, startDate, endDate) {
        try {
            const response = await axios.get(`https://finance.pae.baidu.com/vapi/v1/getquotation`, {
                params: {
                    srcid: '5353',
                    pointType: 'string',
                    group: 'quotation_kline_ab',
                    query: code,
                    code: code,
                    market_type: 'ab',
                    newFormat: 1,
                    is_kc: 0,
                    ktype: 'day',
                    finClientType: 'pc',
                    finClientType: 'pc',
                    all: 1,
                }
            });

            return this.parseDayKline(response.data);
        } catch (error) {
            console.error('BaiduFinanceProvider getKLineData error:', error);
            throw error;
        }
    }

    parseDayKline (data) {
        try {
            const newMarketData = data?.Result?.newMarketData;
            if (!newMarketData) return [];
            const { keys, marketData } = newMarketData;
            if (!keys || !marketData) return [];
            const lines = marketData.split(';').filter(line => line.trim() !== '');

            return lines.map(line => {
                const values = line.split(',');
                const item = {};

                keys.forEach((key, index) => {
                    item[key] = values[index];
                });
                // "时间戳","时间","开盘","收盘","成交量","最高","最低","成交额","涨跌额","涨跌幅","换手率","昨收",
                // "timestamp","time","open","close","volume","high","low","amount","range","ratio","turnoverratio","preClose"
                return {
                    timestamp: Number(item.timestamp), // 时间戳
                    time: item.time, // 时间
                    open: parseFloat(item.open) || 0, // 开盘价
                    close: parseFloat(item.close) || 0, // 收盘价
                    high: parseFloat(item.high) || 0, // 最高价
                    low: parseFloat(item.low) || 0, // 最低价
                    volume: parseFloat(item.volume) / 100 || 0, // 成交量
                    amount: parseFloat(item.amount) || 0, // 成交额
                    turnoverratio: parseFloat(item.turnoverratio) || 0, // 换手率
                    change: parseFloat(item.range) || 0, // 涨跌额
                    changeratio: parseFloat(item.ratio) || 0, // 涨跌幅
                    preClose: parseFloat(item.preClose) || 0, // 昨收
                };
            });
        } catch (e) {
            console.error('K线解析失败', e);
            return [];
        }
    }

    async getMinuteKline (code, market, days = 1) {
        try {
            const response = await axios.get(`https://finance.pae.baidu.com/vapi/v1/getquotation`, {
                params: {
                    srcid: '5353',
                    pointType: 'string',
                    group: 'quotation_minute_ab',
                    query: code,
                    code: code,
                    market_type: 'ab',
                    newFormat: 1,
                    is_kc: 0,
                    ktype: 'day',
                    finClientType: 'pc',
                    finClientType: 'pc',
                    all: 1,
                }
            });

            return this.parseMinuteKline(response.data);
        } catch (error) {
            console.error('BaiduFinanceProvider getKLineData error:', error);
            throw error;
        }
    }

    parseMinuteKline (data) {
        try {
            const newMarketData = data?.Result?.newMarketData;
            if (!newMarketData) return [];
            const { keys, marketData } = newMarketData;
            if (!keys || !marketData) return [];
            const lines = marketData.split(';').filter(line => line.trim() !== '');

            return lines.map(line => {
                const values = line.split(',');
                const item = {};

                keys.forEach((key, index) => {
                    item[key] = values[index];
                });
                // "时间戳", "时间", "价格", "均价", "涨跌额", "涨跌幅", "成交量", "成交额", "累积成交量", "累积成交额"
                // "timestamp", "time", "price", "avgPrice", "range", "ratio", "volume", "amount", "totalVolume", "totalAmount"
                return {
                    timestamp: Number(item.timestamp), // 时间
                    time: item.time, // 日期
                    price: parseFloat(item.price) || 0, // 开盘价
                    avgPrice: parseFloat(item.avgPrice) || 0, // 收盘价
                    change: parseFloat(item.range) || 0, // 涨跌额
                    changeRatio: parseFloat(item.ratio) || 0, // 涨跌幅
                    volume: parseFloat(item.volume) / 100 || 0, // 成交量
                    amount: parseFloat(item.amount) || 0, // 成交额
                    totalVolume: parseFloat(item.totalVolume) / 100 || 0, // 成交量
                    totalAmount: parseFloat(item.totalAmount) || 0, // 成交额
                };
            });
        } catch (e) {
            console.error('百度分时K线解析失败', e);
            return [];
        }
    }

    async searchStock (keyword) {
        try {
            const response = await axios.get('https://finance.pae.baidu.com/api/search', {
                params: {
                    word: keyword,
                    size: 20
                }
            });

            const stocks = response.data?.result?.list || [];
            return stocks.map(stock => ({
                code: stock.code,
                name: stock.name,
                market: stock.market,
                type: stock.type
            }));
        } catch (error) {
            console.error('BaiduFinanceProvider searchStock error:', error);
            return [];
        }
    }


}

export default BaiduFinanceProvider;