import DataProvider from "./DataProvider.js"

export default class SinaProvider extends DataProvider {
    constructor() {
        super();
    }

    /**
     * 获取 新浪财经 涨幅榜/跌幅榜 前N只股票
     * @param {number} n - 获取股票数量
     * @param {string} order - top=涨幅榜, bottom=跌幅榜
     * @returns {Promise<Array>} 带实时行情的排行榜数据
     */
    async getShareRankList(n, order = "top") {
        // 确定排序方式: asc=0 为降序(涨幅榜), asc=1 为升序(跌幅榜)
        const asc = order === "top" ? 0 : 1;

        // 构建请求URL
        const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${currentPage}&num=${pageSize}&sort=changepercent&asc=${asc}&node=hs_a&symbol=&_s_r_a=init`;

        try {
            const response = await fetch(url, {
                headers: this.headers(),
            });
            const data = await response.json();
            shares = data.map(item => this.#formatStockData(item));
        } catch (err) {
            console.error('新浪财经涨跌幅排行榜获取失败:', err);
            return [];
        }
        return shares;
    }

    /**
     * 格式化单只股票数据
     * @param {Object} raw - 接口返回的原始数据
     * @returns {Object} 格式化后的股票数据
     */
    #formatStockData(raw) {
        return {
            code: raw.code,                       // 纯数字代码 '688485'
            name: raw.name,                       // 股票名称
            price: raw.trade,                     // 最新价
            open: raw.open,                       // 今开
            high: raw.high,                       // 最高
            low: raw.low,                         // 最低
            yesPrice: raw.settlement,             // 昨收
            change: raw.pricechange,              // 涨跌额
            changePercent: raw.changepercent,     // 涨跌幅(%)
            volume: raw.volume,                   // 成交量(股)
            amount: raw.amount,                   // 成交额(元)
            turnoverratio: raw.turnoverratio,     // 换手率(%)
            pe: raw.per,                          // 市盈率
            pb: raw.pb,                           // 市净率
            mktcap: raw.mktcap,                   // 总市值(万元)
            nmc: raw.nmc,                         // 流通市值(万元)
            ticktime: raw.ticktime                 // 数据时间
        };
    }

    async getKLineData(code, market, period, startDate, endDate) {
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
}