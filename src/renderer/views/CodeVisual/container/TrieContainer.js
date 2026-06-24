import { BaseContainer } from "./BaseContainer.js";
export class TrieContainer extends BaseContainer {
  constructor(core, tableRender, fieldTag) {
    super(core, tableRender, fieldTag);
    this.childCount = 4;
    this.charW = 40;
    this.charH = 32;
  }
  calcContainerSize(startX, startY) {
    const pad = this.core.padding;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const childTotalW = this.charW * this.childCount + NODE_GAP_X;
    const contentW = Math.max(tableSize.width, childTotalW);
    const contentH = tableSize.height + NODE_GAP_Y + this.charH;
    const totalW = contentW + pad * 2;
    const totalH = contentH + pad * 2 + CONTAINER_TITLE_HEIGHT;
    return { width: totalW, height: totalH };
  }
  _renderAllNodes(startX, startY) {
    const pad = this.core.padding;
    const tableSize = this.tableRender.calcStructTableSize(this.structData);
    const rootY = startY + CONTAINER_TITLE_HEIGHT + pad;
    const rootX = startX + pad;
    this._renderRealNode(rootX, rootY, 0);
    const rootBottom = rootY + tableSize.height;
    const childY = rootBottom + NODE_GAP_Y;
    let childX = rootX;
    const rootMid = rootX + tableSize.width / 2;
    // 多个字符子节点轮廓
    for (let i = 0; i < this.childCount; i++) {
      this._renderOutlineNode(childX, childY, this.charW, this.charH, String.fromCharCode(97 + i));
      const charMid = childX + this.charW / 2;
      this.core.line(rootMid, rootBottom, charMid, childY);
      childX += this.charW + 12;
    }
    const size = this.calcContainerSize(startX, startY);
    this._renderBackgroundBox(startX, startY, size.width, size.height, `Trie ${this.tag.fieldName}`);
  }
}