// 通用尺寸常量
export const OUTLINE_W = 110;
export const OUTLINE_H = 38;
export const NODE_GAP_X = 65;
export const NODE_GAP_Y = 90;
export const CONTAINER_TITLE_HEIGHT = 28;

export class BaseContainer {
    constructor(canvasCore, tableRender, fieldTag) {
      this.core = canvasCore;
      this.tableRender = tableRender;
      this.tag = fieldTag;
      this.config = fieldTag.displayConfig;
      this.structData = fieldTag.targetStructTable;
      // 缓存所有节点坐标、碰撞区域，用于交互
      this.nodeHitAreas = [];
    }
  
    // 外部统一调用入口：计算容器整体宽高
    calcContainerSize(startX, startY) {
      throw new Error("子类必须实现calcContainerSize");
    }
  
    // 主渲染入口
    render(startX, startY) {
      this.nodeHitAreas = [];
      this._renderBackgroundBox(startX, startY);
      this._renderAllNodes(startX, startY);
    }
  
    // 绘制容器外包围框（区分容器类型配色）
    _renderBackgroundBox(x, y, w, h, title) {
      const pad = this.core.padding;
      // 容器头部标题栏
      this.core.drawRoundRect(x, y, w, 28, [6,6,0,0], "#f0f7ff", "#79bbff");
      this.core.ctx.fillStyle = "#0052cc";
      this.core.drawText(x + pad, y, `${title} [可调整展示节点数]`, w - pad * 2);
      // 容器主体外框
      this.core.drawRoundRect(x, y + 28, w, h - 28, 6, "#ffffff", "#b4d8ff");
    }
  
    // 子类实现：遍历绘制实节点+轮廓节点
    _renderAllNodes(startX, startY) {}
  
    // 渲染实节点：内嵌完整结构体表格
    _renderRealNode(x, y, nodeIndex) {
      // 复用已写好的结构体表格渲染
      const tableSize = this.tableRender.calcStructTableSize(this.structData);
      this.tableRender.drawSingleStruct(this.structData, x, y);
      // 记录碰撞区域，支持双击编辑内部表格字段
      this.nodeHitAreas.push({
        type: "real",
        index: nodeIndex,
        x, y,
        w: tableSize.width,
        h: tableSize.height
      });
      return tableSize;
    }
  
    // 渲染轻量化轮廓节点（无内嵌表格，仅色块+名称）
    _renderOutlineNode(x, y, w, h, label, color = "#c0c4cc") {
      this.core.drawRoundRect(x, y, w, h, 4, "#f5f7fa", color);
      this.core.ctx.fillStyle = "#909399";
      this.core.drawText(x + 6, y, label, w - 12);
      this.nodeHitAreas.push({
        type: "outline",
        index: -1,
        x, y, w, h
      });
    }
  }