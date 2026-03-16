// MarkManager.js
import ShapeFactory from "./Shapes/ShapeFactory.js";
import Matrix from "./Shapes/Matrix.js";

class MarkManager {
    constructor(canvas, canvasOffscreen, screenSize) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.canvasOffscreen = canvasOffscreen;
        this.ctxOffscreen = canvasOffscreen.getContext("2d");
        this.screenSize = screenSize;

        this.shapeList = []; // 当前所有标注图形
        // 选中图形集合（支持多选）
        this.selectedShapes = new Set(); // 新增
        // 框选区域
        this.selectionRect = null; // 新增
        // 是否正在框选
        this.isSelecting = false; // 新增
        
        // 修改：撤销/重做栈（存储完整状态）
        this.undoStack = []; // 修改用途
        this.redoStack = []; // 修改用途
        // 最大历史记录数
        this.maxHistorySize = 50; // 新增
        // 当前状态索引
        this.currentStateIndex = -1; // 新增
        
        this.currentShape = null; // 正在绘制的形状
        this.isDrawingShape = false; // 是否正在绘制形状
        this.startX = 0;
        this.startY = 0;
        this.endX = 0;
        this.endY = 0;
        
        // 视图变换矩阵（用于缩放/平移）
        this.viewTransform = new Matrix(); // 新增
        this.viewTransform.identity(); // 新增
        
        // 是否正在拖拽视图
        this.isDraggingView = false; // 新增
        // 是否正在拖拽选中图形
        this.isDraggingSelected = false; // 新增
        // 拖拽起始点（屏幕坐标）
        this.dragStart = { x: 0, y: 0 }; // 新增
        // 拖拽时选中的图形原始位置
        this.dragSelectedOriginalPositions = []; // 新增
        
