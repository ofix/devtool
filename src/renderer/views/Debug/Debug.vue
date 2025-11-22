<template>
  <div class="page-debug">
    <div class="big-tip">{{ tip }}</div>
  </div>
</template>

<script>
export default {
  name: "Debug",
  data() {
    return {
      tip: "调试页面",
    };
  },
  computed: {},
  methods: {},
};
</script>

<style lang="scss" scoped>
.page-debug {
  .big-tip {
    font-size: 28px;
    color: #00ff00;
  }
}
</style>
