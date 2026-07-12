import Command from "./Command.js";
/**
 * 节点类型切换专属命令，支持撤销/重做
 */
class UpdateNodeCommand extends Command {
  constructor(scene, oldNode, newNode) {
    super();
    this.scene = scene;
    this.oldNode = oldNode;
    this.newNode = newNode;
  }

  execute() {
    this._replaceNode(this.oldNode, this.newNode);
    this.scene.fire('node-type-changed',
      { oldNode: this.oldNode, newNode: this.newNode }
    );
  }

  undo() {
    this._replaceNode(this.newNode, this.oldNode);
    this.scene.fire('node-type-change-undo',
      { oldNode: this.newNode, newNode: this.oldNode }
    );
  }

  redo() {
    this.execute();
  }

  /**
   * 内部替换逻辑：删除旧节点全量缓存，插入新节点
   * @param {Shape} delNode 待删除节点
   * @param {Shape} addNode 待新增节点
   */
  _replaceNode(delNode, addNode) {
    const rbushItem = delNode.rbushItem;
    // 从 rbush 空间索引删除
    this.scene.rbush.remove(rbushItem, (a, b) => a.data === b.data);

    // 从全量nodes数组移除
    this.scene.nodes = this.scene.nodes.filter(n => n !== delNode);

    // 从可见节点缓存移除
    this.scene.visibleNodes.delete(delNode);

    // 从选中集合移除旧节点，选中新节点
    this.scene.activeNodes.delete(delNode);
    this.scene.activeNodes.add(addNode);

    // 更新分类统计
    const oldCls = delNode.constructor.name;
    const oldList = this.scene.nodeStat.map.get(oldCls);
    if (oldList) {
      this.scene.nodeStat.map.set(oldCls, oldList.filter(n => n !== delNode));
      if (this.scene.nodeStat.map.get(oldCls).length === 0) {
        this.scene.nodeStat.map.delete(oldCls);
      }
    }
    this.scene.nodeStat.total -= 1;

    // 添加新节点复用已有 addNode 逻辑（自动更新rbush、nodes、统计、可见缓存、zIndex排序）
    this.scene.addNode(addNode);
  }
}

export default UpdateNodeCommand;