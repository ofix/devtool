// Join 算子：左右表连接（支持多键复合 Join）
import { DATA_CATEGORY } from "../../constants/DataCategories.js"

// 结构化编码单个键值：类型前缀 + 长度前缀，杜绝类型混淆与分隔符冲突
function encodeKeyPart(val, coerceToString) {
  if (val === null || val === undefined) {
    return "N:"
  }
  if (coerceToString) {
    const s = String(val)
    return "S:" + s.length + ":" + s
  }
  const t = typeof val
  if (t === "number") {
    return "D:" + String(val)
  }
  if (t === "boolean") {
    return "B:" + (val ? "1" : "0")
  }
  if (t === "string") {
    return "S:" + val.length + ":" + val
  }
  const s = JSON.stringify(val)
  return "J:" + s.length + ":" + s
}

// 编码一行的复合键；若任一键为 null 且不允许 null 匹配，返回 null 表示该行不参与匹配
function encodeCompositeKey(row, joinKeys, side, coerceToString, nullMatchesNull) {
  const parts = []
  for (const k of joinKeys) {
    const v = row[k[side]]
    if ((v === null || v === undefined) && !nullMatchesNull) {
      return null
    }
    parts.push(encodeKeyPart(v, coerceToString))
  }
  return parts.join("|")
}

// 参数迁移：兼容旧单键配置 {leftKey, rightKey}
function normalizeParams(params) {
  const p = params || {}
  if (Array.isArray(p.joinKeys) && p.joinKeys.length > 0) {
    return p
  }
  if (p.leftKey && p.rightKey) {
    return {
      ...p,
      joinKeys: [{ left: p.leftKey, right: p.rightKey }],
    }
  }
  return { ...p, joinKeys: [] }
}

// 计算输出列映射：左表全部列 + 右表去掉右键列；重名列加后缀
function buildColumnPlan(leftColumns, rightColumns, joinKeys, leftSuffix, rightSuffix) {
  const leftSuffixFinal = leftSuffix === undefined ? "_left" : leftSuffix
  const rightSuffixFinal = rightSuffix === undefined ? "_right" : rightSuffix

  const rightKeyNames = new Set(joinKeys.map(k => k.right))

  const leftNames = new Set(leftColumns.map(c => c.name))
  const rightNames = new Set(rightColumns.map(c => c.name).filter(n => !rightKeyNames.has(n)))

  const outCols = []
  const leftRenameMap = new Map()
  for (const c of leftColumns) {
    const conflict = rightNames.has(c.name)
    const outName = conflict ? c.name + leftSuffixFinal : c.name
    leftRenameMap.set(c.name, outName)
    outCols.push({ name: outName, type: c.type })
  }
  const rightRenameMap = new Map()
  for (const c of rightColumns) {
    if (rightKeyNames.has(c.name)) {
      continue
    }
    const conflict = leftNames.has(c.name)
    const outName = conflict ? c.name + rightSuffixFinal : c.name
    rightRenameMap.set(c.name, outName)
    outCols.push({ name: outName, type: c.type })
  }

  return { outCols, leftRenameMap, rightRenameMap }
}

// 构建一行完整的输出（缺失的字段严格填充 null，解决 Right/Full Join 空行问题）
function buildOutputRow(leftRow, rightRow, leftRenameMap, rightRenameMap, outCols) {
  const out = {}

  // 填充左侧字段
  for (const [src, dst] of leftRenameMap) {
    out[dst] = leftRow !== null && leftRow[src] !== undefined ? leftRow[src] : null
  }

  // 填充右侧字段
  for (const [src, dst] of rightRenameMap) {
    out[dst] = rightRow !== null && rightRow[src] !== undefined ? rightRow[src] : null
  }

  // 防御性校验：确保输出列都存在
  for (const col of outCols) {
    if (!(col.name in out)) {
      out[col.name] = null
    }
  }
  return out
}

