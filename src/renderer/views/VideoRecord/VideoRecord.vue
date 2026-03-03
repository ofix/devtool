<template>
  <div class="video-record-toolbar">
    <!-- 录屏工具条主容器 -->
    <el-card
      class="record-card"
      shadow="hover"
      :style="{ width: '100%', maxWidth: '800px' }"
    >
      <!-- 标题栏 -->
      <template #header>
        <div class="card-header">
          <el-icon class="header-icon"><VideoCamera /></el-icon>
          <span class="header-title">屏幕录制工具</span>
          <el-tag
            :type="
              recordingStatus.isRecording
                ? recordingStatus.isPaused
                  ? 'warning'
                  : 'danger'
                : 'success'
            "
            size="small"
            class="status-tag"
          >
            {{
              recordingStatus.isRecording
                ? recordingStatus.isPaused
                  ? "已暂停"
                  : "录制中"
                : "未录制"
            }}
          </el-tag>
        </div>
      </template>

      <!-- 核心功能区 -->
      <div class="record-body">
        <!-- 1. 录屏模式选择 -->
        <div class="mode-selector">
          <el-radio-group
            v-model="recordMode"
            @change="handleModeChange"
            :disabled="recordingStatus.isRecording && !recordingStatus.isPaused"
          >
            <el-radio-button label="fullscreen">全屏录制</el-radio-button>
            <el-radio-button label="region">区域录制</el-radio-button>
            <el-radio-button label="window">窗口录制</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 2. 区域选择/窗口选择（根据模式显示） -->
        <div
          class="mode-config"
          v-if="recordMode === 'region' && !recordingStatus.isRecording"
        >
          <el-form inline :model="regionForm" class="region-form">
            <el-form-item label="录制区域：">
              <el-input
                v-model="regionForm.x"
                placeholder="X坐标"
                type="number"
                size="small"
                style="width: 80px"
              ></el-input>
            </el-form-item>
            <el-form-item>
              <el-input
                v-model="regionForm.y"
                placeholder="Y坐标"
                type="number"
                size="small"
                style="width: 80px"
              ></el-input>
            </el-form-item>
            <el-form-item>
              <el-input
                v-model="regionForm.width"
                placeholder="宽度"
                type="number"
                size="small"
                style="width: 80px"
              ></el-input>
            </el-form-item>
            <el-form-item>
              <el-input
                v-model="regionForm.height"
                placeholder="高度"
                type="number"
                size="small"
                style="width: 80px"
              ></el-input>
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                size="small"
                @click="selectRegionManually"
                icon="el-icon-mouse"
              >
                手动选取
              </el-button>
            </el-form-item>
          </el-form>
        </div>

        <div
          class="mode-config"
          v-if="recordMode === 'window' && !recordingStatus.isRecording"
        >
          <el-select
            v-model="selectedWindowId"
            placeholder="选择录制窗口"
            size="small"
            style="width: 200px"
            @change="handleWindowChange"
          >
            <el-option
              v-for="window in windowList"
              :key="window.id"
              :label="window.title"
              :value="window.id"
            ></el-option>
          </el-select>
        </div>

        <!-- 3. 录制参数配置 -->
        <div class="param-config">
          <el-form inline :model="paramForm" class="param-form">
            <el-form-item label="帧率：">
              <el-select
                v-model="paramForm.fps"
                size="small"
                style="width: 80px"
              >
                <el-option label="15fps" value="15"></el-option>
                <el-option label="30fps" value="30"></el-option>
                <el-option label="60fps" value="60"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="格式：">
              <el-select
                v-model="paramForm.format"
                size="small"
                style="width: 80px"
              >
                <el-option label="MP4" value="mp4"></el-option>
                <el-option label="MKV" value="mkv"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="质量：">
              <el-slider
                v-model="paramForm.crf"
                :min="0"
                :max="51"
                :step="1"
                size="small"
                style="width: 120px"
                @change="handleCrfChange"
              ></el-slider>
              <span class="crf-value">{{ paramForm.crf }}</span>
            </el-form-item>
            <el-form-item>
              <el-switch
                v-model="paramForm.drawMouse"
                active-text="显示鼠标"
                inactive-text="隐藏鼠标"
                size="small"
              ></el-switch>
            </el-form-item>
          </el-form>
        </div>

        <!-- 4. 保存路径选择 -->
        <div class="save-path">
          <el-input
            v-model="savePath"
            placeholder="选择保存路径"
            readonly
            size="small"
            style="width: 300px"
          >
            <template #append>
              <el-button
                size="small"
                @click="selectSavePath"
                icon="el-icon-folder-opened"
              >
                选择
              </el-button>
            </template>
          </el-input>
        </div>

        <!-- 5. 核心操作按钮 -->
        <div class="action-buttons">
          <el-button
            type="primary"
            size="large"
            @click="handleStartRecord"
            :disabled="recordingStatus.isRecording || !savePath"
            icon="el-icon-video-play"
            class="start-btn"
          >
            开始录制
          </el-button>
          <el-button
            type="warning"
            size="large"
            @click="handlePauseRecord"
            :disabled="!recordingStatus.isRecording || recordingStatus.isPaused"
            icon="el-icon-pause"
            class="pause-btn"
          >
            暂停录制
          </el-button>
          <el-button
            type="info"
            size="large"
            @click="handleResumeRecord"
            :disabled="
              !recordingStatus.isRecording || !recordingStatus.isPaused
            "
            icon="el-icon-play"
            class="resume-btn"
          >
            恢复录制
          </el-button>
          <el-button
            type="danger"
            size="large"
            @click="handleStopRecord"
            :disabled="!recordingStatus.isRecording"
            icon="el-icon-video-stop"
            class="stop-btn"
          >
            停止录制
          </el-button>
        </div>

        <!-- 6. 录制时长/分段信息 -->
        <div class="record-info" v-if="recordingStatus.isRecording">
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="录制时长">{{
              recordDuration
            }}</el-descriptions-item>
            <el-descriptions-item label="分段数">{{
              recordingStatus.segmentCount
            }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{
              recordingStatus.isPaused ? "暂停" : "录制中"
            }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from "vue";
import VideoCamera from "@/icons/IconVideoCamera.vue";
import Mouse from "@/icons/IconMouse.vue";
import FolderOpened from "@/icons/IconFolderOpened.vue";
import VideoPlay from "@/icons/IconVideoPlay.vue";
import Pause from "@/icons/IconPause.vue";
import Play from "@/icons/IconPlay.vue";
import VideoStop from "@/icons/IconVideoStop.vue";

// 录屏模式
const recordMode = ref("fullscreen");
// 录制区域表单
const regionForm = reactive({
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
});
// 窗口列表/选中窗口
const windowList = ref([]);
const selectedWindowId = ref("");
// 录制参数
const paramForm = reactive({
  fps: "30",
  format: "mp4",
  crf: 23, // 质量系数 0-51，值越小质量越高
  drawMouse: true,
});
// 保存路径
const savePath = ref("");
// 录屏状态
const recordingStatus = reactive({
  isRecording: false,
  isPaused: false,
  savePath: "",
  segmentCount: 0,
  config: {},
});
// 录制时长（格式化）
const recordDuration = ref("00:00:00");
let timer = null; // 时长计时器

// ========== 计算属性 ==========
// CRF值说明
const crfTips = computed(() => {
  if (paramForm.crf <= 18) return "极高质量";
  if (paramForm.crf <= 23) return "默认质量";
  if (paramForm.crf <= 30) return "平衡质量";
  return "低质量";
});

// ========== 生命周期 ==========
onMounted(async () => {
  // 1. 初始化获取录屏状态
  const status = await window.channel.getVideoRecordStatus();
  Object.assign(recordingStatus, status);

  // 2. 获取窗口列表（供窗口录制选择）
  const windows = await window.channel.enumWindowList();
  windowList.value = windows;

  // 3. 初始化保存路径（默认视频文件夹）
  const defaultPath = await window.channel.getDefaultVideoSavePath();
  savePath.value = defaultPath;

  // 4. 监听录屏状态变化
  window.channel.on("video-recorder:status-change", (_, status) => {
    Object.assign(recordingStatus, status);
    // 启动/停止计时器
    if (recordingStatus.isRecording && !recordingStatus.isPaused) {
      startDurationTimer();
    } else {
      stopDurationTimer();
    }
  });

  // 5. 监听录屏完成
  window.channel.on("video-recorder:finished", (_, path) => {
    stopDurationTimer();
    recordDuration.value = "00:00:00";
  });
});

onUnmounted(() => {
  stopDurationTimer();
  window.channel.removeListeners("video-record:status-change");
  window.channel.removeListeners("video-record:finished");
});

// ========== 工具方法 ==========
/**
 * 启动时长计时器
 */
const startDurationTimer = () => {
  let seconds = 0;
  timer = setInterval(() => {
    seconds++;
    const hours = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    recordDuration.value = `${hours}:${minutes}:${secs}`;
  }, 1000);
};

/**
 * 停止时长计时器
 */
const stopDurationTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

/**
 * 格式化数字（补零）
 */
const formatNumber = (num) => {
  return num.toString().padStart(2, "0");
};

// ========== 事件处理 ==========
/**
 * 模式切换
 */
const handleModeChange = (mode) => {
  recordMode.value = mode;
  // 切换模式后清空无效配置
  if (mode !== "region") {
    Object.assign(regionForm, { x: 0, y: 0, width: 1920, height: 1080 });
  }
  if (mode !== "window") {
    selectedWindowId.value = "";
  }
};

/**
 * 手动选取区域
 */
const selectRegionManually = async () => {
  try {
    // const region = await window.channel.invoke("recorder:select-region");
    // if (region) {
    //   Object.assign(regionForm, region);
    // }
  } catch (err) {
    console.error(`区域选择失败：${err.message}`);
  }
};

/**
 * 窗口选择变化
 */
const handleWindowChange = (windowId) => {
  selectedWindowId.value = windowId;
};

/**
 * CRF值变化
 */
const handleCrfChange = (val) => {
  paramForm.crf = val;
  console.info(`视频质量已调整为：${crfTips.value}（CRF: ${val}）`);
};

/**
 * 选择保存路径
 */
const selectSavePath = async () => {
  try {
    // const path = await ipcRenderer.invoke("recorder:select-save-path");
    // if (path) {
    //   savePath.value = path;
    // }
  } catch (err) {
    console.error(`路径选择失败：${err.message}`);
  }
};

/**
 * 开始录制
 */
const handleStartRecord = async () => {
  try {
    // 构建录制参数
    const recordOptions = {
      type: recordMode.value,
      savePath: savePath.value,
      config: {
        fps: Number(paramForm.fps),
        format: paramForm.format,
        crf: paramForm.crf,
        drawMouse: paramForm.drawMouse,
      },
    };

    // 根据模式补充参数
    if (recordMode.value === "region") {
      recordOptions.region = {
        x: Number(regionForm.x),
        y: Number(regionForm.y),
        width: Number(regionForm.width),
        height: Number(regionForm.height),
      };
    }

    if (recordMode.value === "window") {
      if (!selectedWindowId.value) {
        console.warning("请先选择录制窗口！");
        return;
      }
      recordOptions.windowId = selectedWindowId.value;
    }

    // 调用主进程开始录制
    const res = await ipcRenderer.invoke("recorder:start", recordOptions);
    if (res.success) {
      recordingStatus.isRecording = true;
      recordingStatus.isPaused = false;
      startDurationTimer();
    } else {
      console.error(`录制启动失败：${res.message}`);
    }
  } catch (err) {
    console.error(`录制异常：${err.message}`);
  }
};

/**
 * 暂停录制
 */
const handlePauseRecord = async () => {
  try {
    const res = await ipcRenderer.invoke("recorder:pause");
    if (res.success) {
      recordingStatus.isPaused = true;
      stopDurationTimer();
    } else {
      console.error(`暂停失败：${res.message}`);
    }
  } catch (err) {
    console.error(`暂停异常：${err.message}`);
  }
};

/**
 * 恢复录制
 */
const handleResumeRecord = async () => {
  try {
    // 构建恢复参数（和开始时一致）
    const resumeOptions = {
      type: recordMode.value,
    };
    if (recordMode.value === "region") {
      resumeOptions.region = regionForm;
    }
    if (recordMode.value === "window") {
      resumeOptions.windowId = selectedWindowId.value;
    }

    const res = await ipcRenderer.invoke("recorder:resume", resumeOptions);
    if (res.success) {
      console.success("恢复录制！");
      recordingStatus.isPaused = false;
      startDurationTimer();
    } else {
      console.error(`恢复失败：${res.message}`);
    }
  } catch (err) {
    console.error(`恢复异常：${err.message}`);
  }
};

/**
 * 停止录制
 */
const handleStopRecord = async () => {
  try {
    const res = await window.channel.stopVideoRecord();
    if (res.success) {
      recordingStatus.isRecording = false;
      recordingStatus.isPaused = false;
      stopDurationTimer();
      recordDuration.value = "00:00:00";
    } else {
      console.error(`停止失败：${res.message}`);
    }
  } catch (err) {
    if (err !== "cancel") {
      console.error(`停止异常：${err.message}`);
    }
  }
};
</script>

<style scoped>
.video-record-toolbar {
  padding: 20px;
  background-color: #f5f7fa;
  min-height: 100vh;
}

.record-card {
  background-color: #fff;
  border-radius: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-icon {
  margin-right: 8px;
  color: #409eff;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
}

.status-tag {
  margin-left: 10px;
}

.record-body {
  padding: 10px 0;
}

.mode-selector {
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e6e6e6;
}

.mode-config {
  margin-bottom: 15px;
  padding: 8px 0;
}

.param-config {
  margin-bottom: 15px;
  padding: 8px 0;
  border-bottom: 1px solid #e6e6e6;
}

.crf-value {
  margin-left: 8px;
  font-size: 12px;
  color: #666;
  width: 30px;
  display: inline-block;
  text-align: center;
}

.save-path {
  margin-bottom: 15px;
}

.action-buttons {
  margin-bottom: 15px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.start-btn {
  width: 120px;
}

.pause-btn,
.resume-btn {
  width: 120px;
}

.stop-btn {
  width: 120px;
}

.record-info {
  margin-top: 10px;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .action-buttons {
    flex-direction: column;
  }

  .start-btn,
  .pause-btn,
  .resume-btn,
  .stop-btn {
    width: 100%;
  }
}
</style>
