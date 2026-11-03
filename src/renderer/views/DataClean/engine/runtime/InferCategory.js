/**
 * 数据形态推断算法
 * @param {Array} rows 
 * @returns {"empty" | "scalar_array" | "json" | "table"}
 */
export function inferDataCategory(rows) {
    if (!rows || rows.length === 0) return "empty";

    const firstItem = rows[0];
    if (typeof firstItem !== "object" || firstItem === null) {
        return "scalar_array";
    }

    const sample = rows.slice(0, 100);
    for (const row of sample) {
        if (row === null || Array.isArray(row)) return "json";

        for (const key in row) {
            const val = row[key];
            if (val !== null && typeof val === "object") {
                return "json";
            }
        }
    }
    return "table";
}
