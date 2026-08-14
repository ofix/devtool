<template>
  <div class="app-container">
    <h1 class="page-title">📦 家庭物流 <small>· 合并看板</small></h1>
    <div class="main-layout">
      <!-- 左侧：输入表单 -->
      <div class="left-panel">
        <el-card shadow="never" class="form-card">
          <el-form :model="form" label-position="top">
            <el-form-item label="商品图片">
              <div class="preview-thumb">
                <img v-if="form.imageData" :src="form.imageData" alt="预览" />
                <div v-else class="empty-preview">无图</div>
              </div>
            </el-form-item>
            <el-form-item label="商品名称">
              <el-input
                v-model="form.name"
                placeholder="例如：秋月梨"
                size="large"
                @keyup.enter="addProduct"
              />
            </el-form-item>
            <el-form-item label="包裹数量">
              <el-input-number
                v-model="form.packageCount"
                :min="1"
                size="large"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="商品数量 (每包裹)">
              <el-input-number
                v-model="form.itemCount"
                :min="1"
                size="large"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="物流状态 (自定义)">
              <div
                style="
                  display: flex;
                  gap: 12px;
                  align-items: center;
                  flex-wrap: wrap;
                "
              >
                <el-input
                  v-model="form.statusText"
                  placeholder="例如：快递网点"
                  size="large"
                  style="flex: 2; min-width: 370px"
                  @keyup.enter="addProduct"
                />
                <el-color-picker
                  v-model="form.statusColor"
                  size="large"
                  :predefine="['#409EFF', '#ff2222', '#2d7d46', '#b45f06']"
                />
              </div>
            </el-form-item>
            <div class="action-row">
              <el-button
                type="primary"
                size="large"
                @click="addProduct"
                style="flex: 2"
                >➕ 添加商品</el-button
              >
              <el-button size="large" @click="clearForm" style="flex: 1"
                >清空</el-button
              >
            </div>
          </el-form>
        </el-card>
      </div>

      <!-- 右侧：购物清单 -->
      <div class="right-panel">
        <div class="board-header">
          <h2>📋 购物清单</h2>
          <el-tag size="large">{{ products.length }} 个</el-tag>
        </div>

        <div v-if="products.length" class="product-list">
          <ProductCard
            v-for="(p, idx) in products"
            :key="idx"
            :product="p"
            @remove="removeProduct(idx)"
          />
        </div>
        <div v-else class="empty-state">还没有商品，添加一些吧 ✨</div>
        <div class="export-area">
          <el-button type="primary" size="large" @click="exportImage">
            导出图片
          </el-button>
        </div>
      </div>
    </div>

    <!-- 隐藏截图容器 -->
    <div ref="exportWrapper" class="export-wrapper">
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        "
      >
        <span style="font-size: 32px">📦</span>
        <span style="font-weight: 700; font-size: 26px; color: #1f2f3d"
          >家庭物流 · 总览</span
        >
        <span
          style="
            margin-left: auto;
            background: #e4e9f0;
            padding: 4px 20px;
            font-size: 18px;
            font-weight: 700;
            color: #2c3e50;
          "
        >
          {{ products.length }} 个
        </span>
      </div>
      <div
        ref="exportList"
        style="display: flex; flex-direction: column; gap: 0"
      ></div>
      <div
        style="
          margin-top: 24px;
          border-top: 2px solid #e4e9f0;
          padding-top: 16px;
          color: #5a6b7c;
          font-size: 14px;
          font-weight: 500;
          text-align: center;
        "
      >
        合并看板 · 一键分享给家人
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from "vue"; // ⭐ 新增: 导入 onMounted, watch
import { ElMessage } from "element-plus";
import ProductCard from "./ProductCard.vue";
import html2canvas from "html2canvas";

// ============================================================
// ⭐ 新增: IndexedDB 工具类 (放在组件外部)
// ============================================================
class LogisticsDB {
  constructor() {
    this.dbName = "LogisticsDB";
    this.storeName = "products";
    this.db = null;
  }

  // 打开/创建数据库
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          // 创建对象存储，使用 autoIncrement 作为主键
          db.createObjectStore(this.storeName, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 保存商品列表 (先清空再写入)
  async saveProducts(products) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      // 清空旧数据
      store.clear();

      // 写入新数据 (每件商品单独添加)
      products.forEach((product) => {
        // 复制对象，去掉 id 字段让数据库自动生成
        const { id, ...productWithoutId } = product;
        store.add(productWithoutId);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e);
    });
  }

  // 加载商品列表
  async loadProducts() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }

  // 清空所有数据
  async clear() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e);
    });
  }
}

// ============================================================
// ⭐ 新增: 创建 IndexedDB 实例
// ============================================================
const db = new LogisticsDB();

// ============================================================
// 原有代码 (不变)
// ============================================================
const form = reactive({
  name: "",
  packageCount: 1,
  itemCount: 1,
  statusText: "快递网点",
  statusColor: "#409EFF",
  imageData: null,
});

