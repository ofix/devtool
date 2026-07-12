import Command from "./Command.js";

/**
 * 统一选择命令：合并 选中/取消选中/框选/清空选中
 * opType: select | deselect | selectBox | clearSelect
 */
class SelectCommand extends Command {
  /**
   * @param {SceneManager} scene
   * @param {string} opType 操作类型
   * @param {object} payload 载荷
   *  - select/deselect: { node: Shape }
   *  - selectBox: { box: {x0,y0,x1,y1}, ctrl: boolean }
   */
  constructor(scene, opType, payload) {
    super();
    this.scene = scene;
    this.opType = opType;
    this.payload = payload;
    // 执行前快照选中集合，用于撤销恢复
    this.prevActive = new Set(scene.activeNodes);
    // 框选时缓存框选矩形快照
    this.prevSelectBox = scene.selectBox ? { ...scene.selectBox } : null;
  }

  execute() {
    const { opType, payload } = this;
    switch (opType) {
      // 单点选中单个节点
      case 'select': {
        if (!payload.node) break;
        if (!payload.ctrl) this.scene.activeNodes.clear();
        this.scene.activeNodes.add(payload.node);
        break;
      }
      // 取消单个节点选中
      case 'deselect': {
        if (!payload.node) break;
        this.scene.activeNodes.delete(payload.node);
        break;
      }
      // 框选批量选中
      case 'selectBox': {
        const { box, ctrl } = payload;
        this.scene.selectBox = box;
        const boxNodes = this.scene._getNodesBySelectBox();
        if (!ctrl) this.scene.activeNodes.clear();
        boxNodes.forEach(n => this.scene.activeNodes.add(n));
        break;
      }
      // 清空所有选中 + 销毁框选
      case 'clearSelect': {
        this.scene.activeNodes.clear();
        this.scene.selectBox = null;
        this.scene.isDragging = false;
        break;
      }
    }
    this.scene.render();
    this.scene.dispatchEvent(new CustomEvent('select-change', {
      detail: { opType, activeNodes: Array.from(this.scene.activeNodes) }
    }));
  }

  undo() {
    // 恢复选中快照、框选快照
    this.scene.activeNodes = new Set(this.prevActive);
    this.scene.selectBox = this.prevSelectBox;
    this.scene.render();
    this.scene.dispatchEvent(new CustomEvent('select-change-undo', {
      detail: { activeNodes: Array.from(this.scene.activeNodes) }
    }));
  }

  redo() {
    this.execute();
  }
}

export default SelectCommand;

