<template>
  <el-card class="config-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="icon-text"><IconSpider/>爬虫策略</span>
        <el-button link type="primary" @click="expanded = !expanded">
          {{ expanded ? "收起" : "展开" }}
        </el-button>
      </div>
    </template>
    <el-collapse-transition>
      <div v-show="expanded">
        <el-form :model="formData" label-width="140px" size="default">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="请求随机间隔">
                <el-input-number
                  v-model="formData.minInterval"
                  :min="0.5"
                  :step="0.5"
                  :precision="1"
                  @change="emitChange"
                />
                <span class="sep">~</span>
                <el-input-number
                  v-model="formData.maxInterval"
                  :min="0.5"
                  :step="0.5"
                  :precision="1"
                  @change="emitChange"
                />
                <span class="unit">秒</span>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="暂停阈值">
                <el-input-number
                  v-model="formData.pauseThreshold"
                  :min="10"
                  :max="500"
                  @change="emitChange"
                />
                <span class="unit">次请求后暂停</span>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="暂停时长">
                <el-input-number
                  v-model="formData.pauseDuration"
                  :min="1"
                  :max="60"
                  @change="emitChange"
                />
                <span class="unit">秒</span>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="最大重试次数">
                <el-input-number
                  v-model="formData.maxRetries"
                  :min="0"
                  :max="10"
                  @change="emitChange"
                />
                <span class="unit">次</span>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="并发请求数">
                <el-input-number
                  v-model="formData.concurrentRequests"
                  :min="1"
                  :max="10"
                  @change="emitChange"
                />
                <span class="unit">个</span>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="请求去重">
                <el-switch
                  v-model="formData.enableDeduplication"
                  @change="emitChange"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </div>
    </el-collapse-transition>
  </el-card>
</template>

<script setup>
import { ref, watch } from "vue";
import IconSpider from "@/icons/IconSpider.vue";
const props = defineProps({
  provider: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["change"]);

const expanded = ref(true);
const formData = ref({
  minInterval: 2,
  maxInterval: 5,
  pauseThreshold: 50,
  pauseDuration: 10,
  maxRetries: 3,
  concurrentRequests: 1,
  enableDeduplication: true,
});

function emitChange() {
  emit("change");
}

function getConfig() {
  return { ...formData.value };
}

function resetConfig() {
  if (props.provider?.crawlStrategy) {
    formData.value = {
      minInterval: props.provider.crawlStrategy.minInterval ?? 2,
      maxInterval: props.provider.crawlStrategy.maxInterval ?? 5,
      pauseThreshold: props.provider.crawlStrategy.pauseThreshold ?? 50,
      pauseDuration: props.provider.crawlStrategy.pauseDuration ?? 10,
      maxRetries: props.provider.crawlStrategy.maxRetries ?? 3,
      concurrentRequests: props.provider.crawlStrategy.concurrentRequests ?? 1,
      enableDeduplication:
        props.provider.crawlStrategy.enableDeduplication ?? true,
    };
  }
}

watch(
  () => props.provider,
  () => {
    resetConfig();
  },
  { immediate: true, deep: true }
);

defineExpose({ getConfig, resetConfig });
</script>

<style scoped>
.config-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}

.sep {
  margin: 0 8px;
  color: #909399;
}

.unit {
  margin-left: 8px;
  color: #909399;
}
</style>
