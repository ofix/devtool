import { BaseContainer } from "./BaseContainer.js";
export class SkipListContainer extends BaseContainer {
  constructor(core, tableRender, fieldTag) {
    super(core, tableRender, fieldTag);
    this.layerCount = 3;
    this.layerH = 46;
  }
  calcContainerSize(startX, startY) {
    const pad = this.core.padding;
    const realNum = this.config.showRealNodeCount;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const contentW = tableSize.width * realNum + NODE_GAP_X * realNum;
    const contentH = this.layerH * this.layerCount;
    const totalW = contentW + pad * 2;
    const totalH = contentH + pad * 2 + CONTAINER_TITLE_HEIGHT;
    return { width: totalW, height: totalH };
  }
  _renderAllNodes(startX, startY) {
    const pad = this.core.padding;
    const realNum = this.config.showRealNodeCount;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const baseLayerY = startY + CONTAINER_TITLE_HEIGHT + pad + this.layerH * (this.layerCount - 1);
    let currX = startX + pad;
    // 底层数据链表（实节点）
    for (let i = 0; i < realNum; i++) {
      this._renderRealNode(currX, baseLayerY, i);
      currX += tableSize.width + NODE_GAP_X;
    }
    this._renderOutlineNode(currX, baseLayerY, OUTLINE_W, OUTLINE_H, "...");
    // 上层索引层（轮廓虚线）
    for (let layer = 1; layer < this.layerCount; layer++) {
      const layerY = baseLayerY - this.layerH * layer;
      let idxX = startX + pad;
      for (let i = 0; i < realNum; i += 2) {
        this._renderOutlineNode(idxX, layerY, OUTLINE_W / 2, 30, `Lv${layer}`);
        idxX += (tableSize.width + NODE_GAP_X) * 2;
      }
    }
    const size = this.calcContainerSize(startX, startY);
    this._renderBackgroundBox(startX, startY, size.width, size.height, `SkipList ${this.tag.fieldName}`);
  }
}