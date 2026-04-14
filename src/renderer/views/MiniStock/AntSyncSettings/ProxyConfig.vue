<template>
  <el-card class="config-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="icon-text"><IconProxy /> 代理配置</span>
        <el-button link type="primary" @click="expanded = !expanded">
          {{ expanded ? "收起" : "展开" }}
        </el-button>
      </div>
    </template>
    <el-collapse-transition>
      <div v-show="expanded">
        <el-form :model="formData" label-width="100px" size="default">
          <el-form-item label="启用代理">
            <el-switch v-model="formData.enabled" @change="emitChange" />
          </el-form-item>
          <template v-if="formData.enabled">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="代理类型">
                  <el-select v-model="formData.type" @change="emitChange">
                    <el-option label="HTTP" value="HTTP" />
                    <el-option label="HTTPS" value="HTTPS" />
                    <el-option label="SOCKS5" value="SOCKS5" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="16">
                <el-form-item label="代理地址">
                  <el-input
                    v-model="formData.host"
                    placeholder="127.0.0.1"
                    @input="emitChange"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="端口">
                  <el-input-number
                    v-model="formData.port"
                    :min="1"
                    :max="65535"
                    @change="emitChange"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="用户名">
                  <el-input
                    v-model="formData.username"
                    placeholder="可选"
                    @input="emitChange"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="密码">
                  <el-input
                    v-model="formData.password"
                    type="password"
                    placeholder="可选"
                    @input="emitChange"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </template>
        </el-form>
      </div>
    </el-collapse-transition>
  </el-card>
</template>

<script setup>
import { ref, watch } from "vue";
import IconProxy from "@/icons/IconProxy.vue";
const props = defineProps({
  provider: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["change"]);

const expanded = ref(true);
const formData = ref({
  enabled: false,
  type: "HTTP",
  host: "",
  port: "",
  username: "",
  password: "",
});

function emitChange() {
  emit("change");
}

function getConfig() {
  return { ...formData.value };
}

function resetConfig() {
  if (props.provider?.proxy) {
    formData.value = {
      enabled: props.provider.proxy.enabled ?? false,
      type: props.provider.proxy.type ?? "HTTP",
      host: props.provider.proxy.host || "",
      port: props.provider.proxy.port || "",
      username: props.provider.proxy.username || "",
      password: props.provider.proxy.password || "",
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
.icon-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  vertical-align: middle;
}

.icon-text svg {
  display: block;
}
</style>
