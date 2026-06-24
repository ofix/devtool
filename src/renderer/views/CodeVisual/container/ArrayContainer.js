import { BaseContainer } from "./BaseContainer.js";
export class ArrayContainer extends BaseContainer {
  constructor(core, tableRender, fieldTag) {
    super(core, tableRender, fieldTag);
  }
  calcContainerSize(startX, startY) {
    const pad = this.core.padding;
    const realNum = this.config.showRealNodeCount;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    let contentW = tableSize.width * realNum + NODE_GAP_X * (realNum - 1);
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
    // 绘制完整实节点
    for (let i = 0; i < realNum; i++) {
      this._renderRealNode(currX, topY, i);
      currX += tableSize.width + NODE_GAP_X;
      // 数组竖分隔线
      const midY = topY + tableSize.height / 2;
      this.core.ctx.strokeStyle = "#b4d8ff";
      this.core.ctx.lineWidth = 1;
      this.core.ctx.beginPath();
      this.core.ctx.moveTo(currX - NODE_GAP_X / 2, topY);
      this.core.ctx.lineTo(currX - NODE_GAP_X / 2, topY + tableSize.height);
      this.core.ctx.stroke();
    }
    // 末尾轮廓占位
    this._renderOutlineNode(currX, topY, OUTLINE_W, OUTLINE_H, "...");
    // 容器标题外框
    const size = this.calcContainerSize(startX, startY);
    this._renderBackgroundBox(startX, startY, size.width, size.height, `Array[${this.tag.fieldName}]`);
  }
}