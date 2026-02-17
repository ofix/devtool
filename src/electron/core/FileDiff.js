// 操作类型数字常量
export const OP_TYPE = Object.freeze({
  EQUAL: 0,
  DELETE: 1,
  INSERT: 2,
  REPLACE: 3
});

// 字符段类型常量
export const CHAR_SEGMENT_TYPE = Object.freeze({
  EQUAL: 0,    // 相同
  DELETE: 1,   // 左侧删除
  INSERT: 2,   // 右侧插入
  REPLACE: 3   // 替换
});

// ========== 性能优化：缓存池 - 减少对象创建销毁 ==========
const BufferPool = {
  getBuffer () {
    return { left: [], right: [], type: -1 };
  },
  resetBuffer (buffer) {
    buffer.left.length = 0;
    buffer.right.length = 0;
    buffer.type = -1;
    return buffer;
  }
};

// ========== 工具函数：优化版字符串相似度计算 ==========
function calculateSimilarity (a, b) {
  // 快速返回：完全相同/空值情况
  if (a === b) return 1.0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0.0;

  // 性能优化：使用一维数组替代二维数组（空间复杂度 O(min(n,m))）
  const [short, long] = aLen < bLen ? [a, b] : [b, a];
  const shortLen = short.length;
  const longLen = long.length;

  // 只维护两行DP数据
  let prevRow = new Array(shortLen + 1);
  let currRow = new Array(shortLen + 1);

  // 初始化第一行
  for (let i = 0; i <= shortLen; i++) {
    prevRow[i] = 0;
  }

  // 填充DP表（优化循环）
  let lcsLength = 0;
  for (let i = 1; i <= longLen; i++) {
    currRow[0] = 0;
    const longChar = long[i - 1];

    for (let j = 1; j <= shortLen; j++) {
      if (longChar === short[j - 1]) {
        currRow[j] = prevRow[j - 1] + 1;
        if (currRow[j] > lcsLength) {
          lcsLength = currRow[j];
        }
      } else {
        currRow[j] = Math.max(prevRow[j], currRow[j - 1]);
      }
    }

    // 交换行引用（避免数组重建）
    [prevRow, currRow] = [currRow, prevRow];
  }

  // 释放内存
  prevRow = currRow = null;

  return lcsLength / Math.max(aLen, bLen);
}

