<template>
  <div class="product-item">
    <div class="img-box">
      <img v-if="product.image" :src="product.image" alt="商品图" />
      <div v-else class="no-img">📷<br />无图</div>
    </div>
    <div class="product-info">
      <div class="name">{{ product.name }}</div>
      <div class="meta-row">
        <span class="meta-badge">
          📦 包裹 <span class="number">{{ product.packageCount }}</span
          ><span class="unit">个</span>
        </span>
        <span class="meta-badge">
          <IconCount class="count"/> 数量 <span class="number">{{ product.itemCount }}</span
          ><span class="unit">件</span>
        </span>
      </div>
      <div
        class="status-tag"
        :style="{ color: product.statusColor || '#1e4b8a' }"
      >
        {{ product.status }}
      </div>
    </div>
    <button class="remove-btn" @click="$emit('remove')">✕</button>
  </div>
</template>

<script setup>
defineProps(["product"]);
defineEmits(["remove"]);
</script>

<style scoped>
.product-item {
  display: flex;
  gap: 24px;
  align-items: stretch;
  background: white;
  border: none;
  border-bottom: 2px solid #e4e9f0;
  padding: 16px 0;
  min-height: 140px;
}
.product-item:last-child {
  border-bottom: none;
}
.img-box {
  width: 160px;
  height: 140px;
  flex-shrink: 0;
  background: #eef2f7;
  border: 2px solid #c0ccda;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.img-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.img-box .no-img {
  color: #7a8aa0;
  font-size: 16px;
  text-align: center;
  font-weight: 500;
  line-height: 1.4;
}
.product-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 140px;
  padding: 0;
}
.name {
  font-weight: 700;
  font-size: 22px;
  color: #1f2f3d;
  line-height: 1.3;
  word-break: break-word;
}
.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  padding: 4px 0;
}
.meta-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #eef3f9;
  padding: 2px 16px 2px 12px;
  border-radius: 24px;
  line-height: 1.5;
  height: 40px;
}
.meta-badge .number {
  font-size: 18px;
  font-weight: 800;
  color: #1f2f3d;
  margin: 0 2px;
}
.meta-badge .unit {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin-left: 2px;
}
.count{
    width:16px;
    height:16px;
}
.status-tag {
  display: inline-block;
  padding: 2px 6px;
  font-size: 20px;
  font-weight: 700;
  border: none;
  background: transparent;
  line-height: 1.4;
  word-break: break-word;
  padding-bottom: 0;
}
.remove-btn {
  font-size: 28px;
  color: #8a9bb0;
  cursor: pointer;
  padding: 0 6px;
  background: none;
  border: none;
  align-self: flex-start;
  margin-top: 2px;
  flex-shrink: 0;
}
.remove-btn:hover {
  color: #b22222;
}

@media (max-width: 600px) {
  .img-box {
    width: 120px;
    height: 120px;
  }
  .product-info {
    min-height: 120px;
  }
  .meta-badge {
    height: 36px;
  }
  .meta-badge .number {
    font-size: 16px;
  }
}
</style>
