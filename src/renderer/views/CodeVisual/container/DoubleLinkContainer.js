import { BaseContainer } from "./BaseContainer.js";
export class DoubleLinkContainer extends BaseContainer {
  constructor(core, tableRender, fieldTag) {
    super(core, tableRender, fieldTag);
  }
  calcContainerSize(startX, startY) {
    const pad = this.core.padding;
    const realNum = this.config.showRealNodeCount;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const contentW = tableSize.width * realNum + NODE_GAP_X * realNum;
    const totalW = contentW + pad * 2;
    const totalH = tableSize.height + pad * 2 + CONTAINER_TITLE_HEIGHT;
    return { width: totalW, height: totalH };
  }
  _renderAllNodes(startX, startY) {
    const pad = this.core.padding;
    const realNum = this.config.showRealNodeCount;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    let currX = startX + pad;
    const topY = startY + CONTAINER_TITLE_HEIGHT + pad;
    const midY = topY + tableSize.height / 2;
    for (let i = 0; i < realNum; i++) {
      this._renderRealNode(currX, topY, i);
      const rightX = currX + tableSize.width;
      // 双向箭头
      this.core.ctx.strokeStyle = "#666";
      this.core.ctx.lineWidth = 1.5;
      this.core.ctx.setLineDash([]);
      this.core.ctx.beginPath();
      this.core.ctx.moveTo(rightX, midY);
      this.core.ctx.lineTo(rightX + NODE_GAP_X / 2, midY);
      this.core.ctx.stroke();
      currX += tableSize.width + NODE_GAP_X;
    }
    this._renderOutlineNode(currX, topY, OUTLINE_W, OUTLINE_H, "<-> ...");
    const size = this.calcContainerSize(startX, startY);
    this._renderBackgroundBox(startX, startY, size.width, size.height, `DoubleLinkedList ${this.tag.fieldName}`);
  }
}