<!-- 参数行：CSS Grid 72px + 1fr，标签右对齐，控件左边缘对齐 -->
<template>
    <div class="param-row">
        <label class="param-label" :title="label">{{ label }}</label>
        <div class="param-control">
            <slot />
        </div>
    </div>
</template>

<script setup>
defineProps({
    label: { type: String, default: "" },
});
</script>

<style scoped>
.param-row {
    display: grid;
    grid-template-columns: 72px 1fr;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.param-label {
    text-align: right;
    font-size: 12px;
    line-height: 1.4;
    color: var(--dc-text-secondary, #64748b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.param-control {
    min-width: 0;
    display: flex;
    align-items: center;
}
</style>
