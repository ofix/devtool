/**
 * EMA 指数移动平均计算
 * @param {Array} data - 价格数据数组
 * @param {number} period - 周期
 * @returns {Array} EMA值数组
 */
export function calculateEMA (data, period) {
  if (!data || data.length === 0) return [];

  const ema = [];
  const k = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema[i] = data[i];
    } else {
      ema[i] = data[i] * k + ema[i - 1] * (1 - k);
    }
  }

  return ema;
}

/**
 * SMA 简单移动平均计算
 * @param {Array} data - 价格数据数组
 * @param {number} period - 周期
 * @returns {Array} SMA值数组
 */
export function calculateSMA (data, period) {
  if (!data || data.length < period) return [];

  const sma = [];

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    sma[i] = sum / period;
  }

  return sma;
}

/**
 * 计算涨跌幅
 * @param {number} current - 当前价格
 * @param {number} previous - 前一日价格
 * @returns {number} 涨跌幅
 */
export function calculateChangePercent (current, previous) {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * 计算振幅
 * @param {number} high - 最高价
 * @param {number} low - 最低价
 * @param {number} previousClose - 前收盘价
 * @returns {number} 振幅
 */
export function calculateAmplitude (high, low, previousClose) {
  if (!previousClose || previousClose === 0) return 0;
  return ((high - low) / previousClose) * 100;
}

/**
 * 计算成交量加权平均价格 (VWAP)
 * @param {Array} data - K线数据
 * @returns {number} VWAP
 */
export function calculateVWAP (data) {
  let totalValue = 0;
  let totalVolume = 0;

  for (const candle of data) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    totalValue += typicalPrice * candle.volume;
    totalVolume += candle.volume;
  }

  return totalVolume === 0 ? 0 : totalValue / totalVolume;
}

/**
 * 计算相对强弱指数 (RSI)
 * @param {Array} data - 价格数据
 * @param {number} period - 周期（默认14）
 * @returns {Array} RSI值数组
 */
export function calculateRSI (data, period = 14) {
  if (data.length < period + 1) return [];

  const rsi = [];
  let gains = 0;
  let losses = 0;

  // 计算初始平均涨跌幅
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = 100 - (100 / (1 + avgGain / avgLoss));

  // 计算后续RSI
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];

    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }

    rsi[i] = 100 - (100 / (1 + avgGain / avgLoss));
  }

  return rsi;
}

/**
 * 计算移动平均收敛散度 (MACD)
 * @param {Array} data - 价格数据
 * @returns {Object} MACD值 {macd, signal, histogram}
 */
export function calculateMACD (data) {
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  const dif = [];

  // DIF = EMA12 - EMA26
  for (let i = 0; i < data.length; i++) {
    dif[i] = ema12[i] - ema26[i];
  }

  // DEA = DIF的9日EMA
  const dea = calculateEMA(dif, 9);
  const macd = [];

  // MACD = (DIF - DEA) * 2
  for (let i = 0; i < data.length; i++) {
    macd[i] = (dif[i] - dea[i]) * 2;
  }

  return { dif, dea, macd };
}

/**
 * 计算布林带 (Bollinger Bands)
 * @param {Array} data - 价格数据
 * @param {number} period - 周期（默认20）
 * @param {number} stdDev - 标准差倍数（默认2）
 * @returns {Object} 布林带 {upper, middle, lower}
 */
export function calculateBollingerBands (data, period = 20, stdDev = 2) {
  const middle = calculateSMA(data, period);
  const upper = [];
  const lower = [];

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += Math.pow(data[i - j] - middle[i], 2);
    }
    const variance = sum / period;
    const standardDeviation = Math.sqrt(variance);

    upper[i] = middle[i] + standardDeviation * stdDev;
    lower[i] = middle[i] - standardDeviation * stdDev;
  }

  return { upper, middle, lower };
}