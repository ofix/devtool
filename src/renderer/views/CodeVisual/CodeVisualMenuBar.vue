<template>
  <AppMenu
    :menu-list="menuList"
    :cmd-state="cmdState"
    @menu-click="dispatchMenuCmd"
  />
</template>
<script setup>
import { ref, watch } from "vue";
import AppMenu from "@/menu/AppMenu.vue";
import { useCommandMap } from "@/menu/MenuMap.js";
import { MenuCmd, createRecentFileCmd } from "@/menu/MenuCmd.js";
import {
  MenuItem,
  MenuSubMenu,
  MenuDivider,
  groupBasicEdit,
  createRecentFileGroup,
} from "@/menu/MenuItems";

// 动态最近文件列表
const recentFileList = ref([
  { name: "kernel.c", path: "/src/kernel.c" },
  { name: "struct.svg", path: "/out/struct.svg" },
]);

const { onCommand, dispatchMenuCmd, cmdState, refreshMenuUI } = useCommandMap();

// 静态命令绑定
onCommand(MenuCmd.Copy, () => console.log("复制画布元素"));

onCommand(MenuCmd.OpenDir,()=> console.log("打开目录"));

// 动态最近文件统一处理
onCommand(MenuCmd.RecentFilePrefix, (fullCmd) => {
  const idx = +fullCmd.replace(MenuCmd.RecentFilePrefix, "");
  const file = recentFileList.value[idx];
  console.log("打开最近文件", file.path);
});

const menuList = ref([
  MenuSubMenu("文件", [
    MenuItem(MenuCmd.OpenDir),
    MenuDivider(),
    // 二级子菜单：最近打开
    MenuSubMenu("最近打开", [...createRecentFileGroup(recentFileList.value)]),
    MenuDivider(),
    // 二级子菜单：导出
    MenuSubMenu("导出", [
      MenuItem("file.export.svg"),
      MenuItem("file.export.png"),
    ]),
    MenuDivider(),
    MenuItem(MenuCmd.Quit),
  ]),
  MenuSubMenu("编辑", [...groupBasicEdit(), MenuItem(MenuCmd.CopySvg)]),
  MenuSubMenu("视图", [
    MenuSubMenu("布局", [
      MenuItem("view.layout.horizontal"),
      MenuItem("view.layout.vertical"),
    ]),
  ]),
]);

// 监听最近文件变化，刷新二级子菜单
watch(
  recentFileList,
  () => {
    const fileMenu = rootNodes.value[0].subNodes;
    const recentSubMenu = fileMenu.find((n) => n.label === "最近打开");
    recentSubMenu.subNodes = createRecentFileGroup(recentFileList.value);
  },
  { deep: true }
);
</script>
