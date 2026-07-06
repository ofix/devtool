// 菜单命令ID，对标MFC ID_EDIT_COPY
// 节点类型常量


export const MenuCmd = Object.freeze({
    NewFile: 'edit.newFile',
    OpenDir: 'edit.openDir',
    OpenFile: 'edit.openFile',
    Copy: "edit.copy",
    Cut: "edit.cut",
    Paste: "edit.paste",
    SelectAll: "edit.selectAll",
    CopySvg: "edit.copy.svg",
    CopyHex: "edit.copy.hex",
    // 动态最近文件统一前缀
    RecentFilePrefix: "file.recent.",
});

// 菜单静态资源：文本、快捷键，等价MFC .rc
export const MenuRes = Object.freeze({
    [MenuCmd.NewFile]: { label: "新建文件", shortcut: "Ctrl+N" },
    [MenuCmd.OpenFile]: { label: "打开文件", shortcut: "" },
    [MenuCmd.OpenDir]: { label: "打开目录", shortcut: "Ctrl+O" },
    [MenuCmd.Copy]: { label: "复制", shortcut: "Ctrl+C" },
    [MenuCmd.Cut]: { label: "剪切", shortcut: "Ctrl+X" },
    [MenuCmd.Paste]: { label: "粘贴", shortcut: "Ctrl+V" },
    [MenuCmd.SelectAll]: { label: "全选", shortcut: "Ctrl+A" },
    [MenuCmd.CopySvg]: { label: "复制SVG矢量图", shortcut: "Shift+Ctrl+C" },
    [MenuCmd.CopyHex]: { label: "复制十六进制", shortcut: "" }
});

/**
 * 生成最近文件动态菜单项唯一 cmd
 * @param {number} index 最近文件数组下标
 * @returns string 唯一命令标识
 */
export function createRecentFileCmd(index) {
    return `${MenuCmd.RecentFilePrefix}${index}`;
}