// Sort 算子：单级排序（多级可在后续扩展）
export default {
    type: "sort",
    meta: {
        label: "Sort",
        icon: "IconSort",
        color: "#10b981",
        category: "prepare",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "field", label: "排序字段", component: "fieldSelect", multiple: false },
        { field: "order", label: "顺序", component: "select", options: [
            { label: "升序", value: "asc" },
            { label: "降序", value: "desc" },
        ]},
    ],
    execute(inputs, params) {
        const data = inputs[0];
        if (!data || !data.rows || !params.field) return data;

        const { field, order } = params;
        const isAsc = order !== "desc";

        const sortedRows = [...data.rows].sort((a, b) => {
            let va = a[field];
            let vb = b[field];
            
            if (va == null) va = "";
            if (vb == null) vb = "";

            if (typeof va === "number" && typeof vb === "number") {
                return isAsc ? va - vb : vb - va;
            }
            
            const strA = String(va);
            const strB = String(vb);
            return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
        });

        return { rows: sortedRows, columns: data.columns };
    },
};
