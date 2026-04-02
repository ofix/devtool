import axios from 'axios';

class TushareProvider {
    constructor() {
        this.baseURL = 'http://api.tushare.pro';
        this.token = 'ee1af62cef664a2d14e5bcf8424c94eb09a7e59c6e7779a9677df353'; // 需要在初始化时设置 token
        this.headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
    }

    /**
     * 设置 Tushare Token
     * @param {string} token - Tushare Pro 接口 token
     */
    setToken(token) {
        this.token = token;
    }

    /**
    * 获取并解析K线数据
    * @param {string} share - 股票
    * @param {string} startDate - 开始日期
    * @param {string} endDate - 结束日期
    * @param {string} adj - 复权类型
    * @returns {Promise<Array>} 解析后的K线数据
    */
    async getKLineData(share, startDate, endDate, adj = null) {
        let tsCode = this._getTsCode(share);
        const rawData = await this._getDaily(tsCode, startDate, endDate, adj);
        return this.parseKLineData(rawData);
    }

    _getTsCode(share) {
        if (share != null) {
            return share.code + "." + share.market;
        }
        return null;
    }

    /**
     * 获取股票日线历史数据
     * @param {string} tsCode - 股票代码，如 '000001.SZ'
     * @param {string} startDate - 开始日期，格式 YYYYMMDD
     * @param {string} endDate - 结束日期，格式 YYYYMMDD
     * @param {string} adj - 复权类型: null/'' 不复权, 'qfq' 前复权, 'hfq' 后复权
     * @param {string} fields - 返回字段，默认返回常用字段
     * @returns {Promise<Array>} K线数据数组
     */
    async _getDaily(tsCode, startDate, endDate, adj = null, fields = null) {
        const params = {
            ts_code: tsCode,
            start_date: startDate,
            end_date: endDate
        };

        if (adj) {
            params.adj = adj;
        }

        const defaultFields = 'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount';
        const finalFields = fields || defaultFields;

        const data = await this.query('daily', params, finalFields);

        // 按日期排序（升序）
        return data.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    }

    /**
     * 解析K线数据，返回标准格式
     * @param {Array} klineData - 原始K线数据
     * @returns {Array} 标准化的K线数据
     */
    parseKLineData(klineData) {
        if (!klineData || !Array.isArray(klineData)) {
            return [];
        }

        return klineData.map(item => ({
            date: item.trade_date,                  // 交易日期
            open: parseFloat(item.open),            // 开盘价
            high: parseFloat(item.high),            // 最高价
            low: parseFloat(item.low),              // 最低价
            close: parseFloat(item.close),          // 收盘价
            amount: parseFloat(item.amount),        // 成交额(千元)
            volume: parseFloat(item.vol),           // 成交量(手)
            change: parseFloat(item.change),        // 涨跌额
            changePercent: parseFloat(item.pct_chg),// 涨跌幅(%)
            // preClose: parseFloat(item.pre_close),   // 昨收价
        }));
    }

