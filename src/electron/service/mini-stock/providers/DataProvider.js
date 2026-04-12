import fs from 'fs';
import { constants as fsConstants } from 'fs';
import { get } from 'http';
export default class DataProvider {
    constructor() {

    }

    /**
     * 获取指数分时数据
     * @param {string} indexName 指数名称：上证指数
     * @param {number} ndays 获取分时数据的天数，默认为1，表示获取当天的分时数据，5表示获取5日分时数据
     * @returns 标准统一格式
     */
    async getIndexMinuteData (indexName, ndays = 1) {
        throw new Error('子类必须实现 getIndexMinuteData 方法');
    }

    /**
     * 获取股票分时数据
     * @param {string} code 股票代码
     * @param {string} name 股票名称
     * @param {string} market 股票市场：sh/sz
     * @param {number} ndays 获取分时数据的天数，默认为1，表示获取当天的分时数据，5表示获取5日分时数据
     */
    async getShareMinuteData (code, name, market, ndays = 1) {
        throw new Error('子类必须实现 getShareMinuteData 方法');
    }

    /**
     * 获取 涨幅榜/跌幅榜 前N只股票
     * @param {number} n - 获取股票数量
     * @param {string} order - top=涨幅榜, bottom=跌幅榜
     * @returns {Promise<Array>} 带实时行情的排行榜数据
     */
    async getShareRankList (n, order = "top") {
        throw new Error('子类必须实现 getShareRankList 方法');
    }


    /**
     * 判断文件是否存在（核心方法）
     */
    async isFileExists (filePath) {
        try {
            await fs.promises.access(filePath, fsConstants.F_OK);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 获取股票日/周/月/年数据
     * @param {string} code 股票代码
     * @param {string} name 股票名称
     * @param {string} market 股票市场
     * @param {'day'|'week'|'month'|'year'} period day: 日K线 week: 周K线 month: 月K线 year: 年K线
     * @param {string|null} startDate 开始时间，格式 yyyy-mm-dd
     * @param {string|null} endDate 结束时间，格式 yyyy-mm-dd
     * @returns {Promise<Object>} 返回K线数据
     */
    async getKline (code, name, market, period, startDate, endDate) {
        throw new Error('子类必须实现 getKline 方法');
    }


    /**
     * 爬取板块数据
     */
    async getBk (params) {
        throw new Error("子类必须实现 getBk 方法");
    }

    async getBkList () {
        throw new Error("子类必须实现 getBkList 方法");
    }

    /**
     * 爬取行业板块
     */
    async getIndustry () {
        throw new Error('子类必须实现 getIndustry 方法');
    }

    /**
     * 爬取地域板块
     */
    async getRegion () {
        throw new Error('子类必须实现 getRegion 方法');
    }

    /**
     * 爬取概念板块
     */
    async getConcept () {
        throw new Error('子类必须实现 getConcept 方法');
    }

    /**
     * 获取股票分时数据
     * @param {string} code 股票代码
     * @param {string} name 股票名称
     * @param {string} market 股票市场
     * @param {Number} days 1: 分时图 5: 5日分时图
     */
    async getMinuteKline (code, name, market, days = 1) {
        throw new Error('子类必须实现 getMinuteKline 方法');
    }

    /**
     * 获取股票IPO信息
     * @param {string} code 股票代码
     * @param {string} market 股票市场
     * @return {string} 股票IPO信息，格式 股票代码,上市日期，发行价
     */
    async getIPOInfo (code, market) {
        throw new Error('子类必须实现 getMinuteKline 方法');
    }

    headers () {
        return {
            'Accept': '*/*;',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'sec-ch-ua': '"Chromium";v="130","Not=A?Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest',
        };
    }
}