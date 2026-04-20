import axios from 'axios';
import DataProvider from "./DataProvider.js";

class BaiduFinanceProvider extends DataProvider {
    constructor() {
        super();
        this.baseURL = 'https://finance.pae.baidu.com/api';
        // 指数映射
        this.supportIndexes = {
            "上证指数": "000001",
            "深证成指": "399001",
            "创业板指": "399006",
            "沪深300": "000300",
            "科创50": "000688",
            "上证50": "000016",
            "中证500": "000905",
        };
    }

    /**
     * 百度财经 - 批量获取股票实时行情
     * @param {Array} shares 股票数组
     * @returns {Promise<Array>} 格式化实时行情列表
     */
    async getQuote(shares) {
    }

    /**
     * 获取百度财经股票分时数据 → 输出【腾讯财经统一格式】
     * @param {Object} share 股票对象 {name:'', code:'', market:''}
     * @param {number} days 1=当日, 5=五日
     * @returns {Promise<Array>} 统一格式：[ {code,name,preClose,openPrice,date,totalVolume,totalAmount,list:[...]}, ... ]
     */
    async getMinuteKlines(share, days = 1) {
        let group = days == 1 ? 'quotation_minute_ab' : 'quotation_fiveday_ab';
        try {
            const response = await axios.get(`https://finance.pae.baidu.com/vapi/v1/getquotation`, {
                params: {
                    srcid: '5353',
                    pointType: 'string',
                    group: group,
                    query: share.code,
                    code: share.code,
                    market_type: 'ab',
                    newFormat: 1,
                    name: share.name,
                    is_kc: 0,
                    finClientType: 'pc',
                }
            });

            // 统一解析成腾讯格式
            return this.#parseMinuteKlines(response.data, days);
        } catch (error) {
            console.error('BaiduFinanceProvider getKLineData error:', error);
            return days === 5 ? [[], [], [], [], []] : [[]];
        }
    }