// ========== 性能优化版：字符级 Myers 算法 ==========
function charLevelDiff (aStr, bStr) {
  const aLen = aStr.length;
  const bLen = bStr.length;

  // 快速返回：空值/完全相同
  if (aLen === 0 && bLen === 0) return { left: [], right: [] };
  if (aStr === bStr) {
    return {
      left: [{ t: CHAR_SEGMENT_TYPE.EQUAL, v: aStr, /*s: 0, e: aLen - 1*/ }],
      right: [{ t: CHAR_SEGMENT_TYPE.EQUAL, v: "",/*bStr, s: 0, e: bLen - 1*/ }]
    };
  }

  // 性能优化：使用一维数组存储操作类型（替代二维op数组）
  const maxLen = Math.max(aLen, bLen) + 1;
  const dp = new Array((aLen + 1) * (bLen + 1)).fill(0);
  const op = new Array((aLen + 1) * (bLen + 1)).fill(0);

  // 计算索引的辅助函数（二维转一维）
  const getIdx = (i, j) => i * (bLen + 1) + j;

  // 初始化边界（数字常量替代字符串）
  for (let i = 0; i <= aLen; i++) {
    dp[getIdx(i, 0)] = i;
    op[getIdx(i, 0)] = OP_TYPE.DELETE;
  }
  for (let j = 0; j <= bLen; j++) {
    dp[getIdx(0, j)] = j;
    op[getIdx(0, j)] = OP_TYPE.INSERT;
  }

  // 填充DP表和操作表（优化循环，减少属性访问）
  for (let i = 1; i <= aLen; i++) {
    const aChar = aStr[i - 1];
    const iPrev = i - 1;
    const rowStart = i * (bLen + 1);

    for (let j = 1; j <= bLen; j++) {
      const jPrev = j - 1;
      const idx = rowStart + j;

      if (aChar === bStr[jPrev]) {
        dp[idx] = dp[getIdx(iPrev, jPrev)];
        op[idx] = OP_TYPE.EQUAL;
      } else {
        const delCost = dp[getIdx(iPrev, j)] + 1;
        const insCost = dp[getIdx(i, jPrev)] + 1;
        const repCost = dp[getIdx(iPrev, jPrev)] + 1;

        dp[idx] = Math.min(delCost, insCost, repCost);

        if (dp[idx] === repCost) {
          op[idx] = OP_TYPE.REPLACE;
        } else if (dp[idx] === delCost) {
          op[idx] = OP_TYPE.DELETE;
        } else {
          op[idx] = OP_TYPE.INSERT;
        }
      }
    }
  }

  // 回溯生成字符段（优化：正向构建，避免reverse）
  const segments = { left: [], right: [] };
  let i = aLen, j = bLen;
  const tempSegments = [];

  // 复用缓冲区，避免频繁创建数组
  const buffer = BufferPool.getBuffer();

  // 刷新缓冲区的辅助函数（优化：减少属性访问）
  const flushBuffer = () => {
    if (buffer.left.length === 0 && buffer.right.length === 0) return;

    const leftStr = buffer.left.join('');
    const rightStr = buffer.right.join('');
    const type = buffer.type;

    const seg = {
      left: [],
      right: []
    };

    if (type === OP_TYPE.EQUAL) {
      seg.left.push({
        t: CHAR_SEGMENT_TYPE.EQUAL,
        v: leftStr,
        s: i,
        e: i + leftStr.length - 1
      });
      seg.right.push({
        t: CHAR_SEGMENT_TYPE.EQUAL,
        v: rightStr,
        s: j,
        e: j + rightStr.length - 1
      });
    } else if (type === OP_TYPE.REPLACE) {
      seg.left.push({
        t: CHAR_SEGMENT_TYPE.REPLACE,
        v: leftStr,
        s: i,
        e: i + leftStr.length - 1
      });
      seg.right.push({
        t: CHAR_SEGMENT_TYPE.REPLACE,
        v: rightStr,
        s: j,
        e: j + rightStr.length - 1
      });
    } else if (type === OP_TYPE.DELETE) {
      seg.left.push({
        t: CHAR_SEGMENT_TYPE.DELETE,
        v: leftStr,
        s: i,
        e: i + leftStr.length - 1
      });
    } else if (type === OP_TYPE.INSERT) {
      seg.right.push({
        t: CHAR_SEGMENT_TYPE.INSERT,
        v: rightStr,
        s: j,
        e: j + rightStr.length - 1
      });
    }

    tempSegments.push(seg);
    BufferPool.resetBuffer(buffer);
  };

  // 回溯主逻辑（数字常量比对，性能提升显著）
  while (i > 0 || j > 0) {
    const currentOp = op[getIdx(i, j)];

    if (currentOp === OP_TYPE.EQUAL) {
      if (buffer.type !== OP_TYPE.EQUAL && buffer.type !== -1) {
        flushBuffer();
      }
      buffer.type = OP_TYPE.EQUAL;
      buffer.left.unshift(aStr[i - 1]); // 优化：unshift替代后续reverse
      buffer.right.unshift(bStr[j - 1]);
      i--;
      j--;
    } else if (currentOp === OP_TYPE.REPLACE) {
      if (buffer.type !== OP_TYPE.REPLACE && buffer.type !== -1) {
        flushBuffer();
      }
      buffer.type = OP_TYPE.REPLACE;
      buffer.left.unshift(aStr[i - 1]);
      buffer.right.unshift(bStr[j - 1]);
      i--;
      j--;
    } else if (currentOp === OP_TYPE.DELETE) {
      if (buffer.type !== OP_TYPE.DELETE && buffer.type !== -1) {
        flushBuffer();
      }
      buffer.type = OP_TYPE.DELETE;
      buffer.left.unshift(aStr[i - 1]);
      i--;
    } else if (currentOp === OP_TYPE.INSERT) {
      if (buffer.type !== OP_TYPE.INSERT && buffer.type !== -1) {
        flushBuffer();
      }
      buffer.type = OP_TYPE.INSERT;
      buffer.right.unshift(bStr[j - 1]);
      j--;
    }
  }

  // 刷新最后一个缓冲区
  flushBuffer();

  // 合并临时段（避免reverse操作）
  for (let k = tempSegments.length - 1; k >= 0; k--) {
    const seg = tempSegments[k];
    segments.left.push(...seg.left);
    segments.right.push(...seg.right);
  }

  // 修正位置信息（优化循环）
  let leftPos = 0;
  const leftSegs = segments.left;
  const leftSegsLen = leftSegs.length;
  for (let k = 0; k < leftSegsLen; k++) {
    const seg = leftSegs[k];
    seg.s = leftPos;
    seg.e = leftPos + seg.v.length - 1;
    leftPos = seg.e + 1;
  }

  let rightPos = 0;
  const rightSegs = segments.right;
  const rightSegsLen = rightSegs.length;
  for (let k = 0; k < rightSegsLen; k++) {
    const seg = rightSegs[k];
    seg.s = rightPos;
    seg.e = rightPos + seg.v.length - 1;
    rightPos = seg.e + 1;
  }

  // 释放内存
  dp.fill(0);
  op.fill(0);

  return segments;
}

