<template>
  <div class="vscode-menu">
    <el-tooltip
      v-for="item in menuItems"
      :key="item.path"
      :content="item.desc"
      placement="right"
      :append-to-body="true"
      :popper-class="`vscode-menu-tooltip ${activeMenuPath === item.path ? 'is-active' : ''}`"
    >
      <template #content>
        <span>{{ item.desc }}</span>
      </template>
      <div
        :class="['menu-item', { active: activeMenuPath === item.path }]"
        @click="onMenuItemClick(item)"
      >
        <div>
          <component :is="item.icon" />
        </div>
      </div>
    </el-tooltip>
  </div>
</template>

<script setup>
import { ref, onMounted, markRaw } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ElTooltip } from "element-plus";

// 手动导入需要的图标组件
import SSHIcon from "@/icons/IconSSH.vue";
import SearchIcon from "@/icons/IconSearch.vue";
import FileCompareIcon from "@/icons/IconFileCompare.vue";

const router = useRouter();
const route = useRoute();

// 手动定义菜单项配置
const menuItems = ref([
  {
    path: "/debug-tool/ssh", // 唯一标识
    desc: "SSH连接管理", // 菜单文字提示
    icon: markRaw(SSHIcon), // 图标组件
    route: "/debug-tool/ssh", // 实际跳转路由
  },
  {
    path: "/debug-tool/search-replace",
    desc: "全局搜索",
    icon: markRaw(SearchIcon),
    route: "/debug-tool/search-replace",
  },
]);

const props = defineProps({
  defaultMenuPath: {
    type: String,
    default: "/debug-tool/ssh",
  },
});

// 定义事件：菜单项被点击时通知父组件
const emit = defineEmits(["menu-select"]);
// 当前激活的菜单项路径
const activeMenuPath = ref(props.defaultMenuPath || null);

// 根据当前路由 path，匹配菜单项
const setActiveFromRoute = () => {
  const currentPath = route.path;
  // 查找 menuItems 中 route 字段匹配当前 path 的项
  const activeItem = menuItems.value.find((item) => item.route === currentPath);
  if (activeItem) {
    activeMenuPath.value = activeItem.path;
  } else if (props.defaultMenuPath) {
    activeMenuPath.value = props.defaultMenuPath;
  } else if (menuItems.value.length > 0) {
    // fallback：默认选中第一项
    activeMenuPath.value = menuItems.value[0].path;
  }
};

// 点击菜单项
const onMenuItemClick = (item) => {
  if (item.route) {
    router.push(item.route).catch((err) => {
      console.log(err);
    });
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
  justify-content: center;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dt-primary-text-color);
  cursor: pointer;
  background: none;
  width: 100%;
  padding: 10px 0;
  box-sizing: border-box;
  border-left: 2px solid transparent;
  font-size: 16px;
}

@media screen and (resolution: 1dppx) {
  .menu-item .icon {
    width: 28px;
    height: 28px;
  }
}
@media screen and (resolution: 1.5dppx) {
  .menu-item .icon {
    width: 24px;
    height: 24px;
  }
}
@media screen and (resolution: 2dppx) {
  .el-aside .icon {
    width: 18px;
    height: 18px;
  }
}

.menu-item:hover {
  color: #ffffff;
}

.menu-item.active {
  color: #ffffff;
  border-left: 2px solid var(--dt-menu-hilight-border-color);
}
</style>
