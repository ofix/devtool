// 编译期：将 AST 编译为快速闭包 (row) => value

import { resolvePath } from "./ResolvePath.js";

export function compile(ast) {
    function compileNode(node) {
        if (node.type === "Literal") {
            const val = node.value;
            return () => val;
        }
        
        if (node.type === "Identifier") {
            const name = node.name;
            return (row) => resolvePath(row, name);
        }

        if (node.type === "UnaryExpression") {
            const argFn = compileNode(node.argument);
            if (node.operator === "NOT" || node.operator === "!") {
                return (row) => !argFn(row);
            }
        }

        if (node.type === "BinaryExpression") {
            const leftFn = compileNode(node.left);
            const rightFn = compileNode(node.right);
            const op = node.operator;

            switch (op) {
                case "=": return (row) => leftFn(row) === rightFn(row);
                case "!=": return (row) => leftFn(row) !== rightFn(row);
                case ">": return (row) => leftFn(row) > rightFn(row);
                case "<": return (row) => leftFn(row) < rightFn(row);
                case ">=": return (row) => leftFn(row) >= rightFn(row);
                case "<=": return (row) => leftFn(row) <= rightFn(row);
                
                case "AND":
                case "&&": return (row) => leftFn(row) && rightFn(row);
                case "OR":
                case "||": return (row) => leftFn(row) || rightFn(row);

                case "CONTAINS": return (row) => String(leftFn(row) || "").includes(String(rightFn(row)));
                case "STARTSWITH": return (row) => String(leftFn(row) || "").startsWith(String(rightFn(row)));
                case "ENDSWITH": return (row) => String(leftFn(row) || "").endsWith(String(rightFn(row)));
                case "IN": {
                    return (row) => {
                        const arr = rightFn(row);
                        if (!Array.isArray(arr)) return false;
                        return arr.includes(leftFn(row));
                    };
                }

                case "IS NULL": return (row) => leftFn(row) === null || leftFn(row) === undefined || leftFn(row) === "";
                case "IS NOT NULL": return (row) => leftFn(row) !== null && leftFn(row) !== undefined && leftFn(row) !== "";
                
                default:
                    throw new Error(`未实现的操作符: ${op}`);
            }
        }
        throw new Error(`无法编译的节点类型: ${node.type}`);
    }

    return compileNode(ast);
}
