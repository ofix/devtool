<template>
  <div class="vscode-menu">
    <div
      v-for="item in menuItems"
      :key="item.path"
      :class="['menu-item', { active: activeMenuPath === item.path }]"
      @click="onMenuItemClick(item)"
      v-tooltip="{
        content: item.name,
        placement: 'right',
      }"
    >
      <!-- 使用动态组件渲染 SVG 图标 -->
      <component :is="item.icon" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ElTooltip } from "element-plus";
import MenuRoutes from "@/router/MenuRoutes.js";

const router = useRouter();
const route = useRoute();

const menuItems = MenuRoutes.flatMap((route) => [
  ...(route.children?.map((child) => ({
    path: child.name,
    name: child.name,
    icon: child.meta.icon,
    desc: child.meta.title,
    route: child.path,
  })) || []),
]);

const props = defineProps({
  defaultMenuPath: {
    type: String,
    default: null,
  },
});

// 定义事件：菜单项被点击时通知父组件
const emit = defineEmits(["menu-select"]);
// 当前激活的菜单项路径
const activeMenuPath = ref(props.defaultMenuPath || null);

// 根据当前路由 path，尝试自动匹配并设置 activeMenuPath（可选但推荐）
const setActiveFromRoute = () => {
  const currentPath = route.path;
  // 查找 menuItems 中 route 字段匹配当前 path 的项
  const activeItem = menuItems.find((item) => item.route === currentPath);
  if (activeItem) {
    activeMenuPath.value = activeItem.path;
  } else if (props.defaultMenuPath) {
    activeMenuPath.value = props.defaultMenuPath;
  } else if (menuItems.length > 0) {
    // fallback：默认选中第一项
    activeMenuPath.value = menuItems[0].path;
  }
};

// 点击菜单项
const onMenuItemClick = (item) => {
  console.log("点击菜单项:", item);
  if (item.route) {
    router.push(item.route).catch((err) => {});
  }
  // 设置当前激活项
  activeMenuPath.value = item.path;
  // 通知父组件
  emit("menu-select", item);
};

// 组件挂载时，根据当前路由设置激活项
onMounted(() => {
  setActiveFromRoute();
});
</script>

<style type="scss" scoped>
.vscode-menu {
  display: flex;
  flex-direction: column;
  width: 48px;
  background-color: #1e1e1e;
  align-items: center;
  padding: 8px 0;
  box-sizing: border-box;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  color: #cccccc;
  cursor: pointer;
  border: none;
  background: none;
  font-size: 16px;
}

.menu-item:hover {
  color: #ffffff;
}

.menu-item.active {
  color: #ffffff;
}
</style>
