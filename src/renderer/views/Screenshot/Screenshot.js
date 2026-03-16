// Screenshot.js
import MarkManager from "./MarkManager.js"
import { ShapeType } from "./Shapes/ShapeFactory.js";
import ShapeFactory from "./Shapes/ShapeFactory.js";
import Matrix from "./Shapes/Matrix.js";

export default class Screenshot {
    static DrawingState = Object.freeze({
        NO_ACTION: 0,
        DRAG_CAPTURE_AREA: 1,
        MOVE_CAPTURE_AREA: 2,
        WINDOW_CAPTURE: 3,
        SCROLL_CAPTURE: 4,
        // 视图操作状态
        VIEW_PAN: 5,        // 新增
        VIEW_ZOOM: 6,       // 新增
        // 框选状态
        SELECTION_BOX: 7,   // 新增

        DRAG_CAPTURE_CORNER_TOP_LEFT: 10,
        DRAG_CAPTURE_CORNER_TOP_CENTER: 11,
        DRAG_CAPTURE_CORNER_TOP_RIGHT: 12,
        DRAG_CAPTURE_CORNER_LEFT_CENTER: 13,
        DRAG_CAPTURE_CORNER_RIGHT_CENTER: 14,
        DRAG_CAPTURE_CORNER_BOTTOM_LEFT: 15,
        DRAG_CAPTURE_BOTTOM_CENTER: 16,
        DRAG_CAPTURE_BOTTOM_RIGHT: 17,
        DRAW_LINE: 30,
        DRAW_ARROW: 31,
        DRAW_RECT: 32,
        DRAW_ELLIPSE: 33,
        DRAW_STAR: 34,
        DRAW_NUMBER: 35,
        DRAW_PENCIL: 36,
        DRAW_HILIGHTER: 37,
        DRAW_ERASER: 38,
        DRAW_MOSAIC: 39,
        DRAW_GAUSSIAN_BLUR: 40,
        MOVE_SHAPE: 50,
    });

    static CONFIG = {
        CONTROL_POINT_RADIUS: 4 * window.devicePixelRatio,
        MAGNIFIER_SIZE: 200 * window.devicePixelRatio,
        MAGNIFIER_RADIUS: 20 * window.devicePixelRatio,
        TOOLBAR_SIZE: {
            width: (31 * 13) * window.devicePixelRatio,
            height: 50 * window.devicePixelRatio
        },
        // 缩放配置
        ZOOM: {
            MIN: 0.1,
            MAX: 10,
            STEP: 1.1
        }
    };

    constructor(layerDesktop, layerCapture, layerOperation, layerMagnifierBox, captureMode) {
        // DOM 元素
        this.layerDesktop = layerDesktop;
        this.layerCapture = layerCapture;
        this.layerOperation = layerOperation;
        this.layerMagnifierBox = layerMagnifierBox;

        // Canvas 上下文
        this.ctxDesktop = this.layerDesktop?.getContext("2d");
        this.ctxCapture = this.layerCapture?.getContext("2d");
        this.ctxOperation = this.layerOperation?.getContext("2d");
        this.ctxMagnifierBox = this.layerMagnifierBox?.getContext("2d");

        // 离屏 Canvas
        this.canvasOffscreen = document.createElement("canvas");
        this.ctxOffscreen = this.canvasOffscreen.getContext("2d");

        this.dpr = window.devicePixelRatio || 1;

        this.physicalSize = {
            width: window.screen.width * this.dpr,
            height: window.screen.height * this.dpr
        };

        this.magnifierTimer = null;
        this.renderThrottleDelay = 16;
        this.captureFinish = false;

        // 核心状态
        this.markManager = null;
        this.currentMarkTool = ShapeType.NONE;
        this.showCtrlPoints = false;
        this.isMouseDown = false;
        this.drawingState = this._getDrawingState(captureMode);
        this.captureRect = { x: 0, y: 0, width: 0, height: 0 };
        this.lastCaptureRect = { x: 0, y: 0, width: 0, height: 0 };
        this.captureStart = { x: 0, y: 0 };
        this.captureRectMoveOffset = { x: 0, y: 0 };
        this.magnifierBoxPos = { x: 0, y: 0 };
        this.magnifierBoxCenter = { x: 0, y: 0 };
        this.toolbarPos = { x: 0, y: 0 };
        this.inEdit = false;

        this.imageDesktop = null;
        this.imageCapture = null;
        this.windowList = [];

        // 使用 Matrix
        this.history = [];
        this.historyIndex = -1;
        // 变换矩阵，只在 inEdit 模式下起作用
        this.transform = new Matrix(); // 修改
        this.transform.identity();

        // 上次鼠标位置（用于缩放）
        this.lastMousePos = { x: 0, y: 0 }; // 新增

        this._initLayers();

        // 绑定事件
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        // 滚轮事件
        this.onWheel = this.onWheel.bind(this); // 新增
    }

