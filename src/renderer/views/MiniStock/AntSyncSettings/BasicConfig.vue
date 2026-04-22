<template>
  <el-card class="config-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="icon-text"><IconSettingBase/> 基础设置</span>
        <el-button link type="primary" @click="expanded = !expanded">
          {{ expanded ? "收起" : "展开" }}
        </el-button>
      </div>
    </template>
    <el-collapse-transition>
      <div v-show="expanded">
        <el-form :model="formData" label-width="100px" size="default">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="启用供应商">
                <el-switch v-model="formData.enabled" @change="emitChange" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="请求超时">
                <el-input-number
                  v-model="formData.timeout"
                  :min="5"
                  :max="120"
                  @change="emitChange"
                />
                <span class="unit">秒</span>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="24">
              <el-form-item label="供应商名称">
                <el-input
                  v-model="formData.name"
                  placeholder="供应商名称"
                  @input="emitChange"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="24">
              <el-form-item label="基础URL">
                <el-input
                  v-model="formData.baseUrl"
                  placeholder="https://api.example.com"
                  @input="emitChange"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="24">
              <el-form-item label="描述">
                <el-input
                  v-model="formData.desc"
                  type="textarea"
                  :rows="2"
                  placeholder="供应商描述"
                  @input="emitChange"
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
import IconSettingBase from "@/icons/IconSettingBase.vue"
const props = defineProps({
  provider: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["change"]);

const expanded = ref(true);
const formData = ref({
  enabled: true,
  name: "",
  baseUrl: "",
  timeout: 30,
  desc: "",
});

function emitChange() {
  emit("change");
}

function getConfig() {
  return {
    enabled: formData.value.enabled,
    name: formData.value.name,
    baseUrl: formData.value.baseUrl,
    timeout: formData.value.timeout,
    desc: formData.value.desc,
  };
}

function resetConfig() {
  if (props.provider) {
    formData.value = {
      enabled: props.provider.enabled ?? true,
      name: props.provider.name || "",
      baseUrl: props.provider.baseUrl || "",
      timeout: props.provider.timeout ?? 30,
      desc: props.provider.desc || "",
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

.unit {
  margin-left: 8px;
  color: #909399;
}
</style>
