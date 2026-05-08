import DataProvider from "./DataProvider.js"
import Share from "./Share.js"

// 同花顺财经
export default class THSProvider extends DataProvider {
    constructor() {
        super();
    }

    supportApis() {
        return [
            'getShareDayKline',     // 获取日K线
            'getShareMinuteKline',  // 获取分时线，支持 1~5日分时数据
            'getQuote',             // 获取多只股票行情最新报价
            'getTopShares',         // 跌幅榜/涨幅榜前N只股票，最多100只
        ]
    }

    /**
     * 获取分时数据，支持 1~5日分时数据
     * @param {Share} share 格式 {name:"xx", code:"xx", market:"xx"}
     * @param {Number} ndays 1或者5日分时
     */
    async getShareMinuteKline(share, ndays = 1) {
        try {
            const code = share.code;
            let marketType = '';

            // 自动判断市场：深市 0/3 开头，沪市 6 开头
            if (code.startsWith('6')) {
                marketType = 'sh';
            } else {
                marketType = 'sz';
            }

            let url = '';
            if (ndays === 1) {
                // 当日分时
                url = `https://d.10jqka.com.cn/v6/time/hs_${code}/defer/last.js`;
            } else if (ndays === 5) {
                // 5日分时
                url = `https://d.10jqka.com.cn/v6/time/hs_${code}/five/defer/last.js`;
            } else {
                throw new Error('仅支持 1 日或 5 日分时');
            }

            // 请求数据
            const res = await fetch(url);
            let text = await res.text();

            // 剥离 JSONP 回调外壳
            const prefix = `quotebridge_v6_time_hs_${code}_defer_last(`;
            const suffix = ')';
            const jsonStr = text.substring(prefix.length, text.lastIndexOf(suffix));
            const jsonData = JSON.parse(jsonStr);

            const raw = jsonData[`hs_${code}`];
            const dataStr = raw.data;
            const preClose = parseFloat(raw.pre);

            // 解析 data 字符串为标准数组
            const list = dataStr.split(';').filter(item => item).map(item => {
                const [time, price, totalAmount, avgPrice, volume] = item.split(',');
                return {
                    time: time.trim(),
                    price: parseFloat(price),
                    avgPrice: parseFloat(avgPrice),
                    volume: parseInt(volume),
                    totalAmount: parseFloat(totalAmount),
                    preClose,
                };
            });

            return {
                code: share.code,
                name: raw.name,
                date: raw.date,
                preClose: preClose,
                ndays,
                list: list
            };
        } catch (err) {
            console.error('获取分时数据失败', err);
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
            const market = code.startsWith('6') ? '1' : '0';

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
            const list = rawList.map(item => {
                const [date, open, high, low, close, vol, amount, turn, swing] = item.split(',');
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
                    preClose: parseFloat(preClose)
                };
            });

            // 时间过滤
            let filtered = list;
            if (startDate) {
                filtered = filtered.filter(item => item.date >= startDate);
            }
            if (endDate) {
                filtered = filtered.filter(item => item.date <= endDate);
            }

            return {
                code: share.code,
                name: share.name,
                preClose: parseFloat(preClose),
                list: filtered
            };
        } catch (err) {
            console.error('获取日K数据失败', err);
            return null;
        }
    }
}