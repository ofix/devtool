// container/BSTContainer.js
import { BaseContainer } from "./BaseContainer.js";

export class BSTContainer extends BaseContainer {
  constructor(core, tableRender, fieldTag) {
    super(core, tableRender, fieldTag);
    this.levelGap = 100; // 树层级垂直间距
    this.childGap = 80;  // 左右子节点水平间距
    this.outlineW = 90;
    this.outlineH = 36;
  }

  calcContainerSize(startX, startY) {
    const pad = this.core.padding;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const contentW = tableSize.width + this.childGap * 2;
    const contentH = tableSize.height + this.levelGap + this.outlineH;
    const totalW = contentW + pad * 2;
    const totalH = contentH + pad * 2 + 28;
    return { width: totalW, height: totalH };
  }

  _renderAllNodes(startX, startY) {
    const pad = this.core.padding;
    const contentTop = startY + 28 + pad;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const rootX = startX + pad + (this.childGap + tableSize.width) / 2;

    // 根节点：完整渲染结构体表格（唯一实节点）
    this._renderRealNode(rootX, contentTop, 0);
    const rootBottomY = contentTop + tableSize.height;

    // 左右子节点：仅灰色轮廓，无表格
    const leftX = rootX - this.childGap;
    const rightX = rootX + tableSize.width;
    const childY = rootBottomY + this.levelGap;
    this._renderOutlineNode(leftX, childY, this.outlineW, this.outlineH, "left child");
    this._renderOutlineNode(rightX, childY, this.outlineW, this.outlineH, "right child");

    // 绘制父子连接线
    const rootMidX = rootX + tableSize.width / 2;
    const leftMidX = leftX + this.outlineW / 2;
    const rightMidX = rightX + this.outlineW / 2;
    const childMidY = childY + this.outlineH / 2;
    this.core.line(rootMidX, rootBottomY, leftMidX, childMidY);
    this.core.line(rootMidX, rootBottomY, rightMidX, childMidY);
  }
}