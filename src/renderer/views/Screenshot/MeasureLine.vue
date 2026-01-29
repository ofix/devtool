<template>
  <div class="measure-line">
    <IconMeasureLine />
  </div>
</template>
<script setup>
import IconMeasureLine from "@/components/icons/IconMeasureLine.vue";
</script>
<style type="scss">
html,
body {
  cursor: none !important;
}
.measure-line {
  box-sizing: border-box;
  overflow: hidden;
  width: 100%;
  height: 100%;
  color: #ee18d1;
  cursor: none !important;
  pointer-events: auto !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
}

.measure-line :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  flex-shrink: 0;
  cursor: none !important;
  pointer-events: auto !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
}
</style>
