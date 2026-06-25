// container/SingleLinkContainer.js
import { BaseContainer } from "./BaseContainer.js";

export class SingleLinkContainer extends BaseContainer {
  constructor(core, tableRender, fieldTag) {
    super(core, tableRender, fieldTag);
    this.nodeGap = 60; // 节点横向间距
    this.nodeOutlineW = 120;
    this.nodeOutlineH = 40;
  }

  calcContainerSize(startX, startY) {
    const pad = this.core.padding;
    const realCount = this.config.showRealNodeCount;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    // 单个实节点宽度
    const realW = tableSize.width;
    // 总宽度 = 实节点宽度和 + 轮廓宽度 + 间距
    const totalContentW = realCount * realW + (realCount - 1) * this.nodeGap + this.nodeGap + this.nodeOutlineW;
    const totalW = totalContentW + pad * 2;
    const totalH = tableSize.height + pad * 2 + 28; // 28是标题栏高度
    return { width: totalW, height: totalH };
  }

  _renderAllNodes(startX, startY) {
    const pad = this.core.padding;
    const realCount = this.config.showRealNodeCount;
    let currX = startX + pad;
    const contentTop = startY + 28 + pad;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);

    // 1. 渲染指定数量完整实节点（内嵌结构体表格）
    for (let i = 0; i < realCount; i++) {
      this._renderRealNode(currX, contentTop, i);
      // 绘制单向链表 next 箭头
      const arrowX = currX + tableSize.width;
      const arrowY = contentTop + tableSize.height / 2;
      this.core.line(arrowX, arrowY, arrowX + this.nodeGap / 2, arrowY, false, "#666");
      currX += tableSize.width + this.nodeGap;
    }

    // 2. 渲染剩余节点轮廓占位
    this._renderOutlineNode(currX, contentTop, this.nodeOutlineW, this.nodeOutlineH, "...next 链表节点");
    // 链表尾部虚线终止标记
    const endX = currX + this.nodeOutlineW;
    const midY = contentTop + this.nodeOutlineH / 2;
    this.core.line(endX, midY, endX + 20, midY, true, "#c0c4cc");
  }
}