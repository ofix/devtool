import { BaseContainer } from "./BaseContainer.js";
export class GraphContainer extends BaseContainer {
  constructor(core, tableRender, fieldTag) {
    super(core, tableRender, fieldTag);
    this.otherNodeNum = 4;
  }
  calcContainerSize(startX, startY) {
    const pad = this.core.padding;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const contentW = tableSize.width * 3;
    const contentH = tableSize.height * 3;
    const totalW = contentW + pad * 2;
    const totalH = contentH + pad * 2 + CONTAINER_TITLE_HEIGHT;
    return { width: totalW, height: totalH };
  }
  _renderAllNodes(startX, startY) {
    const pad = this.core.padding;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const centerX = startX + pad + tableSize.width;
    const centerY = startY + CONTAINER_TITLE_HEIGHT + pad + tableSize.height;
    // 中心完整节点
    this._renderRealNode(centerX, centerY, 0);
    const centerMidX = centerX + tableSize.width / 2;
    const centerMidY = centerY + tableSize.height / 2;
    // 四周轮廓节点
    const posList = [
      { x: centerX - 160, y: centerY - 100, label: "node A" },
      { x: centerX + 160, y: centerY - 100, label: "node B" },
      { x: centerX - 140, y: centerY + 90, label: "node C" },
      { x: centerX + 140, y: centerY + 90, label: "node D" }
    ];
    for (const pos of posList) {
      this._renderOutlineNode(pos.x, pos.y, OUTLINE_W, OUTLINE_H, pos.label);
      const outMidX = pos.x + OUTLINE_W / 2;
      const outMidY = pos.y + OUTLINE_H / 2;
      this.core.line(centerMidX, centerMidY, outMidX, outMidY, false, "#999");
    }
    const size = this.calcContainerSize(startX, startY);
    this._renderBackgroundBox(startX, startY, size.width, size.height, `Graph ${this.tag.fieldName}`);
  }
}