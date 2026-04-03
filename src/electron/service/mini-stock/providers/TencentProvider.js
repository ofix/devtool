import axios from 'axios';
import { URL } from 'url';
import DataProvider from "./DataProvider.js";

class TencentProvider extends DataProvider {
    constructor() {
        super();
        this.baseURL = 'https://web.ifzq.gtimg.cn';
    }

    /**
     * 获取Tushare 涨幅榜/跌幅榜 前N只股票
     * @param {number} n - 获取股票数量
     * @param {string} order - top=涨幅榜, bottom=跌幅榜
     * @returns {Promise<Array>} 带实时行情的排行榜数据
     */
    async getShareRankList(n, order = "top") {
        try {
            const rankUrl = new URL('https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList');
            rankUrl.searchParams.set('_appver', '11.17.0');
            rankUrl.searchParams.set('board_code', 'aStock');
            rankUrl.searchParams.set('sort_type', 'price');
            rankUrl.searchParams.set('direct', order = "top" ? 'up' : 'down');
            rankUrl.searchParams.set('offset', '0');
            rankUrl.searchParams.set('count', Math.min(n, 100));

            const rankRes = await fetch(rankUrl.toString(), {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.251 Safari/537.36',
                    'Referer': 'https://stockapp.finance.qq.com/',
                    'Accept': '*/*',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'zh-CN,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6'
                }
            });

            const rankData = await rankRes.json();
            if (!rankData?.data?.list) return [];

            // 从榜单提取股票代码
            const rankList = rankData.data.list;


            return rankList.map(rank => {
                return {
                    code: rank.code,               // 代码
                    name: rank.name,               // 名称
                    increase: rank.changeRatio,    // 涨跌幅%（榜单）
                    change: rank.change,           // 涨跌额（榜单）
                    price: rank.lastPrice,         // 现价（实时）
                    open: rank.open,               // 今开
                    high: rank.high,               // 最高
                    low: rank.low,                 // 最低
                    volume: rank.vol,              // 成交量
                    amount: rank.amount,           // 成交额
                    time: q.time || new Date().toLocaleString(), // 时间
                };
            });
        } catch (err) {
            console.error('腾讯排行榜获取失败:', err);
            return [];
        }
    }


    // 通用请求头
    #getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9",
            Referer: "https://finance.qq.com/"
        };
    }

    /**
     * 腾讯财经 - 批量获取股票实时行情
     * @param {Array} codes 股票代码数组 ['000001','600000','002594']
     * @returns {Promise<Array>} 格式化实时行情列表
     */
    async getBatchQuotes(codes) {
        try {
            if (!codes || codes.length === 0) return [];

            // 自动拼接前缀：6开头=sh，0/3开头=sz
            const stockList = codes.map(code => {
                const c = code.toString().trim();
                return c.startsWith('6') ? `sh${c}` : `sz${c}`;
            }).join(',');

            const url = `https://web.sqt.gtimg.cn/utf8/q=${stockList}&r=${Math.random()}`;

            const res = await fetch(url, {
                headers: this.#getHeaders(),
            });

            const text = await res.text();
            if (!text) return [];

            // 解析腾讯专用格式
            const result = [];
            const lines = text.split(';').filter(i => i.trim());

            for (const line of lines) {
                const match = line.match(/v_(sh|sz)(\d+)="([^"]+)"/);
                if (!match) continue;

                // const prefix = match[1]; // sh/sz
                const code = match[2];   // 纯代码
                const fields = match[3].split('~');

                // 字段映射（腾讯官方固定字段）
                result.push({
                    code: code,                           // 股票代码
                    name: fields[0] || '',                // 名称
                    price: parseFloat(fields[1]) || 0,    // 当前价格
                    open: parseFloat(fields[2]) || 0,     // 今开
                    yclose: parseFloat(fields[3]) || 0,   // 昨收
                    high: parseFloat(fields[4]) || 0,     // 最高
                    low: parseFloat(fields[5]) || 0,      // 最低
                    change: parseFloat(fields[7]) || 0,   // 涨跌额
                    increase: parseFloat(fields[8]) || 0, // 涨跌幅%
                    volume: fields[9] || '',              // 成交量
                    amount: fields[10] || '',             // 成交额
                    time: fields[30] || '',               // 时间
                });
            }
            return result;
        } catch (err) {
            console.error('腾讯批量行情获取失败：', err);
            return [];
        }
    }

    async getKline(code, market, period, startDate, endDate) {
        try {
            const symbol = this.getSymbol(code, market);
            const response = await axios.get(`${this.baseURL}/appstock/app/fqkline/get`, {
                params: {
                    param: `${symbol},${period},${startDate},${endDate},640`,
                    r: Math.random()
                }
            });

            return this.parseKLineData(response.data, period);
        } catch (error) {
            console.error('TencentProvider getKLineData error:', error);
            throw error;
        }
    }

    async getMinuteData(code, market) {
        try {
            const symbol = this.getSymbol(code, market);
            const response = await axios.get(`${this.baseURL}/qt/quote=${symbol}`);

            // 腾讯返回格式：v_sz000001="1~平安银行~000001~11.23~...";
            const data = response.data;
            const match = data.match(/="(.+)"/);
            if (!match) return null;

            const items = match[1].split('~');
            return {
                price: parseFloat(items[3]),
                change: parseFloat(items[4]),
                changePercent: parseFloat(items[5]),
                volume: parseFloat(items[6]),
                amount: parseFloat(items[7]),
                open: parseFloat(items[9]),
                high: parseFloat(items[10]),
                low: parseFloat(items[11]),
                close: parseFloat(items[3])
            };
        } catch (error) {
            console.error('TencentProvider getRealtimeData error:', error);
            return null;
        }
    }

    async searchStock(keyword) {
        try {
            const response = await axios.get('https://search.10jqka.com.cn/stock/search', {
                params: {
                    w: keyword,
                    t: 'all'
                }
            });

            // 解析搜索结果
            const stocks = [];
            const regex = /<a[^>]*>\((\d{6})\)([^<]+)<\/a>/g;
            let match;
            while ((match = regex.exec(response.data)) !== null) {
                stocks.push({
                    code: match[1],
                    name: match[2].trim(),
                    market: this.detectMarket(match[1])
                });
            }

            return stocks;
        } catch (error) {
            console.error('TencentProvider searchStock error:', error);
            return [];
        }
    }

    getSymbol(code, market) {
        switch (market) {
            case 'a':
                return code.startsWith('6') ? `sh${code}` : `sz${code}`;
            case 'hk':
                return `hk${code}`;
            case 'us':
                return `us${code}`;
            default:
                return code;
        }
    }

    detectMarket(code) {
        if (code.startsWith('6')) return 'a';
        if (code.startsWith('0') || code.startsWith('3')) return 'a';
        if (/^\d{5}$/.test(code)) return 'hk';
        return 'us';
    }

    parseKLineData(data, period) {
        const klineData = data?.data?.[period === 'day' ? 'qfqday' : period] || [];
        return klineData.map(item => ({
            date: item[0],
            open: parseFloat(item[1]),
            close: parseFloat(item[2]),
            high: parseFloat(item[3]),
            low: parseFloat(item[4]),
            volume: parseFloat(item[5]),
            amount: parseFloat(item[6])
        }));
    }
}

export default TencentProvider;