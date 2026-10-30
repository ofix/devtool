// 语法分析器：将 Token 数组转为 AST
// 采用优先级爬升法 (Pratt Parsing)

import { tokenize } from "./Tokenizer.js";

export function parse(text) {
    const tokens = tokenize(text);
    let pos = 0;

    function peek() { return tokens[pos]; }
    function consume() { return tokens[pos++]; }

    function parseExpression(minPrec = 0) {
        let left = parsePrimary();

        while (true) {
            const token = peek();
            if (token.type === "EOF" || token.type === "Paren") break;

            let op = null;
            let prec = 0;

            if (token.type === "Operator" || token.type === "Keyword") {
                op = token.value;
                if (op === "=" || op === "!=" || op === ">" || op === "<" || op === ">=" || op === "<=") prec = 40;
                else if (op === "CONTAINS" || op === "STARTSWITH" || op === "ENDSWITH" || op === "IN" || op === "IS NULL" || op === "IS NOT NULL") prec = 40;
                else if (op === "AND" || op === "&&") prec = 20;
                else if (op === "OR" || op === "||") prec = 10;
            }

            if (prec === 0 || prec < minPrec) break;

            consume(); // 吃掉操作符

            // 特判 IS NULL / IS NOT NULL，不需要右侧表达式
            if (op === "IS NULL" || op === "IS NOT NULL") {
                left = { type: "BinaryExpression", operator: op, left, right: { type: "Literal", value: null } };
                continue;
            }

            const right = parseExpression(prec + 1);
            left = { type: "BinaryExpression", operator: op, left, right };
        }

        return left;
    }

    function parsePrimary() {
        const token = consume();

        if (token.type === "Paren" && token.value === "(") {
            const expr = parseExpression(0);
            const close = consume();
            if (close.value !== ")") throw new Error("缺少右括号");
            return expr;
        }
        if (token.type === "Number") {
            return { type: "Literal", value: Number(token.value) };
        }
        if (token.type === "String") {
            return { type: "Literal", value: token.value };
        }
        if (token.type === "Keyword" && (token.value === "TRUE" || token.value === "FALSE")) {
            return { type: "Literal", value: token.value === "TRUE" };
        }
        if (token.type === "Keyword" && token.value === "NOT") {
            const expr = parseExpression(50);
            return { type: "UnaryExpression", operator: "NOT", argument: expr };
        }
        if (token.type === "Operator" && token.value === "!") {
            const expr = parseExpression(50);
            return { type: "UnaryExpression", operator: "!", argument: expr };
        }
        if (token.type === "Field") {
            return { type: "Identifier", name: token.value };
        }

        throw new Error(`语法错误: 意外的 Token "${token.value}"`);
    }

    const ast = parseExpression(0);
    if (peek().type !== "EOF") throw new Error("表达式未完整解析");
    return ast;
}