const products = ref([]);
const fileInput = ref(null);
const exportWrapper = ref(null);
const exportList = ref(null);

// ---- 图片处理 ----
// 全局粘贴图片
document.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          form.imageData = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.preventDefault();
        break;
      }
    }
  }
});

// ============================================================
// ⭐ 新增: 数据持久化函数
// ============================================================

// 保存数据到 IndexedDB
const saveToDB = async () => {
  try {
    await db.saveProducts(products.value);
    console.log("数据已保存到 IndexedDB");
  } catch (error) {
    console.error("保存到 IndexedDB 失败:", error);
    ElMessage.warning("数据保存失败，请检查浏览器存储权限");
  }
};

// 从 IndexedDB 加载数据
const loadFromDB = async () => {
  try {
    const data = await db.loadProducts();
    if (data && data.length > 0) {
      products.value = data;
      ElMessage.success(`已恢复 ${data.length} 件商品`);
      return true;
    }
    return false;
  } catch (error) {
    console.error("从 IndexedDB 加载失败:", error);
    ElMessage.warning("数据加载失败，请检查浏览器存储权限");
    return false;
  }
};

// 清空 IndexedDB 中的所有数据
const clearDB = async () => {
  try {
    await db.clear();
    ElMessage.success("已清空所有存储数据");
  } catch (error) {
    console.error("清空 IndexedDB 失败:", error);
  }
};

// ============================================================
// ⭐ 新增: 监听 products 变化，自动保存
// ============================================================
watch(
  products,
  async () => {
    await saveToDB();
  },
  { deep: true }
);

// ============================================================
// ⭐ 新增: 组件挂载时自动加载数据
// ============================================================
onMounted(async () => {
  await loadFromDB();
});

// ============================================================
// 原有商品操作 (addProduct / removeProduct / clearForm 保持不变)
// ============================================================

// ---- 商品操作 ----
const addProduct = () => {
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning("请填写商品名称");
    return;
  }
  products.value.push({
    name,
    packageCount: form.packageCount || 1,
    itemCount: form.itemCount || 1,
    status: form.statusText.trim() || "快递网点",
    statusColor: form.statusColor || "#1e4b8a",
    image: form.imageData || null,
  });
  form.name = "";
  form.packageCount = 1;
  form.itemCount = 1;
  form.statusText = "快递网点";
  ElMessage.success("已添加");
  // ⭐ 保存由 watch 自动触发，无需手动调用
};

const removeProduct = (idx) => {
  products.value.splice(idx, 1);
  // ⭐ 保存由 watch 自动触发
};

const clearForm = () => {
  form.name = "";
  form.packageCount = 1;
  form.itemCount = 1;
  form.statusText = "快递网点";
  form.statusColor = "#409EFF";
  form.imageData = null;
  if (fileInput.value) fileInput.value.value = "";
};

// ============================================================
// ⭐ 新增: 清空所有数据 (含 IndexedDB)
// ============================================================
const clearAllData = async () => {
  if (products.value.length === 0) {
    ElMessage.info("已经是空列表");
    return;
  }
  products.value = [];
  await clearDB();
  ElMessage.success("已清空所有数据");
};

// ============================================================
// 原有导出图片 (不变)
// ============================================================

