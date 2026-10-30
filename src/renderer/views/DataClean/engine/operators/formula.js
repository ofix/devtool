// Formula 算子：计算列，复用表达式系统
import { parse } from "../../expression/Parser.js";
import { compile } from "../../expression/Compile.js";

export default {
    type: "formula",
    meta: {
        label: "Formula",
        icon: "IconCalculator",
        color: "#eab308",
        category: "prepare",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "newField", label: "输出列名", component: "input" },
        { field: "expression", label: "公式", component: "expression" },
    ],
    execute(inputs, params, ctx) {
        const data = inputs[0];
        if (!data || !data.rows) return { rows: [], columns: [] };
        
        const { newField, expression } = params;
        if (!newField || !expression) return data;

        let fn;
        try {
            const ast = parse(expression);
            fn = compile(ast);
        } catch (err) {
            throw new Error(`公式语法错误: ${err.message}`);
        }

        const outRows = data.rows.map(row => {
            let val;
            try {
                val = fn(row);
            } catch (e) {
                val = null;
            }
            return { ...row, [newField]: val };
        });

        let newColType = "string";
        if (outRows.length > 0 && typeof outRows[0][newField] === "number") newColType = "number";
        if (outRows.length > 0 && typeof outRows[0][newField] === "boolean") newColType = "boolean";

        const outCols = [...data.columns, { name: newField, type: newColType }];
        return { rows: outRows, columns: outCols };
    },
};
