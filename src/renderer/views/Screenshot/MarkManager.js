class MarkManager {
    constructor() {
      this.shapeList = []; // 当前所有标注图形
      this.undoStack = []; // 撤销栈
      this.redoStack = []; // 重做栈
    }
  
    // 添加图形
    addShape(shape) {
      this.shapeList.push(shape);
      // 添加到撤销栈，清空重做栈
      this.undoStack.push(JSON.parse(JSON.stringify(this.shapeList)));
      this.redoStack = [];
    }
  
    // 移除图形
    removeShape(shape) {
      const index = this.shapeList.findIndex(item => item.id === shape.id);
      if (index > -1) {
        this.shapeList.splice(index, 1);
        this.undoStack.push(JSON.parse(JSON.stringify(this.shapeList)));
        this.redoStack = [];
      }
    }
  
    // 绘制所有图形
    drawAllShapes(ctx) {
      this.shapeList.forEach(shape => {
        shape.draw(ctx);
      });
    }
  
    // 撤销
    undo() {
      if (this.undoStack.length <= 1) return;
      // 弹出当前状态到重做栈
      const currentState = this.undoStack.pop();
      this.redoStack.push(currentState);
      // 恢复上一个状态
      const prevState = this.undoStack[this.undoStack.length - 1];
      this.shapeList = JSON.parse(JSON.stringify(prevState));
    }
  
    // 重做
    redo() {
      if (this.redoStack.length === 0) return;
      // 弹出重做栈顶部状态
      const nextState = this.redoStack.pop();
      this.undoStack.push(nextState);
      this.shapeList = JSON.parse(JSON.stringify(nextState));
    }
  }
  
  export default MarkManager;