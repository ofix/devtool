
import Command from "./Command.js";
/**
 * 画布缩放视图命令（保存scale+offset完整快照）
 */
class SceneScaleCommand extends Command {
  constructor(scene, oldScale, oldOffset, newScale, newOffset) {
    super();
    this.scene = scene;
    this.oldScale = oldScale;
    this.oldOffset = { ...oldOffset };
    this.newScale = newScale;
    this.newOffset = { ...newOffset };
  }

  execute() {
    this.scene.scale = this.newScale;
    this.scene.offset = { ...this.newOffset };
    this.scene._updateVisibleNodes();
    this.scene.render();
    this.scene.fire('canvas-scale-change',
      { scale: this.newScale, offset: this.newOffset }
    );
  }

  undo() {
    this.scene.scale = this.oldScale;
    this.scene.offset = { ...this.oldOffset };
    this.scene._updateVisibleNodes();
    this.scene.render();
    this.scene.fire('canvas-scale-undo');
  }

  redo() {
    this.execute();
  }
}

export default SceneScaleCommand;