import { MenuCmd, MenuRes, createRecentFileCmd } from "@/menu/MenuCmd.js";
import { MenuNodeType } from "@/menu/MenuNodeType.js";

// 普通点击菜单项原子
export function MenuItem(cmd) {
  return {
    type: MenuNodeType.Item,
    cmd,
    ...MenuRes[cmd]
  }
}

// 分割线
export function MenuDivider() {
  return { type: MenuNodeType.Divider }
}

// 子菜单容器工厂，支持传入下级节点数组
export function MenuSubMenu(label, subMenuList = []) {
  return {
    type: MenuNodeType.SubMenu,
    label,
    subMenuList
  }
}

// 动态最近文件分组（输出标准Item数组，可嵌入任意层级）
export function createRecentFileGroup(recentList) {
  return recentList.map((item, idx) => ({
    type: MenuNodeType.Item,
    cmd: createRecentFileCmd(idx),
    label: `${idx + 1}. ${item.name}`,
    fullPath: item.path,
    shortcut: ""
  }));
}

// 基础编辑组（扁平节点数组）
export function groupBasicEdit() {
  return [
    MenuItem(MenuCmd.Cut),
    MenuItem(MenuCmd.Copy),
    MenuItem(MenuCmd.Paste),
    MenuDivider()
  ]
}