<template>
  <div class="page-file-compare">
    <div class="big-tip">{{ tip }}</div>
  </div>
</template>

<script>
export default {
  name: "FileCompare",
  data() {
    return {
      tip: "文件比对页面",
    };
  },
  computed: {},
  methods: {},
};
</script>

<style lang="scss" scoped>
.page-compare {
  .big-tip {
    font-size: 28px;
    color: #00ff00;
  }
}
</style>
