import ShapeFactory from "./Shapes/ShapeFactory.js";

class MarkManager {
    constructor(canvas, canvasOffscreen, screenSize) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.canvasOffscreen = canvasOffscreen;
        this.ctxOffscreen = canvasOffscreen.getContext("2d");
        this.screenSize = screenSize;

        this.shapeList = []; // 当前所有标注图形
        this.undoStack = []; // 撤销栈
        this.redoStack = []; // 重做栈
        this.currentShape = null; // 正在绘制的形状
        this.isDrawingShape = false; // 是否正在绘制形状
        this.startX = 0;
        this.startY = 0;
        this.endX = 0;
        this.endY = 0;
    }

    // 开始绘制形状
    startDrawing(type, x, y) {
        this.isDrawingShape = true;
        this.startX = x;
        this.startY = y;
        this.endX = x;
        this.endY = y;
        this.currentShape = ShapeFactory.createShape(type, x, y, {
            endX: x,
            endY: y,
            color: "#ff0000",
            lineWidth: 2,
        });
    }

    // 更新绘制中的形状
    updateDrawing(x, y) {
        if (!this.isDrawingShape || !this.currentShape) return;
        this.endX = x;
        this.endY = y;
        this.currentShape.updateEndPos(x, y);
    }

    // 完成形状绘制
    finishDrawing() {
        if (!this.isDrawingShape || !this.currentShape) return;
        this.isDrawingShape = false;
        this.addShape(this.currentShape);
        this.currentShape = null;
    }

    // 添加图形
    addShape(shape) {
        this.shapeList.push(shape);
        // 保存状态到撤销栈（深拷贝）
        const state = JSON.parse(JSON.stringify(this.shapeList));
        this.undoStack.push(state);
        this.redoStack = []; // 新增操作清空重做栈
        this.redraw();
    }

    // 移除图形
    removeShape(shapeId) {
        const index = this.shapeList.findIndex(item => item.id === shapeId);
        if (index > -1) {
            this.shapeList.splice(index, 1);
            const state = JSON.parse(JSON.stringify(this.shapeList));
            this.undoStack.push(state);
            this.redoStack = [];
            this.redraw();
        }
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
        this.redraw();
    }

    // 重做
    redo() {
        if (this.redoStack.length === 0) return;
        const nextState = this.redoStack.pop();
        this.undoStack.push(nextState);
        this.shapeList = JSON.parse(JSON.stringify(nextState));
        this.redraw();
    }

    // 重绘所有标注
    redraw() {
        // 绘制所有已完成的形状
        if (this.shapeList.length != 0) {
            this.drawAllShapes();
        }
        // 绘制正在绘制的形状
        if (this.isDrawingShape && this.currentShape) {
            this.currentShape.draw(this.ctxOffscreen);
        }
    }

    // 绘制所有已完成的图形
    drawAllShapes() {
        this.shapeList.forEach(shape => {
            if (shape.draw) {
                shape.draw(this.ctxOffscreen);
            }
        });
    }

    // 获取包含标注的最终截图数据
    getFinalImageData(selectionRect) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = selectionRect.width;
        tempCanvas.height = selectionRect.height;
        const tempCtx = tempCanvas.getContext("2d");

        // 绘制选区背景
        tempCtx.drawImage(
            this.canvasOffscreen,
            selectionRect.x,
            selectionRect.y,
            selectionRect.width,
            selectionRect.height,
            0,
            0,
            selectionRect.width,
            selectionRect.height
        );

        // 绘制选区内的标注
        this.shapeList.forEach(shape => {
            if (shape.isInRect(selectionRect) && shape.draw) {
                // 转换坐标到临时Canvas
                tempCtx.save();
                tempCtx.translate(-selectionRect.x, -selectionRect.y);
                shape.draw(tempCtx);
                tempCtx.restore();
            }
        });

        return tempCanvas.toDataURL("image/png");
    }

    // 清空所有标注
    clear() {
        this.shapeList = [];
        this.undoStack = [];
        this.redoStack = [];
        this.currentShape = null;
        this.isDrawingShape = false;
        this.redraw();
    }
}

export default MarkManager;