    /**
     * 随机延时，避免请求过快
     * @param {number} min - 最小延时(ms)
     * @param {number} max - 最大延时(ms)
     */
    async sleepRandom(min = 3000, max = 7000) {
        const ms = Math.floor(Math.random() * (max - min + 1)) + min;
        console.log(`Tushare 请求延时 ${ms} 毫秒...`);
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 构建请求参数
     * @param {string} apiName - API 名称
     * @param {object} params - 请求参数
     * @param {string} fields - 返回字段，逗号分隔
     * @returns {object} 请求参数对象
     */
    buildRequestParams(apiName, params = {}, fields = null) {
        const requestData = {
            api_name: apiName,
            token: this.token,
            params: params
        };

        if (fields) {
            requestData.fields = fields;
        }

        return requestData;
    }

    /**
     * 处理 API 响应
     * @param {object} response - API 响应数据
     * @returns {Array} 处理后的数据数组
     */
    handleResponse(response) {
        if (!response || response.code !== 0) {
            const errorMsg = response?.msg || 'Unknown error';
            console.error('Tushare API 错误:', errorMsg);
            return [];
        }

        const data = response.data || {};
        const fields = data.fields || [];
        const items = data.items || [];

        if (fields.length === 0 || items.length === 0) {
            return [];
        }

        // 转换为对象数组
        return items.map(item => {
            const record = {};
            fields.forEach((field, index) => {
                let value = item[index];
                // 处理日期字段
                if (['trade_date', 'cal_date', 'list_date', 'listdt'].includes(field)) {
                    if (value && value.length === 8) {
                        value = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
                    }
                }
                record[field] = value;
            });
            return record;
        });
    }

    /**
     * 通用查询方法
     * @param {string} apiName - API 名称
     * @param {object} params - 请求参数
     * @param {string} fields - 返回字段
     * @returns {Promise<Array>} 查询结果
     */
    async query(apiName, params = {}, fields = null) {
        if (!this.token) {
            throw new Error('Tushare token 未设置，请先调用 setToken() 方法');
        }

        try {
            const requestData = this.buildRequestParams(apiName, params, fields);

            const response = await axios.post(this.baseURL, requestData, {
                headers: this.headers,
                timeout: 30000
            });

            return this.handleResponse(response.data);
        } catch (error) {
            console.error(`Tushare ${apiName} 查询失败:`, error.message);
            throw error;
        }
    }



    /**
     * 批量获取多只股票的日线数据
     * @param {Array} stocks - 股票列表 [{tsCode: '000001.SZ'}, ...]
     * @param {string} startDate - 开始日期
     * @param {string} endDate - 结束日期
     * @param {string} adj - 复权类型
     * @returns {Promise<Array>} 合并后的K线数据数组
     */
    async batchGetDaily(stocks, startDate, endDate, adj = null) {
        const results = [];

        for (let i = 0; i < stocks.length; i++) {
            const stock = stocks[i];
            console.log(`正在获取 ${stock.tsCode} 日线数据...`);

            try {
                const data = await this._getDaily(stock.tsCode, startDate, endDate, adj);
                results.push(...data);

                // 请求间隔，避免被限制
                if (i < stocks.length - 1) {
                    await this.sleepRandom(1000, 2000);
                }
            } catch (error) {
                console.error(`获取 ${stock.tsCode} 数据失败:`, error.message);
                // 继续获取下一只股票
                continue;
            }
        }

        return results;
    }

    /**
     * 获取股票周线数据
     * @param {Object} share - 股票对象
     * @param {string} startDate - 开始日期
     * @param {string} endDate - 结束日期
     * @returns {Promise<Array>} 周线数据数组
     */
    async getWeekly(share, startDate, endDate) {
        const tsCode = this._getTsCode(share);
        const params = {
            ts_code: tsCode,
            start_date: startDate,
            end_date: endDate
        };

        const fields = 'ts_code,trade_date,open,high,low,close,vol,amount';
        return await this.query('weekly', params, fields);
    }

    /**
     * 获取股票月线数据
     * @param {Object} Share - 股票对象
     * @param {string} startDate - 开始日期
     * @param {string} endDate - 结束日期
     * @returns {Promise<Array>} 月线数据数组
     */
    async getMonthly(share, startDate, endDate) {
        const tsCode = this._getTsCode(share);
        const params = {
            ts_code: tsCode,
            start_date: startDate,
            end_date: endDate
        };

        const fields = 'ts_code,trade_date,open,high,low,close,vol,amount';
        return await this.query('monthly', params, fields);
    }

    /**
     * 获取股票复权因子
     * @param {Object} Share - 股票对象
     * @param {string} startDate - 开始日期
     * @param {string} endDate - 结束日期
     * @returns {Promise<Array>} 复权因子数据
     */
    async getAdjFactor(share, startDate, endDate) {
        const tsCode = this._getTsCode(share);
        const params = {
            ts_code: tsCode,
            start_date: startDate,
            end_date: endDate
        };

        const fields = 'ts_code,trade_date,adj_factor';
        return await this.query('adj_factor', params, fields);
    }

    /**
     * 获取股票基本信息
     * @param {Object} Share - 股票对象
     * @returns {Promise<object>} 股票基本信息
     */
    async getStockBasic(Share = null) {
        const tsCode = this._getTsCode(share);
        const params = {};
        if (tsCode) {
            params.ts_code = tsCode;
        }

        const fields = 'ts_code,name,industry,market,list_date,exchange';
        const data = await this.query('stock_basic', params, fields);

        return tsCode ? (data[0] || null) : data;
    }

    /**
     * 获取交易日历
     * @param {string} startDate - 开始日期
     * @param {string} endDate - 结束日期
     * @returns {Promise<Array>} 交易日列表
     */
    async getTradeCal(startDate, endDate) {
        const params = {
            start_date: startDate,
            end_date: endDate
        };

        const fields = 'cal_date,is_open';
        const data = await this.query('trade_cal', params, fields);

        // 返回所有交易日
        return data.filter(item => item.is_open === 1).map(item => item.cal_date);
    }
}

export default TushareProvider;