        // 保存初始状态
        this.saveState();
    }

    // 保存状态到撤销栈
    saveState() {
        // 序列化当前所有图形
        const state = this.shapeList.map(shape => shape.toJSON());
        
        // 如果当前索引不是最新，删除后面的状态
        if (this.currentStateIndex < this.undoStack.length - 1) {
            this.undoStack = this.undoStack.slice(0, this.currentStateIndex + 1);
        }
        
        // 添加到栈
        this.undoStack.push(state);
        
        // 限制历史记录大小
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
        
        this.currentStateIndex = this.undoStack.length - 1;
        // 清空重做栈
        this.redoStack = [];
    }

    // 撤销
    undo() {
        if (this.currentStateIndex > 0) {
            this.currentStateIndex--;
            const state = this.undoStack[this.currentStateIndex];
            this.restoreFromState(state);
            // 将当前状态添加到重做栈
            this.redoStack.push(this.undoStack[this.currentStateIndex + 1]);
        }
    }

    // 重做
    redo() {
        if (this.redoStack.length > 0) {
            const state = this.redoStack.pop();
            this.currentStateIndex++;
            this.undoStack.push(state);
            this.restoreFromState(state);
        }
    }

    // 从状态恢复
    restoreFromState(state) {
        this.shapeList = state.map(json => ShapeFactory.fromJSON(json));
        // 清空选中集合
        this.selectedShapes.clear();
        this.redraw();
    }

    // 开始绘制形状
    startDrawing(type, x, y) {
        // 转换屏幕坐标为世界坐标
        const worldPos = this.screenToWorld(x, y);
        
        this.isDrawingShape = true;
        this.startX = worldPos.x;
        this.startY = worldPos.y;
        this.endX = worldPos.x;
        this.endY = worldPos.y;
        this.currentShape = ShapeFactory.createShape(type, worldPos.x, worldPos.y, {
            endX: worldPos.x,
            endY: worldPos.y,
            color: "#ff0000",
            lineWidth: 2,
        });
    }

    // 更新绘制中的形状
    updateDrawing(x, y) {
        if (!this.isDrawingShape || !this.currentShape) return;
        
        // 转换屏幕坐标为世界坐标
        const worldPos = this.screenToWorld(x, y);
        
        this.endX = worldPos.x;
        this.endY = worldPos.y;
        this.currentShape.updateEndPos(worldPos.x, worldPos.y);
        this.redraw();
    }

    // 完成形状绘制
    finishDrawing() {
        if (!this.isDrawingShape || !this.currentShape) return;
        this.isDrawingShape = false;
        this.addShape(this.currentShape);
        this.currentShape = null;
        this.redraw();
    }

    // 🟩 修改：添加图形（保存状态）
    addShape(shape) {
        this.shapeList.push(shape);
        this.saveState();
        this.redraw();
    }

    // 🟩 修改：移除图形（支持多选）
    removeShape(shapeId) {
        // 如果提供了具体ID，只移除该图形
        if (shapeId) {
            const index = this.shapeList.findIndex(item => item.id === shapeId);
            if (index > -1) {
                this.shapeList.splice(index, 1);
                this.selectedShapes.delete(shapeId);
            }
        } else {
            // 否则移除所有选中的图形
            this.shapeList = this.shapeList.filter(shape => !this.selectedShapes.has(shape.id));
            this.selectedShapes.clear();
        }
        this.saveState();
        this.redraw();
    }

    // 框选开始
    startSelection(x, y) {
        const worldPos = this.screenToWorld(x, y);
        this.isSelecting = true;
        this.selectionRect = {
            startX: worldPos.x,
            startY: worldPos.y,
            endX: worldPos.x,
            endY: worldPos.y
        };
    }

    // 更新框选
    updateSelection(x, y) {
        if (!this.isSelecting || !this.selectionRect) return;
        
        const worldPos = this.screenToWorld(x, y);
        this.selectionRect.endX = worldPos.x;
        this.selectionRect.endY = worldPos.y;
        
        this.redraw();
    }

    // 结束框选
    finishSelection() {
        if (!this.isSelecting || !this.selectionRect) return;
        
        // 计算框选区域
        const minX = Math.min(this.selectionRect.startX, this.selectionRect.endX);
        const minY = Math.min(this.selectionRect.startY, this.selectionRect.endY);
        const maxX = Math.max(this.selectionRect.startX, this.selectionRect.endX);
        const maxY = Math.max(this.selectionRect.startY, this.selectionRect.endY);
        
        // 清空当前选中
        this.selectedShapes.clear();
        
        // 选中所有与框选区域相交的图形
        this.shapeList.forEach(shape => {
            const bbox = shape.getBoundingBox();
            if (bbox.x <= maxX && bbox.x + bbox.width >= minX &&
                bbox.y <= maxY && bbox.y + bbox.height >= minY) {
                this.selectedShapes.add(shape.id);
            }
        });
        
        this.isSelecting = false;
        this.selectionRect = null;
        this.redraw();
    }

    // 开始拖拽选中图形
    startDragSelected(x, y) {
        if (this.selectedShapes.size === 0) return;
        
        const worldPos = this.screenToWorld(x, y);
        this.isDraggingSelected = true;
        this.dragStart = worldPos;
        
        // 保存所有选中图形的原始位置
        this.dragSelectedOriginalPositions = [];
        this.shapeList.forEach(shape => {
            if (this.selectedShapes.has(shape.id)) {
                this.dragSelectedOriginalPositions.push({
                    id: shape.id,
                    x: shape.x,
                    y: shape.y,
                    transform: shape.transform.clone()
                });
            }
        });
    }

    // 、更新拖拽
    updateDragSelected(x, y) {
        if (!this.isDraggingSelected) return;
        
        const worldPos = this.screenToWorld(x, y);
        const dx = worldPos.x - this.dragStart.x;
        const dy = worldPos.y - this.dragStart.y;
        
        // 移动所有选中的图形
        this.dragSelectedOriginalPositions.forEach(original => {
            const shape = this.shapeList.find(s => s.id === original.id);
            if (shape) {
                shape.transform = original.transform.clone();
                shape.translate(dx, dy);
            }
        });
        
        this.redraw();
    }

    // 结束拖拽
    finishDragSelected() {
        if (!this.isDraggingSelected) return;
        
        this.isDraggingSelected = false;
        this.saveState();
        this.redraw();
    }

    // 屏幕坐标转世界坐标
    screenToWorld(screenX, screenY) {
        return this.viewTransform.inverseTransformPoint(screenX, screenY);
    }

    // 世界坐标转屏幕坐标
    worldToScreen(worldX, worldY) {
        return this.viewTransform.transformPoint(worldX, worldY);
    }

    // 缩放视图（以屏幕点为中心）
    zoom(factor, centerX, centerY) {
        const worldCenter = this.screenToWorld(centerX, centerY);
        
        // 应用缩放
        this.viewTransform.translate(centerX, centerY)
            .scale(factor)
            .translate(-centerX, -centerY);
        
        this.redraw();
    }

    // 平移视图
    pan(dx, dy) {
        this.viewTransform.translate(dx, dy);
        this.redraw();
    }

    // 重绘所有标注（考虑视图变换）
    redraw() {
        // 清除离屏canvas
        this.ctxOffscreen.clearRect(0, 0, this.screenSize.width, this.screenSize.height);
        
        // 应用视图变换
        this.ctxOffscreen.save();
        const [a, b, c, d, e, f] = this.viewTransform.matrix;
        this.ctxOffscreen.transform(a, b, c, d, e, f);
        
        // 绘制所有已完成的形状
        this.shapeList.forEach(shape => {
            const isSelected = this.selectedShapes.has(shape.id);
            shape.selected = isSelected;
            if (shape.draw) {
                shape.draw(this.ctxOffscreen);
            }
        });
        
        // 绘制正在绘制的形状
        if (this.isDrawingShape && this.currentShape) {
            this.currentShape.draw(this.ctxOffscreen);
        }
        
        // 绘制框选区域
        if (this.isSelecting && this.selectionRect) {
            this.drawSelectionRect(this.ctxOffscreen);
        }
        
        this.ctxOffscreen.restore();
        
        // 将离屏canvas内容复制到显示canvas
        this.ctx.clearRect(0, 0, this.screenSize.width, this.screenSize.height);
        this.ctx.drawImage(this.canvasOffscreen, 0, 0);
    }

    // 绘制框选区域
    drawSelectionRect(ctx) {
        const x = Math.min(this.selectionRect.startX, this.selectionRect.endX);
        const y = Math.min(this.selectionRect.startY, this.selectionRect.endY);
        const width = Math.abs(this.selectionRect.endX - this.selectionRect.startX);
        const height = Math.abs(this.selectionRect.endY - this.selectionRect.startY);
        
        ctx.save();
        ctx.strokeStyle = '#0078d7';
        ctx.fillStyle = 'rgba(0, 120, 215, 0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        
        ctx.restore();
    }

    // 选择单个图形
    selectShape(x, y, addToSelection = false) {
        const worldPos = this.screenToWorld(x, y);
        
        // 从后往前查找（上层优先）
        for (let i = this.shapeList.length - 1; i >= 0; i--) {
            const shape = this.shapeList[i];
            if (shape.containsPoint(worldPos.x, worldPos.y)) {
                if (!addToSelection) {
                    this.selectedShapes.clear();
                }
                this.selectedShapes.add(shape.id);
                this.redraw();
                return true;
            }
        }
        
        if (!addToSelection) {
            this.selectedShapes.clear();
            this.redraw();
        }
        return false;
    }

    // 全选
    selectAll() {
        this.shapeList.forEach(shape => {
            this.selectedShapes.add(shape.id);
        });
        this.redraw();
    }

    // 取消选择
    deselectAll() {
        this.selectedShapes.clear();
        this.redraw();
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
            const bbox = shape.getBoundingBox();
            if (bbox.x <= selectionRect.x + selectionRect.width &&
                bbox.x + bbox.width >= selectionRect.x &&
                bbox.y <= selectionRect.y + selectionRect.height &&
                bbox.y + bbox.height >= selectionRect.y) {
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
        this.selectedShapes.clear();
        this.undoStack = [];
        this.redoStack = [];
        this.currentStateIndex = -1;
        this.currentShape = null;
        this.isDrawingShape = false;
        this.saveState();
        this.redraw();
    }
}

export default MarkManager;