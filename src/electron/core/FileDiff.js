// ========== 全局枚举常量 ==========
export const CHAR_SEGMENT_TYPE = Object.freeze({
  EQUAL: 0,    // 相同
  DELETE: 1,   // 左侧删除
  INSERT: 2,   // 右侧插入
  REPLACE: 3   // 替换
});

// ========== 工具函数：字符级差异对比（极简可靠版） ==========
function getCharDiff (leftStr, rightStr) {
  const leftSegments = [];
  const rightSegments = [];

  // 空值处理
  if (leftStr === '' && rightStr === '') {
    return { left: leftSegments, right: rightSegments };
  }
  if (leftStr === '') {
    rightSegments.push({
      t: CHAR_SEGMENT_TYPE.INSERT,
      v: rightStr,
      s: 0,
      e: rightStr.length - 1
    });
    return { left: leftSegments, right: rightSegments };
  }
  if (rightStr === '') {
    leftSegments.push({
      t: CHAR_SEGMENT_TYPE.DELETE,
      v: leftStr,
      s: 0,
      e: leftStr.length - 1
    });
    return { left: leftSegments, right: rightSegments };
  }

  // 完全相同
  if (leftStr === rightStr) {
    leftSegments.push({
      t: CHAR_SEGMENT_TYPE.EQUAL,
      v: leftStr,
      s: 0,
      e: leftStr.length - 1
    });
    rightSegments.push({
      t: CHAR_SEGMENT_TYPE.EQUAL,
      v: rightStr,
      s: 0,
      e: rightStr.length - 1
    });
    return { left: leftSegments, right: rightSegments };
  }

  // 极简字符差异对比：找最长公共前缀 → 找差异 → 找最长公共后缀
  const minLen = Math.min(leftStr.length, rightStr.length);
  let prefixLen = 0;

  // 找公共前缀
  while (prefixLen < minLen && leftStr[prefixLen] === rightStr[prefixLen]) {
    prefixLen++;
  }

  // 找公共后缀
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    leftStr[leftStr.length - 1 - suffixLen] === rightStr[rightStr.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // 构建字符段
  // 公共前缀
  if (prefixLen > 0) {
    const prefix = leftStr.substring(0, prefixLen);
    leftSegments.push({
      t: CHAR_SEGMENT_TYPE.EQUAL,
      v: prefix,
      s: 0,
      e: prefixLen - 1
    });
    rightSegments.push({
      t: CHAR_SEGMENT_TYPE.EQUAL,
      v: prefix,
      s: 0,
      e: prefixLen - 1
    });
  }

  // 差异部分
  const leftDiff = leftStr.substring(prefixLen, leftStr.length - suffixLen);
  const rightDiff = rightStr.substring(prefixLen, rightStr.length - suffixLen);

  if (leftDiff && rightDiff) {
    // 替换
    leftSegments.push({
      t: CHAR_SEGMENT_TYPE.REPLACE,
      v: leftDiff,
      s: prefixLen,
      e: prefixLen + leftDiff.length - 1
    });
    rightSegments.push({
      t: CHAR_SEGMENT_TYPE.REPLACE,
      v: rightDiff,
      s: prefixLen,
      e: prefixLen + rightDiff.length - 1
    });
  } else if (leftDiff) {
    // 左侧删除
    leftSegments.push({
      t: CHAR_SEGMENT_TYPE.DELETE,
      v: leftDiff,
      s: prefixLen,
      e: prefixLen + leftDiff.length - 1
    });
  } else if (rightDiff) {
    // 右侧插入
    rightSegments.push({
      t: CHAR_SEGMENT_TYPE.INSERT,
      v: rightDiff,
      s: prefixLen,
      e: prefixLen + rightDiff.length - 1
    });
  }

  // 公共后缀
  if (suffixLen > 0) {
    const suffix = leftStr.substring(leftStr.length - suffixLen);
    leftSegments.push({
      t: CHAR_SEGMENT_TYPE.EQUAL,
      v: suffix,
      s: leftStr.length - suffixLen,
      e: leftStr.length - 1
    });
    rightSegments.push({
      t: CHAR_SEGMENT_TYPE.EQUAL,
      v: suffix,
      s: rightStr.length - suffixLen,
      e: rightStr.length - 1
    });
  }

  return { left: leftSegments, right: rightSegments };
}

// ========== 核心函数：文件内容比对（极简可靠，无嵌套） ==========
export function diffFileContent (leftLines, rightLines) {
  try {
    const result = { l: [], r: [] };
    const maxLines = Math.max(leftLines.length, rightLines.length);

    // 逐行对比（最稳定的行对齐方式）
    for (let i = 0; i < maxLines; i++) {
      const leftLine = leftLines[i] || '';
      const rightLine = rightLines[i] || '';

      // 计算当前行的字符差异
      const charDiff = getCharDiff(leftLine, rightLine);
      result.l.push(charDiff.left);
      result.r.push(charDiff.right);
    }

    // 关键：只返回单层结构，绝对无嵌套
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