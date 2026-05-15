import DataProvider from "./DataProvider.js";
import Share from "./Share.js";

// 九方智投
// https://stock.9fzt.com/index/sz_000066.html
export default class JFZTProvider extends DataProvider {
    constructor() {
        super();
        this.name = "九方智投";
    }

    supportApis() {
        return [
            "getShareMinuteKline", // 获取分时线，支持 1~20日分时数据
        ];
    }

    /**
     * 获取九方智投股票分时数据 → 返回【对象数组】（与腾讯财经结构完全一致）
     * @param {Object} share 股票对象 { name: '', code: '', market: 'SZ'/'SH' }
     * @param {number} ndays 1=当日, 5=五日（九方默认返回1200条=5日分时）
     * @returns {Promise<Array>} 五日分时数据 [day1, day2, day3, day4, day5]
     * @description 九方智投 MIN1 分时接口固定返回 1200 条数据 = 5 个交易日 × 240 条/日
     *              数据顺序：正序排列，第1天 → 第2天 → 第3天 → 第4天 → 第5天（最新交易日）
     * @interface 接口地址：https://infocenter.9fzt.com/infoapi/v2/hisquote/v2
     * @requestParams
     *  market    市场 SZ/SH
     *  inst      股票代码（无前缀）
     *  period    MIN1（1分钟K线）
     *  starttime 0（固定：从当日开始）
     *  endtime   2524579200（固定：远期时间戳，获取最新全部数据）
     *  limit     -1200（固定：获取最近1200条=5日数据）
     *  servicetype KLINEB
     * @response 原始接口返回结构
     * {
     *   "Code": 0,
     *   "Msg": "Success",
     *   "KlineData": [
     *     {
     *       "TradingDay": 1777392000,
     *       "Time": 1777426260,
     *       "High": 17.51,
     *       "Open": 17.33,
     *       "Low": 17,
     *       "Close": 17.11,
     *       "Volume": 25023915,
     *       "Amount": 431714226,
     *       "PreClose": 17.83,
     *       "PreSettlement": 0,
     *       "SettlementPrice": 0,
     *       "AfterTradeVolume": 0,
     *       "AfterTradeAmount": 0,
     *       "OpenInterest": 0,
     *       "AvePrice": null
     *     },
     *     {
     *       "TradingDay": 1777478400,
     *       "Time": 1777512660,
     *       "High": 19.38,
     *       "Open": 19,
     *       "Low": 18.99,
     *       "Close": 19.16,
     *       "Volume": 49288098,
     *       "Amount": 942937031,
     *       "PreClose": 18.02,
     *       "PreSettlement": 0,
     *       "SettlementPrice": 0,
     *       "AfterTradeVolume": 0,
     *       "AfterTradeAmount": 0,
     *       "OpenInterest": 0,
     *       "AvePrice": null
     *     },
     *     {
     *       "TradingDay": 1777996800,
     *       "Time": 1778031060,
     *       "High": 21.8,
     *       "Open": 21.8,
     *       "Low": 21.8,
     *       "Close": 21.8,
     *       "Volume": 22593061,
     *       "Amount": 492528729,
     *       "PreClose": 19.82,
     *       "PreSettlement": 0,
     *       "SettlementPrice": 0,
     *       "AfterTradeVolume": 0,
     *       "AfterTradeAmount": 0,
     *       "OpenInterest": 0,
     *       "AvePrice": null
     *     },
     *     {
     *       "TradingDay": 1778083200,
     *       "Time": 1778117460,
     *       "High": 23.89,
     *       "Open": 23.29,
     *       "Low": 22.98,
     *       "Close": 23.48,
     *       "Volume": 122031566,
     *       "Amount": 2852333244,
     *       "PreClose": 21.8,
     *       "PreSettlement": 0,
     *       "SettlementPrice": 0,
     *       "AfterTradeVolume": 0,
     *       "AfterTradeAmount": 0,
     *       "OpenInterest": 0,
     *       "AvePrice": null
     *     },
     *     {
     *       "TradingDay": 1778169600,
     *       "Time": 1778204040,
     *       "High": 23.34,
     *       "Open": 23.16,
     *       "Low": 23.16,
     *       "Close": 23.32,
     *       "Volume": 12404125,
     *       "Amount": 288485909,
     *       "PreClose": 23.13,
     *       "PreSettlement": 0,
     *       "SettlementPrice": 0,
     *       "AfterTradeVolume": 0,
     *       "AfterTradeAmount": 0,
     *       "OpenInterest": 0,
     *       "AvePrice": null
     *     }
     *   ],
     *   "MinData": null,
     *   "StatisticsData": null,
     *   "LongPeriodKlineData": null,
     *   "Expire": 0
     * }
     */
    async getShareMinuteKline(share, ndays = 1) {
        const market = share.market || "SH";
        const inst = share.code;

        try {
            // 请求九方智投1分钟K线接口（固定获取1200条=5日分时数据）
            const { data } = await this.httpGet("分时", "https://infocenter.9fzt.com/infoapi/v2/hisquote/v2", {
                market: market,
                inst: inst,
                period: "MIN1",
                starttime: 0,
                endtime: 2524579200,
                limit: -1200,
                servicetype: "KLINEB",
            });

            // 校验接口响应状态
            if (data.Code !== 0) {
                throw new Error(data.Msg || "接口返回异常");
            }

            const klineData = data.KlineData || [];
            if (klineData.length === 0) {
                return null;
            }

            // 九方数据规则：1200条 = 5个交易日，每日固定240条，正序排列
            // 0~239=第1天，240~479=第2天，480~719=第3天，720~959=第4天，960~1199=第5天
            const dayList = [];
            for (let i = 0; i < 5; i++) {
                const sliceData = klineData.slice(i * 240, (i + 1) * 240);
                dayList.push(sliceData.length ? this.#parseMinuteResponse(sliceData,share) : this.createEmptyMinute());
            }

            // 根据ndays返回对应数据：1日返回最新一天，5日返回完整五日
            return ndays === 1 ? [dayList[4]] : dayList;
        } catch (err) {
            console.error("九方智投分时K线获取失败:", err);
            return null;
        }
    }

    formatTime(timestamp) {
        let time = timestamp.toString().length === 10 ? timestamp * 1000 : timestamp;
        let date = new Date(time);

        let y = date.getFullYear();
        let m = (date.getMonth() + 1).toString().padStart(2, '0');
        let d = date.getDate().toString().padStart(2, '0');
        let h = date.getHours().toString().padStart(2, '0');
        let i = date.getMinutes().toString().padStart(2, '0');
        let s = date.getSeconds().toString().padStart(2, '0');

        return `${y}-${m}-${d} ${h}:${i}:${s}`;
    }

    /**
     * 解析单日分时K线数据（对齐腾讯财经计算逻辑与字段结构）
     * @param {Array} dayLines 单日240条分时数据
     * @param {Object} share 股票对象
     * @returns {Object} 标准分时数据对象
     */
    #parseMinuteResponse(dayLines,share) {
        const preClose = parseFloat(dayLines[0]?.PreClose || 0);
        let totalVolume = 0;
        let totalAmount = 0;
        const dataList = [];

        dayLines.forEach(item => {
            // 时间戳格式化 HH:mm
            const time = this.formatTime(item.Time);
            const price =item.Close;
            const vol = item.Volume;
            const amt = item.Amount;

            // 累加当日总成交量、总成交额
            totalVolume += vol;
            totalAmount += amt;

            // 计算均价、涨跌额、涨跌幅
            const avgPrice = totalAmount / totalVolume;
            const change = price - preClose;
            const changeRatio = preClose !== 0 ? (change / preClose) * 100 : 0;

            dataList.push({
                time: time.slice(11, 16),
                price: price,
                avgPrice: parseFloat(avgPrice.toFixed(2)),
                volume: vol,
                amount: amt,
                change: parseFloat(change.toFixed(2)),
                changeRatio: parseFloat(changeRatio.toFixed(2)),
            });
        });
        let tradingDay = this.formatTime(dayLines[0]?.TradingDay).slice(0,10);
        return {
            day: tradingDay,           // 交易日期
            provider: this.name,       // 供应商名称
            shareName: share.name,     // 股票名称
            preClose: preClose,        // 昨日收盘
            totalVolume,               // 总成交量
            totalAmount,               // 总成交额
            data: dataList,            // 分时数据
        };
    }
}