    _initLayers() {
        this.layerDesktop.width = this.physicalSize.width;
        this.layerDesktop.height = this.physicalSize.height;
        this.layerCapture.width = this.physicalSize.width;
        this.layerCapture.height = this.physicalSize.height;
        this.layerOperation.width = this.physicalSize.width;
        this.layerOperation.height = this.physicalSize.height;
        this.canvasOffscreen.width = this.physicalSize.width;
        this.canvasOffscreen.height = this.physicalSize.height;

        if (this.layerMagnifierBox) {
            this.layerMagnifierBox.width = Screenshot.CONFIG.MAGNIFIER_SIZE;
            this.layerMagnifierBox.height = Screenshot.CONFIG.MAGNIFIER_SIZE;
            this.ctxMagnifierBox.imageSmoothingEnabled = false;
        }

        this.ctxOffscreen.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);
        this.ctxCapture.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);
        this.ctxOperation.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);

        this.markManager = new MarkManager(
            this.layerOperation,
            this.canvasOffscreen,
            this.physicalSize
        );

        // 为 layerOperation 添加滚轮事件监听
        this.layerOperation.addEventListener('wheel', this.onWheel, { passive: false });
    }

    async init(buffer) {
        const dpr = this.dpr;
        this.ctxDesktop.setTransform(1, 0, 0, 1, 0, 0);
        this.ctxDesktop.scale(dpr, dpr);
        this.ctxDesktop.imageSmoothingEnabled = false;
        this.ctxDesktop.webkitImageSmoothingEnabled = false;
        this.ctxDesktop.mozImageSmoothingEnabled = false;
        this.ctxDesktop.msImageSmoothingEnabled = false;

        const imageBitmap = await createImageBitmap(new Blob([buffer]), {
            resizeQuality: "pixelated",
        });

        this.ctxDesktop.drawImage(
            imageBitmap,
            0, 0,
            imageBitmap.width,
            imageBitmap.height,
            0, 0,
            this.physicalSize.width,
            this.physicalSize.height
        );
        this.imageDesktop = imageBitmap;
        try {
            // 清空 Buffer 内容
            buffer.fill(0);
            buffer = null;
        } catch (e) {
            window.channel.debug(e);
            // 如果 buffer 是只读的，忽略错误
        }
    }

    // 保存状态（使用矩阵）
    saveState() {
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(this.transform.clone());
        this.historyIndex++;
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.transform = this.history[this.historyIndex].clone();
            this.refresh();
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.transform = this.history[this.historyIndex].clone();
            this.refresh();
        }
    }

    // 用户操作：平移
    pan(dx, dy) {
        this.saveState();
        this.transform.translate(dx, dy);
        this.refresh();
    }

    // 用户操作：缩放（以点为中心）
    zoomAt(factor, centerX, centerY) {
        this.saveState();

        // 将屏幕中心点转换为图像坐标（变换前）
        const imagePos = this.transform.inverseTransformPoint(centerX, centerY);

        // 应用缩放
        this.transform.scale(factor, factor);

        // 计算新的平移，使中心点保持不变
        const newScreenPos = this.transform.transformPoint(imagePos.x, imagePos.y);
        const dx = centerX - newScreenPos.x;
        const dy = centerY - newScreenPos.y;
        this.transform.translate(dx, dy);

        this.refresh();
    }

    // 用户操作：旋转
    rotate(angle, centerX, centerY) {
        this.saveState();

        const imagePos = this.transform.inverseTransformPoint(centerX, centerY);

        this.transform.translate(-centerX, -centerY)
            .rotate(angle)
            .translate(centerX, centerY);

        this.refresh();
    }

    // 滚轮事件处理
    onWheel(e) {
        e.preventDefault();

        if (!this.inEdit) return;

        const physicalPos = this._logicalToPhysical(e.clientX, e.clientY);
        const mouseX = physicalPos.x;
        const mouseY = physicalPos.y;

        const delta = e.deltaY > 0 ?
            1 / Screenshot.CONFIG.ZOOM.STEP :
            Screenshot.CONFIG.ZOOM.STEP;

        // 获取当前缩放
        const currentScale = this.transform.getScale();
        const newScale = currentScale * delta;

        // 限制缩放范围
        if (newScale >= Screenshot.CONFIG.ZOOM.MIN &&
            newScale <= Screenshot.CONFIG.ZOOM.MAX) {
            this.zoomAt(delta, mouseX, mouseY);
        }

        // 通知视图更新
        this._emit("zoomChanged", this.transform.getScale());
    }

    _logicalToPhysical(logicalX, logicalY) {
        return {
            x: Math.floor(logicalX * this.dpr),
            y: Math.floor(logicalY * this.dpr)
        };
    }

    _getDrawingState(captureMode) {
        if (captureMode == "window") {
            return Screenshot.DrawingState.WINDOW_CAPTURE;
        } else if (captureMode == 'rect') {
            return Screenshot.DrawingState.DRAG_CAPTURE_AREA;
        } else if (captureMode == 'scroll') {
            return Screenshot.DrawingState.SCROLL_CAPTURE;
        }
        return Screenshot.DrawingState.NO_ACTION;
    }

    _physicalToLogical(physicalX, physicalY) {
        return {
            x: physicalX / this.dpr,
            y: physicalY / this.dpr
        };
    }

    getMarkManager() {
        return this.markManager;
    }

    getCaptureRect() {
        return {
            x: this.captureRect.x / this.dpr,
            y: this.captureRect.y / this.dpr,
            width: this.captureRect.width / this.dpr,
            height: this.captureRect.height / this.dpr
        };
    }

    // 截图动画完成，进入编辑模式
    beginEdit() {
        this.inEdit = true;
        // 重置视图变换
        this.transform.identity();
        console.log("beginEdit: ",this.transform.matrix);
        this.markManager.viewTransform.identity();
    }

    setWindowList(windowList) {
        this.windowList = windowList;
    }

    isMouseInWindow(window, mousePos) {
        const { x, y, width, height } = window;
        return (
            mousePos.x >= x &&
            mousePos.x <= x + width &&
            mousePos.y >= y &&
            mousePos.y <= y + height
        );
    }

    getMouseHoverWindow(mousePos) {
        if (!this.windowList.length) {
            console.warn('窗口列表为空，无法判断鼠标所在窗口');
            return null;
        }

        const candidateWindows = this.windowList.filter(window =>
            this.isMouseInWindow(window, mousePos)
        );

        if (!candidateWindows.length) {
            return null;
        }

        candidateWindows.sort((a, b) => b.zOrder - a.zOrder);
        return candidateWindows[0];
    }

    // 鼠标按下事件
    onMouseDown(e) {
        this.isMouseDown = true;
        const physicalPos = this._logicalToPhysical(e.clientX, e.clientY);
        const mouseX = physicalPos.x;
        const mouseY = physicalPos.y;

        // 保存上次鼠标位置
        this.lastMousePos = { x: mouseX, y: mouseY };

        if (this.currentMarkTool === ShapeType.SELECT) {
            // 框选模式
            if (e.ctrlKey) {
                // Ctrl+点击：添加到选择
                this.markManager.selectShape(mouseX, mouseY, true);
            } else if (e.shiftKey) {
                // Shift+拖拽：开始框选
                this.drawingState = Screenshot.DrawingState.SELECTION_BOX;
                this.markManager.startSelection(mouseX, mouseY);
            } else {
                // 普通点击：单选或开始拖拽选中图形
                const hit = this.markManager.selectShape(mouseX, mouseY, false);
                if (hit && this.markManager.selectedShapes.size > 0) {
                    // 点击到图形，准备拖拽
                    this.drawingState = Screenshot.DrawingState.MOVE_SHAPE;
                    this.markManager.startDragSelected(mouseX, mouseY);
                } else {
                    // 没点击到图形，开始视图平移
                    this.drawingState = Screenshot.DrawingState.VIEW_PAN;
                    this.markManager.isDraggingView = true;
                }
            }
            return;
        } else if (this.currentMarkTool !== ShapeType.NONE) {
            const key = `DRAW_${ShapeFactory.typeToStr(this.currentMarkTool).toUpperCase()}`;
            this.drawingState = Screenshot.DrawingState[key] || Screenshot.DrawingState.NO_ACTION;
            this.markManager.startDrawing(this.currentMarkTool, mouseX, mouseY);
            return;
        }

        // 选区模式
        if (this.drawingState == Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
            this.captureStart = { x: mouseX, y: mouseY };
            this.captureRect = { x: mouseX, y: mouseY, width: 0, height: 0 };
        } else if (this.drawingState == Screenshot.DrawingState.WINDOW_CAPTURE) {
            if (this.captureWindow == null) {
                this.captureWindow = this.captureRect;
            }
        } else {
            if (this._isInsideSelection(mouseX, mouseY)) {
                this.drawingState = Screenshot.DrawingState.MOVE_CAPTURE_AREA;
                this.layerOperation.style.cursor = "move";
                this.captureRectMoveOffset = {
                    x: mouseX - this.captureRect.x,
                    y: mouseY - this.captureRect.y,
                };
            } else {
                this.drawingState = Screenshot.DrawingState.DRAG_CAPTURE_AREA;
                this.captureStart = { x: mouseX, y: mouseY };
                this.captureRect = { x: mouseX, y: mouseY, width: 0, height: 0 };
                this.showCtrlPoints = false;
            }
        }
    }

    // 鼠标移动事件
    onMouseMove(e) {
        const physicalPos = this._logicalToPhysical(e.clientX, e.clientY);
        const mouseX = physicalPos.x;
        const mouseY = physicalPos.y;

        if (!this.isMouseDown) {
            // 更新放大镜
            if (this.drawingState === Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
                this.magnifierBoxCenter.x = mouseX;
                this.magnifierBoxCenter.y = mouseY;
            }

            if (this.drawingState === Screenshot.DrawingState.WINDOW_CAPTURE) {
                let captureWindow = this.getMouseHoverWindow(physicalPos);
                if (captureWindow != null) {
                    this.captureRect = {
                        x: captureWindow.x,
                        y: captureWindow.y,
                        width: captureWindow.width,
                        height: captureWindow.height,
                    };
                }
            }

            // 更新光标样式（根据是否在选中图形上）
            if (this.inEdit && this.currentMarkTool === ShapeType.SELECT) {
                const worldPos = this.markManager.screenToWorld(mouseX, mouseY);
                const hit = this.markManager.shapeList.some(shape =>
                    shape.containsPoint(worldPos.x, worldPos.y)
                );
                this.layerOperation.style.cursor = hit ? 'move' : 'default';
            }
        } else {
            // 鼠标按下时的逻辑
            if (this.drawingState >= Screenshot.DrawingState.DRAW_LINE) {
                // 标注绘制
                this.markManager.updateDrawing(mouseX, mouseY);
            } else if (this.drawingState === Screenshot.DrawingState.SELECTION_BOX) {
                // 框选
                this.markManager.updateSelection(mouseX, mouseY);
            } else if (this.drawingState === Screenshot.DrawingState.MOVE_SHAPE) {
                // 移动选中图形
                this.markManager.updateDragSelected(mouseX, mouseY);
            } else if (this.drawingState === Screenshot.DrawingState.VIEW_PAN) {
                // 平移视图
                const dx = mouseX - this.lastMousePos.x;
                const dy = mouseY - this.lastMousePos.y;
                this.markManager.pan(dx, dy);
                this.pan(dx, dy);
                this.lastMousePos = { x: mouseX, y: mouseY };
            } else {
                // 选区操作
                if (this.drawingState === Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
                    this.magnifierBoxCenter.x = mouseX;
                    this.magnifierBoxCenter.y = mouseY;
                    this.captureRect = {
                        x: Math.min(this.captureStart.x, mouseX),
                        y: Math.min(this.captureStart.y, mouseY),
                        width: Math.abs(mouseX - this.captureStart.x),
                        height: Math.abs(mouseY - this.captureStart.y),
                    };
                } else if (this.drawingState >= 10 && this.drawingState <= 20) {
                    this._adjustSelection(mouseX, mouseY);
                } else {
                    this._moveCaptureRect(mouseX, mouseY);
                }
            }
        }
        this.refresh();
    }

    // 鼠标抬起事件
    onMouseUp(e) {
        if (this.isMouseDown) {
            this._emit("showMagnifier", false);
            clearTimeout(this.magnifierTimer);
        }

        if (this.drawingState >= Screenshot.DrawingState.DRAW_LINE) {
            this.markManager.finishDrawing();
        } else if (this.drawingState === Screenshot.DrawingState.SELECTION_BOX) {
            // 完成框选
            this.markManager.finishSelection();
        } else if (this.drawingState === Screenshot.DrawingState.MOVE_SHAPE) {
            // 完成拖拽图形
            this.markManager.finishDragSelected();
        } else if (this.drawingState === Screenshot.DrawingState.VIEW_PAN) {
            this.markManager.isDraggingView = false;
        }

        if (this.drawingState >= 11 && this.drawingState <= 20) {
            this.refresh();
        }

        if (this.isMouseDown) {
            this.isMouseDown = false;
            this.layerOperation.style.cursor = "arrow";
            if (this.drawingState == Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
                this.drawCaptureImage();
                this.captureFinish = true;
                this.refresh();
                this._emit("CaptureFinish", true);
            }
        }

        this.drawingState = Screenshot.DrawingState.NO_ACTION;
    }

    onMouseLeave() {
        window.channel.debug("mouse leave");
    }

    // 键盘事件
    onKeyDown(e) {
        if (e.key === "Escape") {
            if (this.inEdit) {
                // 在编辑模式下，ESC取消选择或重置视图
                if (this.markManager.selectedShapes.size > 0) {
                    this.markManager.deselectAll();
                } else {
                    this.transform.identity();
                    this.markManager.viewTransform.identity();
                    this.refresh();
                }
            } else {
                this.destroy();
                window.channel.cancelScreenshot();
            }
        } else if (e.key === "Delete" || e.key === "Backspace") {
            // 删除选中图形
            if (this.inEdit && this.markManager.selectedShapes.size > 0) {
                this.markManager.removeShape();
            }
        } else if (e.ctrlKey || e.metaKey) {
            // 撤销/重做
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.markManager.redo();
                } else {
                    this.markManager.undo();
                }
            } else if (e.key === 'a' || e.key === 'A') {
                // 全选
                e.preventDefault();
                if (this.inEdit) {
                    this.markManager.selectAll();
                }
            }
        } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            this._handleArrowKey(e.key, step);
        }
    }

    _handleArrowKey(key, step) {
        // 箭头键移动选中图形
        if (this.inEdit && this.markManager.selectedShapes.size > 0) {
            let dx = 0, dy = 0;
            switch (key) {
                case "ArrowUp": dy = -step; break;
                case "ArrowDown": dy = step; break;
                case "ArrowLeft": dx = -step; break;
                case "ArrowRight": dx = step; break;
            }

            if (dx !== 0 || dy !== 0) {
                this.markManager.selectedShapes.forEach(id => {
                    const shape = this.markManager.shapeList.find(s => s.id === id);
                    if (shape) {
                        shape.translate(dx, dy);
                    }
                });
                this.markManager.saveState();
                this.markManager.redraw();
            }
        } else {
            this._updateSelection(key, step);
        }
        this._updateMagnifier(key, step);
        this.refresh();
    }

    _updateMagnifier(direction, step) {
        const magnifierSize = 11 * this.dpr;
        const pixelSize = 10 * this.dpr;
        const totalMagnifierSize = magnifierSize * pixelSize;
        const maxX = this.physicalSize.width - totalMagnifierSize;
        const maxY = this.physicalSize.height - totalMagnifierSize;

        let { x, y } = this.magnifierBoxPos;
        switch (direction) {
            case "ArrowUp": y = Math.max(0, y - step); break;
            case "ArrowDown": y = Math.min(maxY, y + step); break;
            case "ArrowLeft": x = Math.max(0, x - step); break;
            case "ArrowRight": x = Math.min(maxX, x + step); break;
        }
        this.magnifierBoxPos = { x, y };
        this._emit("magnifierNewPos", this._physicalToLogical(x, y));
    }

    _updateSelection(direction, step) {
        const selection = this.captureRect;
        const maxX = this.physicalSize.width;
        const maxY = this.physicalSize.height;

        let endX = selection.x + selection.width;
        let endY = selection.y + selection.height;

        switch (direction) {
            case "ArrowUp":
                endY = Math.max(0, endY - step);
                break;
            case "ArrowDown":
                endY = Math.min(maxY, endY + step);
                break;
            case "ArrowLeft":
                endX = Math.max(0, endX - step);
                break;
            case "ArrowRight":
                endX = Math.min(maxX, endX + step);
                break;
        }

        const newStartX = Math.min(selection.x, endX);
        const newStartY = Math.min(selection.y, endY);
        const newEndX = Math.max(selection.x, endX);
        const newEndY = Math.max(selection.y, endY);
        const width = Math.abs(newEndX - newStartX);
        const height = Math.abs(newEndY - newStartY);

        this.captureRect = {
            x: newStartX,
            y: newStartY,
            width: width,
            height: height,
        };
        let e = {
            clientX: newEndX / this.dpr,
            clientY: newEndY / this.dpr
        };
        this.refresh();
    }

    _moveCaptureRect(mouseX, mouseY) {
        const { width, height } = this.captureRect;
        const { x: offsetX, y: offsetY } = this.captureRectMoveOffset;

        let newX = mouseX - offsetX;
        let newY = mouseY - offsetY;

        newX = Math.max(0, Math.min(newX, this.physicalSize.width - width));
        newY = Math.max(0, Math.min(newY, this.physicalSize.height - height));

        let left = Math.floor(newX / this.dpr);
        let top = Math.floor(newY / this.dpr);

        this.layerOperation.style.left = `${left}px`;
        this.layerOperation.style.top = `${top}px`;
    }

    moveCaptureRect(x, y) {
        this.captureRect.x = x * this.dpr;
        this.captureRect.y = y * this.dpr;
    }

    _adjustSelection(mouseX, mouseY) {
        const { x, y, width, height } = this.captureRect;
        const newSelection = { x, y, width, height };

        switch (this.drawingState) {
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_LEFT:
                newSelection.x = mouseX; newSelection.y = mouseY;
                newSelection.width = x + width - mouseX; newSelection.height = y + height - mouseY;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_RIGHT:
                newSelection.y = mouseY;
                newSelection.width = mouseX - x; newSelection.height = y + height - mouseY;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_BOTTOM_LEFT:
                newSelection.x = mouseX;
                newSelection.width = x + width - mouseX; newSelection.height = mouseY - y;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_BOTTOM_RIGHT:
                newSelection.width = mouseX - x; newSelection.height = mouseY - y;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_CENTER:
                newSelection.y = mouseY; newSelection.height = y + height - mouseY;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_BOTTOM_CENTER:
                newSelection.height = mouseY - y;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_LEFT_CENTER:
                newSelection.x = mouseX; newSelection.width = x + width - mouseX;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_RIGHT_CENTER:
                newSelection.width = mouseX - x;
                break;
        }

        if (newSelection.width < 0) {
            newSelection.x += newSelection.width;
            newSelection.width = Math.abs(newSelection.width);
        }
        if (newSelection.height < 0) {
            newSelection.y += newSelection.height;
            newSelection.height = Math.abs(newSelection.height);
        }

        newSelection.x = Math.max(0, newSelection.x);
        newSelection.y = Math.max(0, newSelection.y);
        newSelection.width = Math.min(newSelection.width, this.physicalSize.width - newSelection.x);
        newSelection.height = Math.min(newSelection.height, this.physicalSize.height - newSelection.y);

        this.captureRect = newSelection;
    }

    _isInControlPoint(mouseX, mouseY) {
        const { x, y, width, height } = this.captureRect;
        const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS + 2 * this.dpr;
        const points = [
            { x, y, cursor: "nwse-resize", state: 3 },
            { x: x + width / 2, y, cursor: "ns-resize", state: 4 },
            { x: x + width, y, cursor: "nesw-resize", state: 5 },
            { x, y: y + height / 2, cursor: "ew-resize", state: 6 },
            { x: x + width, y: y + height / 2, cursor: "ew-resize", state: 7 },
            { x, y: y + height, cursor: "nesw-resize", state: 8 },
            { x: x + width / 2, y: y + height, cursor: "ns-resize", state: 9 },
            { x: x + width, y: y + height, cursor: "nwse-resize", state: 10 },
        ];

        for (const p of points) {
            const dx = mouseX - p.x;
            const dy = mouseY - p.y;
            if (dx * dx + dy * dy <= radius * radius) {
                return p;
            }
        }
        return null;
    }

    _isInsideSelection(mouseX, mouseY) {
        const { x, y, width, height } = this.captureRect;
        return mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height;
    }

    _calculateToolbarPos() {
        const { x, y, width, height } = this.captureRect;
        const { width: tbW, height: tbH } = Screenshot.CONFIG.TOOLBAR_SIZE;

        let tbX = x + width - tbW;
        let tbY = y + height + 10 * this.dpr;

        tbX = Math.max(0, Math.min(tbX, this.physicalSize.width - tbW));
        tbY = Math.max(0, Math.min(tbY, this.physicalSize.height - tbH));

        this.toolbarPos = { x: tbX, y: tbY };
        this._emit("toolbarPosChange", this._physicalToLogical(tbX, tbY));
    }

    resetCaptureArea(newX, newY) {
        this.captureRect.x = newX;
        this.captureRect.y = newY;
        let rect = {
            x: 0,
            y: 0,
            width: this.physicalSize.width / this.dpr,
            height: this.physicalSize.height / this.dpr
        };
        console.log(rect);
        this.layerCapture.width = this.physicalSize.width; // 物理尺寸
        this.layerCapture.height = this.physicalSize.height;
        this.layerCapture.style.width = `${rect.width}px`; // CSS 尺寸
        this.layerCapture.style.height = `${rect.height}px`;
        this.layerCapture.style.position = "fixed";
        this.layerCapture.style.left = `${rect.x}px`;
        this.layerCapture.style.top = `${rect.y}px`;
        this.layerCapture.style.right = "auto";
        this.layerCapture.style.bottom = "auto";
        this.currentMarkTool = ShapeType.SELECT;
        console.log("begin edit");
        this.beginEdit();
        this.refresh();
    }

    // 绘制静态图片（进入编辑模式）
    drawCaptureImage() {
        const { x, y, width, height } = this.captureRect;
        if (!this.inEdit) {
            const dpr = this.dpr;

            let rect = {
                x: x / dpr,
                y: y / dpr,
                width: width / dpr,
                height: height / dpr
            };

            this.layerCapture.width = width;
            this.layerCapture.height = height;
            this.layerCapture.style.width = `${rect.width}px`;
            this.layerCapture.style.height = `${rect.height}px`;
            this.layerCapture.style.position = "fixed";
            this.layerCapture.style.left = `${rect.x}px`;
            this.layerCapture.style.top = `${rect.y}px`;
            this.layerCapture.style.right = "auto";
            this.layerCapture.style.bottom = "auto";

            this.ctxCapture.imageSmoothingEnabled = false;
            this.ctxCapture.webkitImageSmoothingEnabled = false;
            this.ctxCapture.mozImageSmoothingEnabled = false;
            this.ctxCapture.msImageSmoothingEnabled = false;

            this.ctxCapture.drawImage(this.imageDesktop,
                Math.floor(x),
                Math.floor(y),
                Math.floor(width),
                Math.floor(height),
                0, 0,
                Math.floor(width),
                Math.floor(height)
            );
        } else {
            this.ctxCapture.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);

            // 应用变换矩阵
            const [a, b, c, d, e, f] = this.transform.matrix;
            // console.log("matrix: ",a,b,c,d,e,f);
            this.ctxCapture.setTransform(a, b, c, d, e, f);

            this.ctxCapture.imageSmoothingEnabled = false;
            this.ctxCapture.webkitImageSmoothingEnabled = false;
            this.ctxCapture.mozImageSmoothingEnabled = false;
            this.ctxCapture.msImageSmoothingEnabled = false;

            // 绘制截图图像
            this.ctxCapture.drawImage(this.imageDesktop,
                Math.floor(x),
                Math.floor(y),
                Math.floor(width),
                Math.floor(height),
                Math.floor(x),
                Math.floor(y),
                Math.floor(width),
                Math.floor(height),
            );
            // 重置变换
            // this.ctxCapture.setTransform(1, 0, 0, 1, 0, 0);
        }
    }

    _clearLastCaptureRect() {
        const { x, y, width, height } = this.lastCaptureRect;
        const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS;
        this.ctxOffscreen.clearRect(x - radius * 2, y - radius * 2, width + radius * 4, height + radius * 4);
        this.ctxCapture.clearRect(x - radius * 2, y - radius * 2, width + radius * 4, height + radius * 4);
    }

    _drawControlPoints() {
        const { x, y, width, height } = this.captureRect;
        const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS;
        const points = [
            { x, y, cursor: "nwse-resize", state: 3 },
            { x: x + width / 2, y, cursor: "ns-resize", state: 4 },
            { x: x + width, y, cursor: "nesw-resize", state: 5 },
            { x, y: y + height / 2, cursor: "ew-resize", state: 6 },
            { x: x + width, y: y + height / 2, cursor: "ew-resize", state: 7 },
            { x, y: y + height, cursor: "nesw-resize", state: 8 },
            { x: x + width / 2, y: y + height, cursor: "ns-resize", state: 9 },
            { x: x + width, y: y + height, cursor: "nwse-resize", state: 10 },
        ];

        this.ctxOffscreen.fillStyle = "white";
        this.ctxOffscreen.strokeStyle = "rgba(0, 122, 255, 1)";
        this.ctxOffscreen.lineWidth = 2;
        points.forEach((p) => {
            this.ctxOffscreen.beginPath();
            this.ctxOffscreen.arc(p.x, p.y, radius, 0, Math.PI * 2);
            this.ctxOffscreen.fill();
            this.ctxOffscreen.stroke();
        });
    }

    _drawCurrentCaptureRect() {
        if (!this.captureFinish) {
            const { x, y, width, height } = this.captureRect;
            this.ctxOffscreen.strokeStyle = "rgba(0, 122, 255, 1)";
            this.ctxOffscreen.lineWidth = 2;
            this.ctxOffscreen.strokeRect(
                Math.floor(x),
                Math.floor(y),
                Math.floor(width),
                Math.floor(height)
            );
        }
    }

    // 重绘
    refresh() {
        if (!this.inEdit) {
            this._clearLastCaptureRect();
            this._drawCurrentCaptureRect();
            if (this.showCtrlPoints) {
                this._drawControlPoints();
            }
            this.ctxCapture.drawImage(this.canvasOffscreen, 0, 0);

            if (!this.magnifierTimer) {
                this.magnifierTimer = setTimeout(() => {
                    this._updateMagnifierRender();
                    this.magnifierTimer = null;
                }, this.renderThrottleDelay);
            }
            this.lastCaptureRect = { ...this.captureRect };
        } else {
            // 编辑模式下只重绘标注
            this.drawCaptureImage();
            this.markManager.redraw();
        }
    }

    _updateMagnifierRender() {
        const mouseX = this.magnifierBoxCenter.x;
        const mouseY = this.magnifierBoxCenter.y;

        const magnifierSize = 15;
        const pixelSize = 10;
        const totalSize = magnifierSize * pixelSize;

        let magX = mouseX + 20 * this.dpr;
        let magY = mouseY + 20 * this.dpr;
        if (magX + totalSize > this.physicalSize.width) magX = mouseX - totalSize - 20 * this.dpr;
        if (magY + totalSize > this.physicalSize.height) magY = mouseY - totalSize - 20 * this.dpr;
        magX = Math.max(0, magX);
        magY = Math.max(0, magY);
        this.magnifierBoxPos = { x: magX, y: magY };

        this.ctxMagnifierBox.clearRect(0, 0, totalSize, totalSize);

        this.ctxMagnifierBox.drawImage(
            this.layerDesktop,
            mouseX - Math.floor(magnifierSize / 2),
            mouseY - Math.floor(magnifierSize / 2),
            magnifierSize, magnifierSize,
            0, 0,
            totalSize, totalSize
        );

        this.ctxMagnifierBox.strokeStyle = "#ccc";
        this.ctxMagnifierBox.lineWidth = 1;
        this.ctxMagnifierBox.globalAlpha = 0.6;
        this.ctxMagnifierBox.beginPath();
        for (let i = 0; i <= magnifierSize; i++) {
            const pos = i * pixelSize;
            this.ctxMagnifierBox.moveTo(pos, 0);
            this.ctxMagnifierBox.lineTo(pos, totalSize);
            this.ctxMagnifierBox.moveTo(0, pos);
            this.ctxMagnifierBox.lineTo(totalSize, pos);
        }
        this.ctxMagnifierBox.stroke();
        this.ctxMagnifierBox.globalAlpha = 1;

        this.ctxMagnifierBox.strokeStyle = "rgba(0, 122, 255, 1)";
        this.ctxMagnifierBox.lineWidth = pixelSize;
        const center = totalSize / 2;
        this.ctxMagnifierBox.beginPath();
        if (this.captureRect.width <= 10 && this.captureRect.height <= 10) {
            this.ctxMagnifierBox.moveTo(0, center);
            this.ctxMagnifierBox.lineTo(totalSize, center);
            this.ctxMagnifierBox.moveTo(center, 0);
            this.ctxMagnifierBox.lineTo(center, totalSize);
        } else {
            this.ctxMagnifierBox.moveTo(0, center);
            this.ctxMagnifierBox.lineTo(center + pixelSize / 2, center);
            this.ctxMagnifierBox.moveTo(center, 0);
            this.ctxMagnifierBox.lineTo(center, center);
        }
        this.ctxMagnifierBox.stroke();
        this._emit("magnifierNewPos", this._physicalToLogical(magX, magY));
    }

    _emit(eventName, data) {
        if (this.eventListeners?.[eventName]) {
            this.eventListeners[eventName].forEach(cb => cb(data));
        }
    }

    on(eventName, callback) {
        if (!this.eventListeners) this.eventListeners = {};
        if (!this.eventListeners[eventName]) this.eventListeners[eventName] = [];
        this.eventListeners[eventName].push(callback);
    }

    setMarkTool(tool) {
        this.currentMarkTool = tool;
        // 如果切换到选择工具，禁用绘制状态
        if (tool === ShapeType.SELECT) {
            this.drawingState = Screenshot.DrawingState.NO_ACTION;
        }
    }

    getCurrentSelection() {
        const { x, y, width, height } = this.captureRect;
        return {
            x: x / this.dpr,
            y: y / this.dpr,
            width: width / this.dpr,
            height: height / this.dpr
        };
    }

    destroy() {
        // 清理定时器
        if (this.magnifierTimer) {
            clearTimeout(this.magnifierTimer);
            this.magnifierTimer = null;
        }

        // 关闭 ImageBitmap（必须调用 close 释放 GPU 内存）
        if (this.imageDesktop && typeof this.imageDesktop.close === 'function') {
            try {
                // 退出截屏，必须立即释放 GPU 内存,否则会报如下错误
                // [235448:0316/150412.447698:ERROR:shared_image_manager.cc(356)] SharedImageManager::ProduceMemory: Trying to Produce a Memory representation from a non-existent mailbox.        
                this.imageDesktop.close();
            } catch (e) {
                // 忽略错误
            }
            this.imageDesktop = null;
        }

        // 移除事件监听器
        if (this.layerOperation) {
            this.layerOperation.removeEventListener('wheel', this.onWheel);
        }

        // 清理标记管理器
        if (this.markManager && typeof this.markManager.destroy === 'function') {
            this.markManager.destroy();
        }

        // 清空关键引用
        this.ctxDesktop = null;
        this.ctxCapture = null;
        this.ctxOperation = null;
        this.ctxOffscreen = null;
        this.ctxMagnifierBox = null;

        this.layerDesktop = null;
        this.layerCapture = null;
        this.layerOperation = null;
        this.layerMagnifierBox = null;
        this.canvasOffscreen = null;

        this.markManager = null;
        this.eventListeners = null;
        this.windowList = null;
        this.history = null;
        this.transform = null;
    }
}