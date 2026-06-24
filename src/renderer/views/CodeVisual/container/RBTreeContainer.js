import { BaseContainer } from "./BaseContainer.js";
export class RBTreeContainer extends BaseContainer {
  constructor(core, tableRender, fieldTag) {
    super(core, tableRender, fieldTag);
  }
  calcContainerSize(startX, startY) {
    const pad = this.core.padding;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const contentW = tableSize.width + NODE_GAP_X * 2;
    const contentH = tableSize.height + NODE_GAP_Y + OUTLINE_H;
    const totalW = contentW + pad * 2;
    const totalH = contentH + pad * 2 + CONTAINER_TITLE_HEIGHT;
    return { width: totalW, height: totalH };
  }
  _renderAllNodes(startX, startY) {
    const pad = this.core.padding;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const contentTop = startY + CONTAINER_TITLE_HEIGHT + pad;
    const rootX = startX + pad + NODE_GAP_X;
    // 根节点完整表格
    this._renderRealNode(rootX, contentTop, 0);
    const rootBottom = contentTop + tableSize.height;
    const childY = rootBottom + NODE_GAP_Y;
    // 红黑轮廓子节点
    const leftX = rootX - NODE_GAP_X / 2;
    const rightX = rootX + tableSize.width + NODE_GAP_X / 2;
    this._renderOutlineNode(leftX, childY, OUTLINE_W, OUTLINE_H, "red node", "#f56c6c");
    this._renderOutlineNode(rightX, childY, OUTLINE_W, OUTLINE_H, "black node", "#303133");
    // 连接线
    const rootMidX = rootX + tableSize.width / 2;
    const leftMid = leftX + OUTLINE_W / 2;
    const rightMid = rightX + OUTLINE_W / 2;
    const childMidY = childY + OUTLINE_H / 2;
    this.core.line(rootMidX, rootBottom, leftMid, childMidY);
    this.core.line(rootMidX, rootBottom, rightMid, childMidY);
    const size = this.calcContainerSize(startX, startY);
    this._renderBackgroundBox(startX, startY, size.width, size.height, `RBTree ${this.tag.fieldName}`);
  }
}