    /**
     * 百度财经分时数据解析成统一格式
     */
    #parseMinuteKlines(data, days) {
        try {
            const Result = data?.Result;
            const newMarketData = Result?.newMarketData;
            if (!newMarketData) return [];

            const { keys, marketData } = newMarketData;
            if (!keys || !marketData) return [];

            const preClose = Result?.preClose || Result?.yestclose || 0;
            const allDays = [];

            // 处理百度数据结构（1日/5日兼容）
            let dayDataList = [];
            if (Array.isArray(marketData)) {
                dayDataList = marketData;
            } else {
                dayDataList = [{ p: marketData }];
            }
            // 逐天解析
            dayDataList.forEach(dayItem => {
                if (!dayItem.p) return;
                const lines = dayItem.p.split(';').filter(Boolean);
                const list = [];

                let totalVolume = 0;
                let totalAmount = 0;

                lines.forEach(line => {
                    const values = line.split(',');
                    const item = {};
                    keys.forEach((k, i) => (item[k] = values[i]));

                    // 字段映射
                    const time = item.time;
                    const price = parseFloat(item.price) || 0;
                    const avgPrice = parseFloat(item.avgPrice) || 0;
                    const volume = parseFloat(item.volume) / 100 || 0; // 股 → 手
                    const amount = parseFloat(item.amount) || 0;

                    totalVolume += volume;
                    totalAmount += amount;

                    // 每分钟涨跌额 & 涨跌幅（统一标准）
                    const change = price - preClose;
                    const changeRatio = (change / preClose * 100) || 0;

                    list.push({
                        time,
                        price,
                        avgPrice,
                        volume,
                        amount,
                        totalVolume: Math.round(totalVolume),
                        totalAmount: Math.round(totalAmount),
                        change: parseFloat(change.toFixed(2)),
                        changeRatio: parseFloat(changeRatio.toFixed(2)),
                    });
                });

                if (!list.length) return;

                // 日期（百度无返回，用当天或空）
                const date = new Date().toISOString().split('T')[0].replace(/-/g, '');

                // 开盘价
                const open = list[0]?.price || 0;

                // 输出统一格式
                allDays.push({
                    preClose: parseFloat(preClose),
                    open,
                    date,
                    totalVolume: Math.round(totalVolume),
                    totalAmount: Math.round(totalAmount),
                    data:list,
                });
            });

            return allDays;
        } catch (e) {
            console.error('百度分时解析失败', e);
            return days === 5 ? [[], [], [], [], []] : [[]];
        }
    }

    /**
     * 获取百度财经分时数据
     * @param {string} indexName 指数名称：上证指数
     * @returns 东方财富标准统一格式
     */
    async getIndexMinuteData(indexName) {
        const code = this.INDEX_MAP[indexName];
        if (!code) throw new Error(`不支持指数：${indexName}`);

        const url = 'https://finance.pae.baidu.com/vapi/v1/getquotation';
        const params = {
            srcid: 5353,
            pointType: 'string',
            group: 'quotation_index_minute',
            query: code,
            code: code,
            market_type: 'ab',
            newFormat: 1,
            name: indexName,
            is_kc: 0
        };

        const { data } = await axios.get(url, {
            params,
            headers: this.#getHeaders(),
            timeout: 10000
        });

        const result = data.Result;
        if (!result?.newMarketData) throw new Error('获取分时数据失败');

        const res = data.Result;
        const infos = res.pankouinfos.list;

        // =========================================
        // 正确读取 开 / 高 / 低 / 收
        // =========================================
        const preClose = this.getVal(infos, 'preClose');
        const open = this.getVal(infos, 'open');
        const high = this.getVal(infos, 'high');
        const low = this.getVal(infos, 'low');

        const rawStr = res.newMarketData.marketData[0].p;
        const minuteData = this._parseIndexMinuteData(rawStr, high, low);


        // 统一输出（完全对齐东方财富结构）
        return {
            code: code,
            name: indexName,
            preClose,
            open,
            high,
            low,
            size: minuteData.length,
            data: minuteData // 东方财富标准格式
        };
    }

    /**
     * 解析昨收价
     */
    getPreClose(list) {
        const item = list.find(i => i.ename === 'preClose');
        return item ? parseFloat(item.value) : 0;
    }

    /**
     * 核心：把百度财经的分时串 → 东方财富标准分时格式
     * 百度：timestamp,time,price,range,ratio,volume,amount,totalVolume,totalAmount
     * 东财："2026-04-10 09:30,价格,均价,最高,最低,成交额"
     */
    _parseIndexMinuteData(rawStr, dayHigh, dayLow) {
        return rawStr.split(';').map(line => {
            const [timestamp, time, price] = line.split(',');
            const fullTime = `2026-${time}`;
            // 东方财富格式：时间,价格,均价,最高,最低,成交额
            return `${fullTime},${price},${price},${dayHigh},${dayLow},0`;
        });
    }

    // 百度财经 - 获取涨幅榜 / 跌幅榜前 N 只股票
    async getTopSharesFromBaidu(n, order = "top") {
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
    #getHeaders() {
        return {
            "Accept": "application/vnd.finance-web.v1+json",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6",
            'Acs-Token': "1775541605905_1775547295255_vmUfHmE2l2Bsm5zN1RBmsLvqZrpK1cCrgyhyGLEJG4M8/oigbrw3WnYMDxGx6GnBGOEcpHG2oKUrjUyi5Bfhn3zlXTUj/mDkJGYbLTqz/coUR4KkbAx0wfkWhPyWrc+UoD+EJacz4oZaOFtLJ81hWGgK6VTmqycw4/pjeZ/dbljm8pve4SXpcUIJ5dJ/HBaIjWqrOOVQkPDiIfIU8Xmdu2CCkARP5fW801uiDUtjAoDA3RXCHlFgsx8IKtFIA/Xq2pL/w9HuYBPVStSG2NHMP5a2JEsjHqOMGcXYkd97SNaCYimh0EDyFEowY6aqpUWRO0+J8dahA+hvJ+qYCmPlgupP5X/l4K3vRxwC/WdKLAreo5r4eCbLIfcW5OunFAM38CajQfMh/OqxtPI8aCL9gg1tGhX91LkczRCLg2G+OxgXQTjlOykFYFskUVkhxiOi",
            "Host": "finance.pae.baidu.com",
            "Referer": "https://finance.baidu.com/",
            "Origin": "https://finance.baidu.com",
            "Cookie": `BIDUPSID=6EEF033850B9DABDB5FC095EF41F8184; PSTM=1769475121; BAIDUID=6EEF033850B9DABDB5FC095EF41F8184:FG=1; H_WISE_SIDS_BFESS=67080_67889_67941_68041_68076_68086_68100_67984_68003_68144_68150_68153_68139_68166_68181_68227_68266_68285_68292; MCITY=-%3A; BAIDUID_BFESS=6EEF033850B9DABDB5FC095EF41F8184:FG=1; ZFY=xWVlyTHCnyIwXMIRXBe2A5M1a6SIPj0hEMz5J1TNXF8:C; BA_HECTOR=812k04210l012k0h05ak85000l2la11kt8kou27; PSINO=2; delPer=0; H_WISE_SIDS=63146_67861_67984_68003_68144_68150_68153_68139_68166_68227_68266_68296_68311_68378_68423_68447_68438_68511_68527_68542_68554_68506_68618_68624_68612_68601_68685_68675_68711_68727_68544_68774_68811_68884_68900_68921; BDRCVFR[UfyjjTkyxb_]=mk3SLVN4HKm; H_PS_PSSID=63146_67861_67984_68003_68144_68150_68153_68139_68166_68227_68266_68296_68311_68378_68423_68447_68438_68511_68527_68542_68554_68506_68618_68624_68612_68601_68685_68675_68711_68727_68544_68774_68811_68884_68900_68921; BDORZ=FFFB88E999055A3F8A630C64834BD6D0; ppfuid=FOCoIC3q5fKa8fgJnwzbE+YhNskVRU4HW930FeLFkOByMFn76lfGbpe1mvnbXASpJB/ci5OjY/p5Deg+hv8YrIz7TMXRylEW5hdNFYaBjuCuFMYVIsOGCDcCGm/hArLqSOgoap6LII1odh53KcPUGNE90q2b/jXef2YQK99fbMg/ev93+zPsroiExYQmnl2/xKm4yaHsaxngLt8X+ROCa1V7g4ti461xXzsWsLP50OVx9vu6RQxP4AbZKhPsqT4U7FybV/9OgNutEUdYJjyGfDW/aLCPXd1oz71pYnkYkJC79JRsXmNXkBTLP+MGIiApU5toMIeBYlkfdmtMZgeaLtckH3PfLajwqrF6nlcEKy6A05bkLvd7+DniS5jg8ohLvVkjvoSThqoEMSdQyP47zrv2sK7CDNLzTDCNARobONye81cgRbanCPgFcg1I0Ws8WStGatIN1o43k/0tYZBeFYgaFiqth+EcZmok3Ha5aaCUAhARljbU7JgOCl8o3fPFGfo42ocrzcyQEQ1YExZIDB5r/7VVI1RMZ8gb40q7az6Dbyw7OOctSdQT0q6QwAxM9lh9Pv2xsVi6e1jRHLoZfc6xEAlV1c9cqU9FCKKCE3aHe61k19SwAYvZZZre25tP2132sZ856caQs4YJGVp1dODUgo8ND3Pf8OKoe0AhubK7d6YSDqcRi7qVC69ivr9QlZHb3pM/XU1yUmp0dpN/dJHIeKAxeCJRzKQmiJrt2NdLXfu0TJRyXYClb9dslijAMlBRhHp4q4EHCKPlJ8vRPbqLYQNT9wXrZ/IWwo5cobR/q1uQn9VsBjBmLNQsYnwiX1i39zQE19TGybrzqrM1pPbAcb9jVyAPNXYtYELnZOxv7/xlyu/mm2e/4Lzfz0n7srSqfnFcmtlk10eEH4v9Tu0EHJMhGrMpFk072SScWWzsyENIRSzxn7hVLq2WrdfYC+pt8AopWmZ7q/XS68PCmb+l8+BWKo5hKxgQktCLfGSgrRjbdSdIPZTmTcJl9A0YzjTQhbK056VERMIy3dMedvQau87dgPQPBPOdZfELQaEBSLlhBmNwzEBsxOHy7QZw9iAQNcYCK2xfeYf2imATVV3bwYaC8F4XJ12oqlxKXLxUJaJyL/ORX2lW3xKCro0F9iAQNcYCK2xfeYf2imATVYemNDYxCmdd8ZXU4Cg4htkEQSRUz7L4kkhL4CxkTt2IBjr/vyN58BqfauYSxfP9O4KEVJ4njsvVmNwgrtRSkK1BsJpj4dITdJbNApg4wUdappq0gKweencPxgS/jd0rjw==; ab_sr=1.0.1_YTg2M2Q1YWU3NWFhNzk5OWUxY2FmODY4MTM4N2RjNzNlZjU2NzFmMGVkNWNjMTc2ZDgzNGE5ZGQ5ZjgyNWVjNDNjZGEzNDA1ODU3ZjFkNmE0NTlkZTU0OWI1ZTNlMGNkZWZmZTQ4YjViZmZhNDgwMWFkZWRhZGEwNTA2MmNhNWQ1MjdkNGNjZmVhNGRkM2IxMjk0Y2M0NjZjYzIxNTA2NmU3N2Q1MDBjZjczM2Q4NGVjZThmZWJhZmQ5MWVhYjkzZGFiNDM2NDRiMGY0MTNjOWQ1MmM3NGE2NzAyMGI2Nzg=`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Sec-Ch-Ua": `Not/A)Brand";v="8", "Chromium";v="126`,
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
        };
    }

    /**
     * 获取股票IPO信息
     * @param {string} code 股票代码
     * @param {string} market 股票市场
     * @return {string} 股票IPO信息，格式 股票代码,上市日期，发行价
     */
    async getIPOInfo(code, market) {
        const response = await axios.get(`https://finance.pae.baidu.com/api/stockwidget`, {
            params: {
                code: code,
                market: 'ab',
                type: 'stock',
                widgetType: 'company',
                finClientType: 'pc'
            },
            headers: this.#getHeaders(),
        });

        let ipo = response.data.Result.content.companyInfo.ipoInfo;
        let issuePrice = ipo.endSubscription.subscriptionPrice; // 发行价
        let issueDate = ipo.listing.releaseDate; // 上市日期
        return {
            code: code,
            market: market,
            issuePrice: issuePrice,
            issueDate: issueDate,
        };
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
    async getKline(code, name, market, period, startDate, endDate) {
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
                    name: name,
                    is_kc: 0,
                    ktype: 'day',
                    finClientType: 'pc',
                    finClientType: 'pc',
                    all: 1,
                }
            });

            return this.#parseDayKline(response.data);
        } catch (error) {
            console.error('BaiduFinanceProvider getKLineData error:', error);
            throw error;
        }
    }

    #parseDayKline(data) {
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





    async searchStock(keyword) {
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