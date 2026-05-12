// test-sse.js
const EventSource = require('eventsource');

// 配置参数
const config = {
    // 上海莱士（深圳市场：0.002252）
    symbol: '002252',
    market: '0',        // 0=深圳, 1=上海
    ndays: 1,           // 获取最近1天数据
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f17',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58'
};

// 构建 SSE 接口 URL（使用你最初提供的接口结构）
const buildSSEUrl = () => {
    const baseUrl = 'https://99.push2.eastmoney.com/api/qt/stock/trends2/sse';
    const params = new URLSearchParams({
        secid: `${config.market}.${config.symbol}`,
        fields1: config.fields1,
        fields2: config.fields2,
        mpi: '1000',
        ut: 'fa5fd1943c7b386f172d6893dbfba10b',
        ndays: config.ndays,
        iscr: '0',
        iscca: '0',
        wbp2u: '|0|0|0|web'
    });

    return `${baseUrl}?${params.toString()}`;
};

// 解析分时数据行
const parseTrendData = (dataStr) => {
    if (!dataStr) return null;

    // 数据格式示例: "2025-05-12 09:30,6.88,6.85,12345,8500000"
    const parts = dataStr.split(',');
    if (parts.length < 5) return { raw: dataStr };

    return {
        time: parts[0],           // 时间点
        price: parseFloat(parts[1]),     // 最新价
        avgPrice: parseFloat(parts[2]),  // 均价
        volume: parseInt(parts[3]),      // 成交量
        amount: parseFloat(parts[4]),    // 成交额
        raw: dataStr
    };
};

// 主函数：连接 SSE 并接收数据
const testSSE = () => {
    const url = buildSSEUrl();
    console.log('📡 连接 SSE 接口:', url);
    console.log('⏱️  开始时间:', new Date().toISOString());
    console.log('─'.repeat(60));

    let messageCount = 0;

    // 创建 SSE 客户端连接（Node.js 环境需要 eventsource 包）
    const es = new EventSource(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://quote.eastmoney.com/',
            'Origin': 'https://quote.eastmoney.com'
        }
    });

    // 监听消息事件
    es.onmessage = (event) => {
        messageCount++;
        const parsed = parseTrendData(event.data);

        console.log(`\n📨 消息 #${messageCount} [${new Date().toLocaleTimeString()}]`);
        if (parsed && parsed.price) {
            console.log(`   时间: ${parsed.time}`);
            console.log(`   价格: ${parsed.price}`);
            console.log(`   均价: ${parsed.avgPrice}`);
            console.log(`   成交量: ${parsed.volume}`);
            console.log(`   成交额: ${parsed.amount}`);
        } else {
            console.log(`   原始数据: ${event.data.substring(0, 100)}${event.data.length > 100 ? '...' : ''}`);
        }
    };

    // 监听自定义事件（如果接口发送了 event 字段）
    es.addEventListener('error', (err) => {
        console.error('❌ SSE 错误事件:', err);
    });

    // 连接打开
    es.onopen = () => {
        console.log('✅ SSE 连接已建立');
    };

    // 全局错误处理（例如网络断开）
    es.onerror = (err) => {
        console.error('❌ 连接错误:', err.message || err);
        console.log('💡 提示: 可能是接口地址变更或网络问题');
        es.close();
    };

    // 运行 60 秒后自动关闭（避免一直运行）
    setTimeout(() => {
        console.log('\n' + '─'.repeat(60));
        console.log(`⏹️  测试结束，共收到 ${messageCount} 条消息`);
        es.close();
        process.exit(0);
    }, 600000);

    // 处理 Ctrl+C 优雅退出
    process.on('SIGINT', () => {
        console.log('\n\n👋 用户中断，关闭连接');
        es.close();
        process.exit(0);
    });
};

// 安装依赖检查
const checkDependencies = () => {
    try {
        require.resolve('eventsource');
        return true;
    } catch (e) {
        console.error('❌ 缺少依赖 eventsource');
        console.log('📦 请先安装: npm install eventsource');
        return false;
    }
};

// 启动测试
if (checkDependencies()) {
    testSSE();
}