// ---- 导出图片 ----
const exportImage = async () => {
  if (!products.value.length) {
    ElMessage.warning("暂无商品，请先添加");
    return;
  }

  // ⭐ 导出前先保存一次 (确保数据最新)
  await saveToDB();

  // 构建导出列表
  const container = exportList.value;
  container.innerHTML = "";
  products.value.forEach((p) => {
    const imgHtml = p.image
      ? `<img src="${p.image}" alt="商品图" style="width:100%;height:100%;object-fit:cover;">`
      : `<div style="color:#7a8aa0;font-size:16px;text-align:center;font-weight:500;">📷<br>无图</div>`;
    const color = p.statusColor || "#409EFF";
    const div = document.createElement("div");
    div.className = "product-item";
    div.style.cssText = `
          display:flex; gap:24px; align-items:stretch; background:white;
          border:none; border-bottom:2px solid #e4e9f0;
          padding:16px 0; min-height:140px;
        `;
    div.innerHTML = `
          <div style="width:160px;height:140px;flex-shrink:0;background:#eef2f7;border:2px solid #c0ccda;display:flex;align-items:center;justify-content:center;overflow:hidden;">
            ${imgHtml}
          </div>
          <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:0;min-height:140px;padding:0;">
            <div style="font-weight:700;font-size:22px;color:#1f2f3d;line-height:1.3;padding-top:0;">${escapeHtml(p.name)}</div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;font-size:18px;font-weight:600;color:#2c3e50;padding:4px 0;">
              <span style="display:inline-flex;align-items:center;gap:4px;background:#eef3f9;padding:2px 16px 2px 12px;border-radius:24px;line-height:1.5;height:40px;">
                📦 包裹 <span style="font-size:18px;font-weight:800;color:#1f2f3d;margin:0 2px;">${p.packageCount}</span><span style="font-size:18px;font-weight:600;color:#2c3e50;margin-left:2px;">个</span>
              </span>
              <span style="display:inline-flex;align-items:center;gap:4px;background:#eef3f9;padding:2px 16px 2px 12px;border-radius:24px;line-height:1.5;height:40px;">
                🔢 数量 <span style="font-size:18px;font-weight:800;color:#1f2f3d;margin:0 2px;">${p.itemCount}</span><span style="font-size:18px;font-weight:600;color:#2c3e50;margin-left:2px;">件</span>
              </span>
            </div>
            <div style="display:inline-block;padding:2px 6px;font-size:20px;font-weight:700;border:none;background:transparent;color:${color};line-height:1.4;padding-bottom:0;">${escapeHtml(p.status)}</div>
          </div>
        `;
    container.appendChild(div);
  });

  // 最后一个无边框
  const items = container.querySelectorAll(".product-item");
  if (items.length) items[items.length - 1].style.borderBottom = "none";

  // 截图
  const wrapper = exportWrapper.value;
  wrapper.style.position = "fixed";
  wrapper.style.left = "50%";
  wrapper.style.top = "50%";
  wrapper.style.transform = "translate(-50%, -50%)";
  wrapper.style.pointerEvents = "none";
  wrapper.style.zIndex = "9999";
  wrapper.style.width = "680px";
  wrapper.style.maxWidth = "96vw";
  wrapper.style.boxShadow = "0 20px 60px rgba(0,0,0,0.2)";
  wrapper.style.background = "white";
  wrapper.style.padding = "24px 24px 28px";
  wrapper.style.opacity = "1";

  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      width: 680,
      height: wrapper.scrollHeight,
    });
    const link = document.createElement("a");
    link.download = `家庭物流_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    ElMessage.error("导出失败: " + err);
  } finally {
    wrapper.style.position = "absolute";
    wrapper.style.left = "-9999px";
    wrapper.style.top = "0";
    wrapper.style.transform = "none";
    wrapper.style.pointerEvents = "none";
    wrapper.style.zIndex = "999";
    wrapper.style.width = "680px";
    wrapper.style.maxWidth = "680px";
    wrapper.style.boxShadow = "none";
    wrapper.style.background = "white";
    wrapper.style.padding = "24px 24px 28px";
    wrapper.style.opacity = "1";
  }
};

const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

// ============================================================
// ⭐ 新增: 暴露清除数据的方法 (可通过 window 调用，方便调试)
// ============================================================
if (typeof window !== "undefined") {
  window.__clearLogisticsData = clearAllData;
}
</script>

<style scoped>
.app-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
}
.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1f2f3d;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.page-title small {
  font-size: 16px;
  font-weight: 400;
  color: #5a6b7c;
  margin-left: 6px;
}
.main-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 32px 40px;
  margin-top: 8px;
}
.left-panel {
  flex: 1 1 340px;
  min-width: 280px;
}
.right-panel {
  flex: 2 1 480px;
  min-width: 320px;
}
.form-card {
  background: #f8fafc;
  border: 1px solid #e4e9f0;
}
.paste-area {
  background: white;
  border: 2px dashed #c0ccda;
  border-radius: 16px;
  padding: 16px 12px;
  text-align: center;
  color: #5a6b7c;
  font-weight: 500;
  cursor: pointer;
  position: relative;
}
.paste-area input[type="file"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.preview-thumb {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.preview-thumb img {
  width: 72px;
  height: 72px;
  object-fit: cover;
  background: #e9edf4;
  border: 2px solid #c0ccda;
}
.preview-thumb .empty-preview {
  width: 72px;
  height: 72px;
  background: #eef2f7;
  border: 2px dashed #c0ccda;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7a8aa0;
  font-size: 13px;
  font-weight: 500;
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
}
.action-row .el-button {
  flex: 1 0 auto;
  border-radius: 20px;
  font-weight: 600;
  font-size: 16px;
  padding: 10px 10px;
}
.board-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  flex-wrap: wrap;
  gap: 8px;
}
.board-header h2 {
  font-size: 22px;
  font-weight: 700;
  color: #1f2f3d;
}
.product-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.empty-state {
  text-align: center;
  color: #7a8aa0;
  padding: 40px 0;
  font-size: 18px;
  font-weight: 500;
  border-bottom: 2px solid #e4e9f0;
}
.export-area {
  margin-top: 28px;
  display: flex;
  justify-content: flex-end;
}
.export-area .el-button {
  border-radius: 30px;
  padding: 20px 20px;
  font-size: 20px;
  font-weight: 700;
}
.export-wrapper {
  position: absolute;
  left: -9999px;
  top: 0;
  width: 680px;
  background: white;
  padding: 24px 24px 28px;
  z-index: 999;
  pointer-events: none;
}
:deep(.el-card__body) {
  padding: 20px 18px;
}
</style>
