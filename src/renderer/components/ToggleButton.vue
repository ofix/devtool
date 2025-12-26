<template>
  <el-button @click="toggleText">{{ visibleText }}</el-button>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  values: {
    type: Array,
    default: () => ["确认", "取消"],
    validator: (values) => Array.isArray(values) && values.length === 2,
  },
});

const index = ref(0);

const visibleText = computed(() => {
  return props.values[index.value];
});

const toggleText = () => {
  index.value = index.value === 0 ? 1 : 0;
};
</script>
