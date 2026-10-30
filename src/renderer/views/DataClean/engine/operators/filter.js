// Filter 算子：接入表达式引擎，支持过滤当前数据集

import { parse } from "../../expression/Parser.js";
import { typeCheck } from "../../expression/TypeCheck.js";
import { compile } from "../../expression/Compile.js";

export default {
    type: "filter",
    meta: {
        label: "Filter",
        icon: "IconFilter",
        color: "#f59e0b",
        category: "prepare",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "expression", label: "条件", component: "expression" },
    ],
    execute(inputs, params, ctx) {
        const data = inputs[0];
        if (!data || !data.rows) return { rows: [], columns: [] };

        const exprText = params.expression;
        if (!exprText || !exprText.trim()) {
            return data; // 空表达式透传
        }

        // 1. 解析 & 编译
        let ast;
        try {
            ast = parse(exprText);
            // 类型检查（依赖上游列信息）
            if (data.columns && data.columns.length > 0) {
                typeCheck(ast, data.columns);
            }
        } catch (err) {
            throw new Error(`表达式语法错误: ${err.message}`);
        }

        const fn = compile(ast);

        // 2. 过滤
        const filteredRows = [];
        for (const row of data.rows) {
            try {
                if (fn(row)) {
                    filteredRows.push(row);
                }
            } catch (err) {
                // 单行求值错误不中断整个流程，忽略该行
            }
        }

        return {
            rows: filteredRows,
            columns: data.columns,
        };
    },
};
