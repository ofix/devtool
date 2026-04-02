import axios from 'axios';
import Utils from "../../../core/Utils.js";
import fs from 'fs';

class EastMoneyProvider {
    constructor() {
        this.baseURL = 'https://push2.eastmoney.com/api/qt';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://quote.eastmoney.com/'
        };
    }

    async sleepRandom() {
        const ms = Math.floor(Math.random() * 7000) + 3000;
        console.log("睡眠 ", ms, "毫秒");
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getStockList() {
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
                    headers: {
                        'Accept': '*/*',
                        'Accept-Encoding': 'gzip, deflate, br, zstd',
                        'Accept-Language': 'zh-CN,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6',
                        'Cache-Control': 'max-age=0',
                        'Connection': 'keep-alive',
                        'Cookie': 'qgqp_b_id=27a950c2fe1b0653cecb79a9ccd77c91; st_nvi=QGXlBcGxvWDPSXzWQB1gLd861; nid18=09b103ec53d128b3b00c42897ed54abd; nid18_create_time=1769475151903; gviem=yn_xAEKwXkLVQMC6EvNmrf4fa; gviem_create_time=1769475151903; websitepoptg_api_time=1775007304159; st_si=76345057599765; st_asi=delete; fullscreengg=1; fullscreengg2=1; st_sn=5; st_psi=20260401094513768-113300300812-4401537884; st_pvi=66081628292100; st_sp=2026-01-27%2008%3A52%3A32; st_inirUrl=https%3A%2F%2Fwww.eastmoney.com%2F; wsc_checkuser_ok=1',
                        'Referer': 'https://quote.eastmoney.com/center/gridlist.html',
                        'Host': 'push2.eastmoney.com',
                        'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Linux"',
                        // 'Sec-Ch-Ua':'"Not/A)Brand";v="8", "Chromium";v="126"',
                        // 'Sec-Ch-Ua-Mobile':'?0',
                        // 'Sec-Ch-Ua-Platform':'"Linux"',
                        'cb': 'jQuery371007211754528794523_1775007918338',
                        'Sec-Fetch-Dest': 'script',
                        'Sec-Fetch-Mode': 'no-cors',
                        'Sec-Fetch-Site': 'same-site',
                        'ut': 'fa5fd1943c7b386f172d6893dbfba10b',// 'fa5fd1943c7b386f172d6893dbfba10b',
                        'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.251 Safari/537.36',
                    }, params
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
                        high: stock.f16,           // 最高
                        low: stock.f17,            // 最低
                        open: stock.f18,           // 今开
                        updateTime: new Date().toISOString()
                    }));

                    allStocks.push(...formattedStocks);

                    // 检查是否还有更多数据
                    const totalCount = response.data.data.total || 0;
                    if (allStocks.length >= totalCount) {
                        hasMore = false;
                    } else {
                        currentPage++;
                    }
                    await this.sleepRandom();
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
    getMarketName(marketCode) {
        const marketMap = {
            '0': '深圳',
            '1': '上海',
            '2': '北京'
        };
        return marketMap[marketCode] || '未知';
    }

    async getKLineData(code, market, period, startDate, endDate) {
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
    async getMinuteData(code, market) {
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
    async getHistoryMinuteData(code, market, days = 5) {
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
    async getFiveDayMinuteData(code, market) {
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
    async getMinuteData(code, market, days = 1) {
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
    async getFiveDayMinuteData(code, market) {
        return this.getMinuteData(code, market, 5);
    }

    /**
     * 批量获取多个股票的分时数据
     * @param {Array} stocks - 股票列表 [{code, market}, ...]
     * @param {number} days - 获取天数
     * @returns {Promise<Array>} 分时数据列表
     */
    async batchGetMinuteData(stocks, days = 1) {
        const promises = stocks.map(stock =>
            this.getMinuteData(stock.code, stock.market, days)
        );

        const results = await Promise.allSettled(promises);

        return results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);
    }

    async searchStock(keyword) {
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

    convertPeriod(period) {
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

    getSecId(code, market) {
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

    detectMarket(marketCode) {
        const marketMap = {
            '0': 'a',   // 深圳
            '1': 'a',   // 上海
            '2': 'hk',  // 港股
            '3': 'us'   // 美股
        };
        return marketMap[marketCode] || 'a';
    }

    parseKLineData(data) {
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
    parseJSONPResponse(jsonpData) {
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
    parseMinuteDataItem(trendStr) {
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
    processMinuteData(rawData, code, market) {
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
}

export default EastMoneyProvider;