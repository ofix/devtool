import DataProvider from "./DataProvider.js";
import Share from "./Share.js";

// 同花顺财经
export default class THSProvider extends DataProvider {
    constructor() {
        super();
        this.name = "同花顺";
    }

    supportApis() {
        return [
            "getShareDayKline",     // 获取日K线
            // "getShareMinuteKline",  // 获取分时线，支持 1~5日分时数据
            "getQuote",             // 获取多只股票行情最新报价
            "getTopShares",         // 跌幅榜/涨幅榜前N只股票，最多100只
        ];
    }

    /**
     * 股票行情返回结构
     * @typedef {Object} StockQuoteItem
     * @property {string} code - 股票代码
     * @property {string} name - 股票名称
     * @property {number} close - 当前价格
     * @property {number} open - 开盘价
     * @property {number} high - 最高价
     * @property {number} low - 最低价
     * @property {number} preClose - 昨收价
     * @property {number} volume - 成交量
     * @property {number} amount - 成交额
     * @property {number} change - 涨跌额
     * @property {number} changePercent - 涨跌幅(%)
     * @property {number} totalMarketCap - 总市值
     * @property {number} amplitude - 振幅
     */

    /**
     * 获取多只股票行情最新报价
     * @param {Shares[]} shares 股票对象数组 [{code, name}]
     * @returns {Promise<StockQuoteItem[]>} 格式化后的股票行情数组
     */
    async getQuote(shares) {
        // 1. 参数校验
        if (!Array.isArray(shares) || shares.length === 0) {
            throw new Error("参数必须为非空股票对象数组");
        }

        // 提取有效股票代码
        const validCodes = shares
            .map((item) => item.code?.trim())
            .filter((code) => !!code);

        if (validCodes.length === 0) {
            throw new Error("未解析到有效股票代码");
        }

        const codeStr = validCodes.join(",");
        const url = `https://qd.10jqka.com.cn/quote.php?cate=real&type=stock&return=json&callback=showStockData&code=${codeStr}`;

        try {
            // 2. 发起请求
            const { data: resStr } = await this.httpGet("行情", url);

            // 3. 解析 JSONP 数据
            const jsonStr = resStr
                .replace(/^showStockData\(/, "")
                .replace(/\)$/, "");
            const resData = JSON.parse(jsonStr || "{}");
            const { info = {}, data = {} } = resData;

            // 4. 遍历组装结构化数据
            const resultList = shares.map((share) => {
                const code = share.code;
                const stockInfo = info[code] || {};
                const stockData = data[code] || {};

                // 工具：转数字，空值返回0
                const toNum = (val) => Number(val || 0);

                return {
                    code,
                    name: share.name || "",
                    close: toNum(stockData["10"]),
                    open: toNum(stockData["7"]),
                    high: toNum(stockData["8"]),
                    low: toNum(stockData["9"]),
                    preClose: toNum(stockData["6"]),
                    volume: toNum(stockData["13"]),
                    amount: toNum(stockData["19"]),
                    change: toNum(stockData["264648"]),
                    changePercent: toNum(stockData["199112"]),
                    totalMarketCap: toNum(stockData["3475914"]),
                    amplitude: toNum(stockData["1968584"]),
                };
            });

            return resultList;
        } catch (err) {
            console.error("获取同花顺股票行情失败：", err.message);
            // 可选择抛出错误 或 返回空数组
            // throw err;
            return [];
        }
    }

    /**
     * 获取分时数据，支持 1~5日分时数据
     * @param {Share} share 格式 {name:"xx", code:"xx", market:"xx"}
     * @param {Number} ndays 1或者5日分时
     */
    async getShareMinuteKline(share, ndays = 1) {
        try {
            const code = share.code;
            let marketType = "";

            // 自动判断市场：深市 0/3 开头，沪市 6 开头
            if (code.startsWith("6")) {
                marketType = "sh";
            } else {
                marketType = "sz";
            }

            let url = "";
            if (ndays === 1) {
                // 当日分时
                url = `https://d.10jqka.com.cn/v6/time/hs_${code}/defer/last.js`;
            } else {
                throw new Error("仅支持 1 日分时");
            }

            // 请求数据
            const text = await this.httpGet("分时", url);

            // 剥离 JSONP 回调外壳
            const prefix = `quotebridge_v6_time_hs_${code}_defer_last(`;
            const suffix = ")";
            const jsonStr = text.substring(
                prefix.length,
                text.lastIndexOf(suffix)
            );
            const jsonData = JSON.parse(jsonStr);

            const raw = jsonData[`hs_${code}`];
            const dataStr = raw.data;
            const preClose = parseFloat(raw.pre);

            let lastAmount = 0;
            let totalAmount = 0;

            // 解析 data 字符串为标准数组
            const list = dataStr
                .split(";")
                .filter((item) => item)
                .map((item) => {
                    const [time, priceStr, totalAmountStr, avgPrice, volume] = item.split(",");
                    let price = parseFloat(priceStr);
                    totalAmount = parseFloat(totalAmountStr);
                    lastAmount = totalAmount;
                    return {
                        time: time.trim(),
                        price,
                        avgPrice: parseFloat(avgPrice),
                        volume: parseInt(volume),
                        amount: totalAmount - lastAmount,
                        change: price - preClose,
                        changeRatio: (price - preClose) / preClose * 100,
                    };

                });
            return {
                providerName: this.name,  // 供应商名称
                preClose,                 // 昨日收盘价
                totalVolume,              // 累计成交量
                totalAmount,              // 累计成交额
                data: list,               // 分时数据
            };
        } catch (err) {
            console.error("获取分时数据失败", err);
            return null;
        }
    }

    /**
     * 获取股票日/周/月/年K线数据
     * @param {Share} share 股票对象 {code, name, market}
     * @param {string|null} startDate 开始时间 yyyy-mm-dd
     * @param {string|null} endDate 结束时间 yyyy-mm-dd
     * @returns {Promise<Object>} 标准K线数组
     */
    async getShareDayKline(share, startDate = null, endDate = null) {
        try {
            const code = share.code;
            const market = code.startsWith("6") ? "1" : "0";

            // 同花顺日K官方接口（最稳定）
            const url = `https://d.10jqka.com.cn/history/hs_${code}/day.js`;

            const res = await fetch(url);
            const text = await res.text();

            // 剥离JSONP
            const prefix = `quotebridge_history_hs_${code}_day(`;
            const jsonStr = text.substring(prefix.length, text.length - 1);
            const data = JSON.parse(jsonStr);

            const rawList = data.data || [];
            const preClose = data.pre || 0;

            // 格式化日K：日期,开盘,最高,最低,收盘,成交量,成交额,换手率,振幅
            const list = rawList.map((item) => {
                const [date, open, high, low, close, vol, amount, turn, swing] = item.split(",");
                return {
                    date: date.trim(),
                    open: parseFloat(open),
                    high: parseFloat(high),
                    low: parseFloat(low),
                    close: parseFloat(close),
                    volume: parseInt(vol),
                    amount: parseFloat(amount),
                    turn: parseFloat(turn),
                    swing: parseFloat(swing),
                    preClose: parseFloat(preClose),
                };
            });

            // 时间过滤
            let filtered = list;
            if (startDate) {
                filtered = filtered.filter((item) => item.date >= startDate);
            }
            if (endDate) {
                filtered = filtered.filter((item) => item.date <= endDate);
            }

            return {
                code: share.code,
                name: share.name,
                preClose: parseFloat(preClose),
                list: filtered,
            };
        } catch (err) {
            console.error("获取日K数据失败", err);
            return null;
        }
    }
}
