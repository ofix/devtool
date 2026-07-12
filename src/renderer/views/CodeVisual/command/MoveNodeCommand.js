import Command from "./Command.js";

/**
 * 节点移动命令：批量移动选中节点 + 同步更新连线起止坐标
 */
class MoveNodeCommand extends Command {
  /**
   * @param {SceneManager} scene
   * @param {Set<Shape>} moveNodes 需要移动的节点集合
   * @param {number} dx X偏移量
   * @param {number} dy Y偏移量
   */
  constructor(scene, moveNodes, dx, dy) {
    super();
    this.scene = scene;
    this.moveNodes = Array.from(moveNodes);
    this.dx = dx;
    this.dy = dy;
    // 存储原始坐标快照用于撤销
    this.nodeOriginPos = new Map();
    this.connectOriginData = [];
    // 缓存所有连线原始起止点
    this.scene.connectNodes.forEach(line => {
      this.connectOriginData.push({
        line,
        startX: line.startX,
        startY: line.startY,
        endX: line.endX,
        endY: line.endY
      });
    });
    // 缓存每个节点原始包围盒
    this.moveNodes.forEach(node => {
      this.nodeOriginPos.set(node, {
        minX: node.bounds.minX,
        minY: node.bounds.minY,
        maxX: node.bounds.maxX,
        maxY: node.bounds.maxY
      });
    });
  }

  execute() {
    this._moveOffset(this.dx, this.dy);
  }

  undo() {
    // 还原节点包围盒
    this.moveNodes.forEach(node => {
      const origin = this.nodeOriginPos.get(node);
      node.bounds = { ...origin };
      node.updateBounds();
      this._updateRbushItem(node);
    });
    // 还原所有连线原始坐标
    this.connectOriginData.forEach(item => {
      const line = item.line;
      line.startX = item.startX;
      line.startY = item.startY;
      line.endX = item.endX;
      line.endY = item.endY;
      line.updatePath(); // 连线内部更新贝塞尔路径
    });
    this.scene._updateVisibleNodes();
    this.scene.render();
    this.scene.dispatchEvent(new CustomEvent('node-move-undo'));
  }

  redo() {
    this.execute();
  }

  /**
   * 统一位移逻辑
   */
  _moveOffset(dx, dy) {
    // 1. 更新所有移动节点 bounds
    this.moveNodes.forEach(node => {
      node.bounds.minX += dx;
      node.bounds.minY += dy;
      node.bounds.maxX += dx;
      node.bounds.maxY += dy;
      node.updateBounds();
      // 更新RBush空间索引
      this._updateRbushItem(node);
    });

    // 2. 同步更新所有关联连线起点/终点
    this.scene.connectNodes.forEach(line => {
      const isStartBind = this.moveNodes.some(n => n.id === line.startNodeId);
      const isEndBind = this.moveNodes.some(n => n.id === line.endNodeId);
      if (isStartBind) {
        line.startX += dx;
        line.startY += dy;
      }
      if (isEndBind) {
        line.endX += dx;
        line.endY += dy;
      }
      if (isStartBind || isEndBind) {
        line.updatePath();
      }
    });

    this.scene._updateVisibleNodes();
    this.scene.render();
    this.scene.dispatchEvent(new CustomEvent('node-move', {
      detail: { dx, dy, nodes: this.moveNodes }
    }));
  }

  /**
   * RBush 单个节点包围盒更新（删旧插新）
   */
  _updateRbushItem(node) {
    const rbush = this.scene.rbush;
    rbush.remove(node.rbushItem, (a, b) => a.data === b.data);
    const newItem = {
      minX: node.bounds.minX,
      minY: node.bounds.minY,
      maxX: node.bounds.maxX,
      maxY: node.bounds.maxY,
      data: node
    };
    node.rbushItem = newItem;
    rbush.insert(newItem);
  }
}

export default MoveNodeCommand;