// ========== 性能优化版：智能行对齐算法 ==========
function smartLineAlign (leftLines, rightLines) {
  const n = leftLines.length;
  const m = rightLines.length;

  // 快速返回：空值情况
  if (n === 0) {
    return rightLines.map((line, j) => ({
      type: 2, // INSERT (数字常量)
      leftIdx: -1,
      rightIdx: j,
      leftLine: '',
      rightLine: line
    }));
  }
  if (m === 0) {
    return leftLines.map((line, i) => ({
      type: 1, // DELETE (数字常量)
      leftIdx: i,
      rightIdx: -1,
      leftLine: line,
      rightLine: ''
    }));
  }

  const SIMILARITY_THRESHOLD = 0.6;

  // 性能优化：使用TypedArray提升布尔数组性能
  const matchedLeft = new Uint8Array(n); // 0 = false, 1 = true
  const matchedRight = new Uint8Array(m);

  const alignment = [];

  // 第一步：匹配完全相同的行（优化循环）
  for (let i = 0; i < n; i++) {
    if (matchedLeft[i]) continue;

    const leftLine = leftLines[i];
    let found = false;

    for (let j = 0; j < m; j++) {
      if (matchedRight[j]) continue;

      if (leftLine === rightLines[j]) {
        alignment.push({
          type: 0, // MATCH (数字常量)
          leftIdx: i,
          rightIdx: j,
          leftLine,
          rightLine: rightLines[j]
        });
        matchedLeft[i] = 1;
        matchedRight[j] = 1;
        found = true;
        break;
      }
    }

    if (found) continue;
  }

  // 第二步：匹配相似度高的行（优化：减少重复计算）
  for (let i = 0; i < n; i++) {
    if (matchedLeft[i]) continue;

    const leftLine = leftLines[i];
    let bestJ = -1;
    let bestSimilarity = 0;

    for (let j = 0; j < m; j++) {
      if (matchedRight[j]) continue;

      const similarity = calculateSimilarity(leftLine, rightLines[j]);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestJ = j;
      }
    }

    if (bestSimilarity >= SIMILARITY_THRESHOLD) {
      alignment.push({
        type: 3, // MODIFY (数字常量)
        leftIdx: i,
        rightIdx: bestJ,
        leftLine,
        rightLine: rightLines[bestJ]
      });
      matchedLeft[i] = 1;
      matchedRight[bestJ] = 1;
    }
  }

  // 第三步：处理剩余行（优化循环）
  for (let i = 0; i < n; i++) {
    if (!matchedLeft[i]) {
      alignment.push({
        type: 1, // DELETE
        leftIdx: i,
        rightIdx: -1,
        leftLine: leftLines[i],
        rightLine: ''
      });
    }
  }

  for (let j = 0; j < m; j++) {
    if (!matchedRight[j]) {
      alignment.push({
        type: 2, // INSERT
        leftIdx: -1,
        rightIdx: j,
        leftLine: '',
        rightLine: rightLines[j]
      });
    }
  }

  // 排序优化：减少属性访问
  alignment.sort((a, b) => {
    const aPos = a.leftIdx !== -1 ? a.leftIdx : a.rightIdx;
    const bPos = b.leftIdx !== -1 ? b.leftIdx : b.rightIdx;
    return aPos - bPos;
  });

  return alignment;
}

// ========== 核心函数：性能优化版文件内容比对 ==========
export function diffFileContent (leftLines, rightLines) {
  try {
    // 输入验证和标准化（优化：减少数组拷贝）
    const left = Array.isArray(leftLines) ? leftLines : [];
    const right = Array.isArray(rightLines) ? rightLines : [];

    const result = { l: [], r: [] };

    // 快速返回：空值情况
    if (left.length === 0 && right.length === 0) {
      return { success: true, diffResult: result };
    }

    // 第一步：智能行对齐
    const alignment = smartLineAlign(left, right);
    const alignLen = alignment.length;

    // 第二步：逐行处理（优化：数字switch替代字符串）
    for (let k = 0; k < alignLen; k++) {
      const alignItem = alignment[k];
      let charDiff;

      // 数字类型switch（性能远高于字符串）
      switch (alignItem.type) {
        case 0: // MATCH
          charDiff = charLevelDiff(alignItem.leftLine, alignItem.rightLine);
          break;

        case 3: // MODIFY
          charDiff = charLevelDiff(alignItem.leftLine, alignItem.rightLine);
          break;

        case 1: // DELETE
          charDiff = {
            left: [{
              t: CHAR_SEGMENT_TYPE.DELETE,
              v: alignItem.leftLine,
              s: 0,
              e: alignItem.leftLine.length - 1
            }],
            right: []
          };
          break;

        case 2: // INSERT
          charDiff = {
            left: [],
            right: [{
              t: CHAR_SEGMENT_TYPE.INSERT,
              v: alignItem.rightLine,
              s: 0,
              e: alignItem.rightLine.length - 1
            }]
          };
          break;
      }

      result.l.push(charDiff.left);
      result.r.push(charDiff.right);
    }

    return {
      success: true,
      diffResult: result
    };
  } catch (error) {
    console.error('Diff 计算错误：', error);
    return {
      success: false,
      error: error.message,
      diffResult: { l: [], r: [] }
    };
  }
}