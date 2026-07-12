import Command from "./Command.js"

// 新增节点命令
class AddNodeCommand extends Command {
  constructor(scene, node) {
    super();
    this.scene = scene;
    this.node = node;
  }
  execute() { this.scene.addNode(this.node); }
  undo() { this.scene.removeNode(this.node); }
  redo() { this.scene.addNode(this.node); }
}

export default AddNodeCommand;