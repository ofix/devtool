<template>
  <router-view />
</template>

<script setup>
import { onMounted, onUnmounted } from "vue";
onMounted(() => {
  // 获取设备的 DPR 值
  const dpr = window.devicePixelRatio || 1;
  document.documentElement.style.setProperty("--dpr", dpr);
  console.log("Device Pixel Ratio:", dpr);
});
</script>
