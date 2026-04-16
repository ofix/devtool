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
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6",
            "Referer": "https://gu.qq.com/",
            "User-Agent": "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.251 Safari/537.36",
        };
    }

    /**
     * 格式化时间戳为可读时间
     * @param {string} timestamp - 如 '20260416101839'
     * @returns {string} 如 '2026-04-16 10:18:39'
     */
    #formatTime(timestamp) {
        if (!timestamp || timestamp.length !== 14) return timestamp;
        const year = timestamp.substring(0, 4);
        const month = timestamp.substring(4, 6);
        const day = timestamp.substring(6, 8);
        const hour = timestamp.substring(8, 10);
        const minute = timestamp.substring(10, 12);
        const second = timestamp.substring(12, 14);
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }

    /**
     * 腾讯财经 - 批量获取股票实时行情
     * @param {Array} shares 股票数组
     * @returns {Promise<Array>} 格式化实时行情列表
     */
    async getQuote(shares) {
        try {
            if (!shares || shares.length === 0) return [];
            // 自动拼接前缀：6开头=sh，0/3开头=sz
            const stockList = shares.map(share => {
                return share.market == 'SH' ? `sh${share.code}` : `sz${share.code}`;
            }).join(',');

            const url = `https://web.sqt.gtimg.cn/utf8/q=${stockList}&r=${Math.random()}`;
            const res = await axios.get(url, {
                headers: this.#getHeaders(),
                timeout: 10000
            });
            let data = res.data;
            // 解析腾讯专用格式
            const result = [];
            const lines = data.split(';').filter(i => i.trim());

            for (const line of lines) {
                const match = line.match(/v_(sh|sz)(\d+)="([^"]+)"/);
                if (!match) continue;
                const fields = match[3].split('~');
                // 判断数据类型（深市51开头 或 沪市1开头）
                const dataType = fields[0];
                const isSZ = dataType === '51';  // 深市
                const isSH = dataType === '1';   // 沪市

                if (!isSZ && !isSH) {
                    console.warn('未知的数据格式:', dataType);
                    continue;
                }
                let share = {
                    code: fields[2],                       // 股票代码
                    name: fields[1],                       // 名称
                    close: parseFloat(fields[3]),          // 当前价格
                    open: parseFloat(fields[5]),           // 今开
                    yclose: parseFloat(fields[4]),         // 昨收
                    high: parseFloat(fields[33]),          // 最高
                    low: parseFloat(fields[34]),           // 最低
                    change: parseFloat(fields[31]),        // 涨跌额
                    changePercent: parseFloat(fields[32]), // 涨跌幅%
                    volume: parseInt(fields[6], 10),       // 成交量
                    amount: 0,                              // 成交额
                    turnover: 0,                            // 换手率
                    time: this.#formatTime(fields[30]), // 当前时间
                }
                // 计算成交额（元）
                if (fields[35]) {
                    const parts = fields[35].split('/');
                    if (parts.length >= 3) {
                        share.amount = parseFloat(parts[2]);  // 成交额（元）
                    }
                }
                // 换手率
                if (isSZ) {
                    if (fields[38]) share.turnover = parseFloat(fields[38]);
                } else {
                    if (fields[36]) share.turnover = parseFloat(fields[36]);
                }
                result.push(share);

                // 深市特有字段（51开头）
                // if (isSZ) {
                //     share.外盘 = parseInt(fields[7], 10);
                //     share.内盘 = parseInt(fields[8], 10);

                //     // 卖五档（位置9-18）
                //     share.sell = {
                //         level1: { price: parseFloat(fields[9]), volume: parseInt(fields[10], 10) },
                //         level2: { price: parseFloat(fields[11]), volume: parseInt(fields[12], 10) },
                //         level3: { price: parseFloat(fields[13]), volume: parseInt(fields[14], 10) },
                //         level4: { price: parseFloat(fields[15]), volume: parseInt(fields[16], 10) },
                //         level5: { price: parseFloat(fields[17]), volume: parseInt(fields[18], 10) }
                //     };

                //     // 买五档（位置19-28）
                //     share.buy = {
                //         level1: { price: parseFloat(fields[19]), volume: parseInt(fields[20], 10) },
                //         level2: { price: parseFloat(fields[21]), volume: parseInt(fields[22], 10) },
                //         level3: { price: parseFloat(fields[23]), volume: parseInt(fields[24], 10) },
                //         level4: { price: parseFloat(fields[25]), volume: parseInt(fields[26], 10) },
                //         level5: { price: parseFloat(fields[27]), volume: parseInt(fields[28], 10) }
                //     };

                //     // 其他指标（位置36之后）
                //     if (fields[36]) share.委比 = parseFloat(fields[36]);
                //     if (fields[37]) share.委差 = parseFloat(fields[37]);

                //     if (fields[39]) share.市盈率 = parseFloat(fields[39]);
                //     if (fields[40]) share.市净率 = parseFloat(fields[40]);
                //     if (fields[45]) share.每股收益 = parseFloat(fields[45]);
                //     if (fields[46]) share.流通股本 = parseFloat(fields[46]);
                //     if (fields[47]) share.总股本 = parseFloat(fields[47]);
                //     if (fields[48]) share.流通市值 = parseFloat(fields[48]);
                //     if (fields[49]) share.总市值 = parseFloat(fields[49]);

                // }
                // // 沪市特有字段（1开头）
                // else if (isSH) {
                //     // 沪市的买卖档位位置略有不同
                //     share.sell = {
                //         level1: { price: parseFloat(fields[7]), volume: parseInt(fields[8], 10) },
                //         level2: { price: parseFloat(fields[9]), volume: parseInt(fields[10], 10) },
                //         level3: { price: parseFloat(fields[11]), volume: parseInt(fields[12], 10) },
                //         level4: { price: parseFloat(fields[13]), volume: parseInt(fields[14], 10) },
                //         level5: { price: parseFloat(fields[15]), volume: parseInt(fields[16], 10) }
                //     };

                //     share.buy = {
                //         level1: { price: parseFloat(fields[17]), volume: parseInt(fields[18], 10) },
                //         level2: { price: parseFloat(fields[19]), volume: parseInt(fields[20], 10) },
                //         level3: { price: parseFloat(fields[21]), volume: parseInt(fields[22], 10) },
                //         level4: { price: parseFloat(fields[23]), volume: parseInt(fields[24], 10) },
                //         level5: { price: parseFloat(fields[25]), volume: parseInt(fields[26], 10) }
                //     };

                //     if (fields[37]) share.市盈率 = parseFloat(fields[37]);
                //     if (fields[38]) share.市净率 = parseFloat(fields[38]);
                //     if (fields[43]) share.每股收益 = parseFloat(fields[43]);
                //     if (fields[44]) share.流通股本 = parseFloat(fields[44]);
                //     if (fields[45]) share.总股本 = parseFloat(fields[45]);
                //     if (fields[46]) share.流通市值 = parseFloat(fields[46]);
                //     if (fields[47]) share.总市值 = parseFloat(fields[47]);
                // }
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