export default {
  type: "join",
  meta: {
    label: "Join",
    icon: "IconLink",
    color: "#6366f1",
    category: "join",
    inputs: 2,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  normalizeParams,
  schema: [
    {
      field: "joinKeys",
      label: "连接键配置",
      component: "joinKeyList",
      componentProps: {
        leftInputId: "in-0",
        rightInputId: "in-1",
      },
    },
    {
      field: "joinType",
      label: "连接方式",
      component: "select",
      defaultValue: "inner",
      options: [
        { label: "Inner", value: "inner" },
        { label: "Left", value: "left" },
        { label: "Right", value: "right" },
        { label: "Full", value: "full" },
        { label: "Anti", value: "anti" },
      ],
    },
    {
      field: "leftSuffix",
      label: "左表冲突后缀",
      component: "input",
      defaultValue: "_left",
      group: "advanced",
    },
    {
      field: "rightSuffix",
      label: "右表冲突后缀",
      component: "input",
      defaultValue: "_right",
      group: "advanced",
    },
    {
      field: "nullMatchesNull",
      label: "NULL 视为相等",
      component: "switch",
      defaultValue: false,
      group: "advanced",
    },
    {
      field: "coerceToString",
      label: "键值转字符串比较",
      component: "switch",
      defaultValue: false,
      group: "advanced",
    },
  ],
  execute(inputs, params) {
    const left = inputs[0] || { rows: [], columns: [] }
    const right = inputs[1] || { rows: [], columns: [] }
    const p = normalizeParams(params)
    const {
      joinKeys,
      joinType = "inner",
      leftSuffix,
      rightSuffix,
      nullMatchesNull = false,
      coerceToString = false,
    } = p

    // 空连接键：UI 不提示，执行时抛错，由预览面板暴露
    if (!Array.isArray(joinKeys) || joinKeys.length === 0) {
      throw new Error("Join 算子未配置连接键，请在节点参数中至少添加一组")
    }
    for (const k of joinKeys) {
      if (!k || !k.left || !k.right) {
        throw new Error("Join 算子存在未配置完整的连接键")
      }
    }

    // 连接键字段必须存在于对应输入列中
    const leftColNames = new Set(left.columns.map(c => c.name))
    const rightColNames = new Set(right.columns.map(c => c.name))
    for (const k of joinKeys) {
      if (!leftColNames.has(k.left)) {
        throw new Error("Join 左表连接键字段不存在：" + k.left)
      }
      if (!rightColNames.has(k.right)) {
        throw new Error("Join 右表连接键字段不存在：" + k.right)
      }
    }

    const { outCols, leftRenameMap, rightRenameMap } = buildColumnPlan(
      left.columns,
      right.columns,
      joinKeys,
      leftSuffix,
      rightSuffix,
    )

    // 右表建哈希：复合键 -> 行数组
    const rightMap = new Map()
    for (const row of right.rows) {
      const key = encodeCompositeKey(row, joinKeys, "right", coerceToString, nullMatchesNull)
      if (key === null) {
        continue
      }
      if (!rightMap.has(key)) {
        rightMap.set(key, [])
      }
      rightMap.get(key).push(row)
    }

    const outRows = []
    const matchedRightKeys = new Set()

    // Anti Join：只推左表未匹配行
    if (joinType === "anti") {
      for (const leftRow of left.rows) {
        const key = encodeCompositeKey(leftRow, joinKeys, "left", coerceToString, nullMatchesNull)
        const matched = key !== null && rightMap.has(key)
        if (!matched) {
          outRows.push(buildOutputRow(leftRow, null, leftRenameMap, rightRenameMap, outCols))
        }
      }
      return { rows: outRows, columns: outCols }
    }

    // 其余类型：先遍历左表
    for (const leftRow of left.rows) {
      const key = encodeCompositeKey(leftRow, joinKeys, "left", coerceToString, nullMatchesNull)
      const matches = key !== null ? rightMap.get(key) || [] : []

      if (matches.length > 0) {
        matchedRightKeys.add(key)
        for (const rightRow of matches) {
          outRows.push(buildOutputRow(leftRow, rightRow, leftRenameMap, rightRenameMap, outCols))
        }
      } else if (joinType === "left" || joinType === "full") {
        outRows.push(buildOutputRow(leftRow, null, leftRenameMap, rightRenameMap, outCols))
      }
    }

    // Right / Full：补右表未匹配行
    if (joinType === "right" || joinType === "full") {
      for (const rightRow of right.rows) {
        const key = encodeCompositeKey(rightRow, joinKeys, "right", coerceToString, nullMatchesNull)
        const isMatched = key !== null && matchedRightKeys.has(key)
        if (!isMatched) {
          outRows.push(buildOutputRow(null, rightRow, leftRenameMap, rightRenameMap, outCols))
        }
      }
    }
    // 临时排查代码
    const nullRow = outRows.find(r => r.level === null || r.desc === null || r.left_key === null)
    if (nullRow) {
      console.log("【找到未匹配行的结构】", JSON.stringify(nullRow))
    } else {
      console.log("【没有找到任何 null 行】 outRows 总数:", outRows.length)
    }
    return { rows: outRows, columns: outCols }
  },
}
