<!-- 可视化条件构建器：生成符合我们表达式语法的文本 -->
<template>
    <div class="condition-builder">
        <div v-for="(cond, index) in conditions" :key="index" class="cond-row">
            <!-- 逻辑连接符 (第 2 行起显示) -->
            <div class="cond-logic" v-if="index > 0">
                <el-select v-model="cond.logic" size="small" style="width: 60px" @change="emitExpression">
                    <el-option label="AND" value="AND" />
                    <el-option label="OR" value="OR" />
                </el-select>
            </div>
            <div class="cond-logic-placeholder" v-else></div>

            <!-- 字段 -->
            <el-select v-model="cond.field" size="small" filterable class="cond-field" @change="emitExpression">
                <el-option v-for="col in columns" :key="col.name" :label="col.name" :value="col.name" />
            </el-select>

            <!-- 操作符 -->
            <el-select v-model="cond.operator" size="small" class="cond-op" @change="emitExpression">
                <el-option v-for="op in allowedOperators(cond.field)" :key="op.value" :label="op.label" :value="op.value" />
            </el-select>

            <!-- 值 (IS NULL 时隐藏) -->
            <el-input 
                v-if="!isNullOp(cond.operator)"
                v-model="cond.value" 
                size="small" 
                class="cond-val" 
                placeholder="值" 
                @input="emitExpression"
            />
            <div v-else class="cond-val-placeholder"></div>

            <!-- 删除按钮 -->
            <el-button size="small" text type="danger" @click="removeCondition(index)">
                <el-icon><Delete /></el-icon>
            </el-button>
        </div>

        <div class="cond-actions">
            <el-button size="small" text type="primary" @click="addCondition">+ 添加条件</el-button>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { Delete } from "@element-plus/icons-vue";

const props = defineProps({
    modelValue: { type: String, default: "" },
    columns: { type: Array, default: () => [] }
});
const emit = defineEmits(["update:modelValue"]);

// 内部状态：条件行数组
const conditions = ref([]);

// 初始化：尝试从简单的表达式反解（目前仅支持全新构建）
onMounted(() => {
    if (props.modelValue) {
        // 如果已有表达式，直接进入表达式模式，此处不强求反解
    }
});

const opList = [
    { label: "=", value: "=" },
    { label: "!=", value: "!=" },
    { label: ">", value: ">" },
    { label: "<", value: "<" },
    { label: ">=", value: ">=" },
    { label: "<=", value: "<=" },
    { label: "CONTAINS", value: "CONTAINS" },
    { label: "STARTSWITH", value: "STARTSWITH" },
    { label: "ENDSWITH", value: "ENDSWITH" },
    { label: "IS NULL", value: "IS NULL" },
    { label: "IS NOT NULL", value: "IS NOT NULL" },
];

function allowedOperators(fieldName) {
    const col = props.columns.find(c => c.name === fieldName);
    if (!col) return opList;
    // 简单的类型过滤（详细依赖 TypeCheck 层）
    if (col.type === "number" || col.type === "date") {
        return opList.filter(op => !["CONTAINS", "STARTSWITH", "ENDSWITH"].includes(op.value));
    }
    if (col.type === "string") {
        return opList.filter(op => !["<", ">", "<=", ">="].includes(op.value));
    }
    return opList;
}

function isNullOp(op) {
    return op === "IS NULL" || op === "IS NOT NULL";
}

function addCondition() {
    conditions.value.push({
        logic: "AND",
        field: props.columns.length > 0 ? props.columns[0].name : "",
        operator: "=",
        value: ""
    });
    emitExpression();
}

function removeCondition(index) {
    conditions.value.splice(index, 1);
    emitExpression();
}

/**
 * 将可视化行合成为表达式字符串
 */
function emitExpression() {
    const expr = conditions.value.map((cond, idx) => {
        let str = "";
        if (idx > 0) str += ` ${cond.logic} `;

        // 处理 IS NULL
        if (isNullOp(cond.operator)) {
            str += `${cond.field} ${cond.operator}`;
            return str;
        }

        // 处理字符串字段：值需要加双引号
        const col = props.columns.find(c => c.name === cond.field);
        let val = cond.value;
        if (col && (col.type === "string" || col.type === "date")) {
            // 如果用户没加引号，自动加上
            if (!val.startsWith('"')) {
                val = `"${val}"`;
            }
        }

        str += `${cond.field} ${cond.operator} ${val}`;
        return str;
    }).join("");

    emit("update:modelValue", expr);
}

// 初始化第一行
watch(() => props.columns, (newCols) => {
    if (newCols.length > 0 && conditions.value.length === 0) {
        addCondition();
    }
}, { immediate: true });
</script>

<style scoped>
.condition-builder {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
}
.cond-row {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
}
.cond-logic {
    flex-shrink: 0;
}
.cond-logic-placeholder {
    width: 60px;
    flex-shrink: 0;
}
.cond-field {
    flex: 1;
    min-width: 0;
}
.cond-op {
    width: 90px;
    flex-shrink: 0;
}
.cond-val {
    flex: 1;
    min-width: 0;
}
.cond-val-placeholder {
    flex: 1;
}
.cond-actions {
    display: flex;
    justify-content: flex-start;
}
</style>
