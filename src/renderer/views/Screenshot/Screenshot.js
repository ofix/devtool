import MarkManager from "./MarkManager.js"
import { ShapeType } from "./Shapes/ShapeFactory.js";
import ShapeFactory from "./Shapes/ShapeFactory.js";
import TransformMatrix from "./TransformMatrix.js";

export default class Screenshot {
    static DrawingState = Object.freeze({
        NO_ACTION: 0,
        DRAG_CAPTURE_AREA: 1,
        MOVE_CAPTURE_AREA: 2,
        WINDOW_CAPTURE: 3,
        SCROLL_CAPTURE: 4,
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
        // 物理像素单位！
        CONTROL_POINT_RADIUS: 4 * window.devicePixelRatio,
        MAGNIFIER_SIZE: 200 * window.devicePixelRatio,
        MAGNIFIER_RADIUS: 20 * window.devicePixelRatio,
        TOOLBAR_SIZE: {
            width: (31 * 13) * window.devicePixelRatio,
            height: 50 * window.devicePixelRatio
        },
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

        // DPR仅用于坐标转换，不用于缩放上下文
        this.dpr = window.devicePixelRatio || 1;

        // ========== 全程使用物理尺寸 ==========
        this.physicalSize = {
            width: window.screen.width * this.dpr,
            height: window.screen.height * this.dpr
        };

        this.magnifierTimer = null;
        this.renderThrottleDelay = 16;
        this.captureFinish = false;

        // 核心状态：所有坐标都是物理像素！
        this.markManager = null;
        this.currentMarkTool = ShapeType.NONE;
        this.showCtrlPoints = false;
        this.isMouseDown = false;
        this.drawingState = this._getDrawingState(captureMode);
        this.captureRect = { x: 0, y: 0, width: 0, height: 0 };       // 当前选区
        this.lastCaptureRect = { x: 0, y: 0, width: 0, height: 0 };   // 上一个选区
        this.captureStart = { x: 0, y: 0 };                           // 选区起始坐标
        this.captureRectMoveOffset = { x: 0, y: 0 };                  // 选区移动偏移
        this.magnifierBoxPos = { x: 0, y: 0 };                        // 放大镜起始XY位置
        this.magnifierBoxCenter = { x: 0, y: 0 };                          // 放大镜中心坐标
        this.toolbarPos = { x: 0, y: 0 };                             // 物理坐标
        this.inEdit = false;                                          // 当前是否处于编辑状态

        this.imageDesktop = null; // 桌面背景图
        this.imageCapture = null; // 用户选区图
        this.windowList = [];     // 窗口截图模式下的窗口列表
        this.history = [];        // 撤销和重做历史
        this.historyIndex = -1;   // 当前操作序列
        this.transform = new TransformMatrix(); // 变换矩阵，只在inEdit 模式下起作用
        this.transform.identity();

        this._initLayers();
        // 绑定事件
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    // ========== 初始化Canvas：纯物理尺寸 ==========
    _initLayers() {
        // 所有Canvas仅设置物理尺寸，不设置CSS尺寸（Electron全屏窗口中，Canvas会自动填满）
        this.layerDesktop.width = this.physicalSize.width;
        this.layerDesktop.height = this.physicalSize.height;
        this.layerCapture.width = this.physicalSize.width;
        this.layerCapture.height = this.physicalSize.height;
        this.layerOperation.width = this.physicalSize.width;
        this.layerOperation.height = this.physicalSize.height;
        this.canvasOffscreen.width = this.physicalSize.width;
        this.canvasOffscreen.height = this.physicalSize.height;
        // 放大镜Canvas（纯物理尺寸）
        if (this.layerMagnifierBox) {
            this.layerMagnifierBox.width = Screenshot.CONFIG.MAGNIFIER_SIZE;
            this.layerMagnifierBox.height = Screenshot.CONFIG.MAGNIFIER_SIZE;
            this.ctxMagnifierBox.imageSmoothingEnabled = false;
        }

        // 清空画布（物理坐标）
        this.ctxOffscreen.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);
        this.ctxCapture.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);
        this.ctxOperation.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);

        // 初始化标注管理器（传递物理尺寸）
        this.markManager = new MarkManager(
            this.layerOperation,
            this.canvasOffscreen,
            this.physicalSize // 标注也用物理像素绘制
        );
    }

    async init(buffer) {
        const dpr = window.devicePixelRatio || 1;
        this.ctxDesktop.setTransform(1, 0, 0, 1, 0, 0);
        this.ctxDesktop.scale(dpr, dpr);
        // 5. 提升图像绘制质量
        this.ctxDesktop.imageSmoothingEnabled = false;
        this.ctxDesktop.webkitImageSmoothingEnabled = false; // 兼容webkit内核浏览器
        this.ctxDesktop.mozImageSmoothingEnabled = false; // 兼容Firefox
        this.ctxDesktop.msImageSmoothingEnabled = false; // 兼容IE/Edge
        const imageBitmap = await createImageBitmap(new Blob([buffer]), {
            resizeQuality: "pixelated", // 强制像素化缩放，无模糊
        });
        this.ctxDesktop.drawImage(
            imageBitmap,
            0, 0,
            imageBitmap.width,
            imageBitmap.height, // 源区域（原始像素
            0, 0,
            this.physicalSize.width,
            this.physicalSize.height // 物理全屏
        );
        this.imageDesktop = imageBitmap;
    }

    // 保存状态用于撤销
    saveState() {
        // 只保存到当前索引之前
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(this.transform.clone());
        this.historyIndex++;
    }

    // 撤销
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.transform.matrix = [...this.history[this.historyIndex]];
            this.refresh();
        }
    }

    // 重做
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.transform.matrix = [...this.history[this.historyIndex]];
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

        // 将旋转中心转换为图像坐标
        const imagePos = this.transform.inverseTransformPoint(centerX, centerY);

        // 平移到原点 -> 旋转 -> 平移回来
        this.transform.translate(-centerX, -centerY);
        this.transform.rotate(angle);
        this.transform.translate(centerX, centerY);

        this.refresh();
    }

    // 逻辑坐标 → 物理坐标
    _logicalToPhysical(logicalX, logicalY) {
        return {
            x: Math.floor(logicalX * this.dpr), // 取整避免亚像素绘制
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

    // 物理坐标 → 逻辑坐标（仅用于对外输出）
    _physicalToLogical(physicalX, physicalY) {
        return {
            x: physicalX / this.dpr,
            y: physicalY / this.dpr
        };
    }

    getMarkManager() {
        return this.markManager;
    }

    // 返回逻辑坐标
    getCaptureRect() {
        return {
            x: this.captureRect.x / this.dpr,
            y: this.captureRect.y / this.dpr,
            width: this.captureRect.width / this.dpr,
            height: this.captureRect.height / this.dpr
        };
    }

    // 截图动画完成，进入编辑模式(各种标注)
    beginEdit() {
        this.inEdit = true;
    }

    setWindowList(windowList) {
        this.windowList = windowList;
    }

    /**
     * 判断鼠标是否在指定窗口的矩形区域内
     * @param {Object} window - 窗口对象（包含x/y/width/height）
     * @param {Object} mousePos - 鼠标坐标 {x, y}
     * @returns {Boolean}
     */
    isMouseInWindow(window, mousePos) {
        const { x, y, width, height } = window;
        return (
            mousePos.x >= x &&
            mousePos.x <= x + width &&
            mousePos.y >= y &&
            mousePos.y <= y + height
        );
    }

    /**
     * 快速获取鼠标当前所在的窗口
     * @returns {Object|null} 鼠标所在的窗口对象，无则返回null
     */
    getMouseHoverWindow(mousePos) {
        if (!this.windowList.length) {
            console.warn('窗口列表为空，无法判断鼠标所在窗口');
            return null;
        }

        // 筛选出包含鼠标坐标的所有窗口
        const candidateWindows = this.windowList.filter(window =>
            this.isMouseInWindow(window, mousePos)
        );

        if (!candidateWindows.length) {
            return null; // 鼠标不在任何窗口内（如桌面区域）
        }

        // 按 zOrder 降序排序（zOrder 越大，窗口层级越高）
        candidateWindows.sort((a, b) => b.zOrder - a.zOrder);

        // 返回最顶层的窗口（即鼠标实际所在的窗口）
        return candidateWindows[0];
    }

    // 鼠标按下事件
    onMouseDown(e) {
        this.isMouseDown = true;
        // 鼠标clientX/Y是逻辑坐标 → 转物理坐标
        const physicalPos = this._logicalToPhysical(e.clientX, e.clientY);
        const mouseX = physicalPos.x;
        const mouseY = physicalPos.y;

        if (this.currentMarkTool === ShapeType.SELECT) {
            return;
        } else if (this.currentMarkTool !== ShapeType.NONE) {
            const key = `DRAW_${ShapeFactory.typeToStr(this.currentMarkTool).toUpperCase()}`;
            this.drawingState = Screenshot.DrawingState[key] || Screenshot.DrawingState.NO_ACTION;
            // 标注也传递物理坐标
            this.markManager.startDrawing(this.currentMarkTool, mouseX, mouseY);
            return;
        }

        // 选区模式（全程物理坐标）
        if (this.drawingState == Screenshot.DrawingState.DRAG_CAPTURE_AREA) { // 物理像素的最小宽度
            this.captureStart = { x: mouseX, y: mouseY };
            this.captureRect = { x: mouseX, y: mouseY, width: 0, height: 0 };
        } else if (this.drawingState == Screenshot.DrawingState.WINDOW_CAPTURE) {
            // 检查当前鼠标所在方块
            if (this.captureWindow == null) {
                this.captureWindow = this.captureRect;
            }
        } else {
            // const controlPoint = this._isInControlPoint(mouseX, mouseY);
            // if (controlPoint) {
            //     this.drawingState = controlPoint.state;
            //     this.layerOperation.style.cursor = controlPoint.cursor;
            // }

            // 情形1 没有选区（用户开始拖拽选区）
            // 情形2 选区已经存在
            if (this._isInsideSelection(mouseX, mouseY)) {
                this.drawingState = Screenshot.DrawingState.MOVE_CAPTURE_AREA;
                this.layerOperation.style.cursor = "move";
                // 物理坐标计算偏移
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

    onMouseMove(e) {
        // 逻辑坐标转物理坐标
        const physicalPos = this._logicalToPhysical(e.clientX, e.clientY);
        const mouseX = physicalPos.x;
        const mouseY = physicalPos.y;

        if (!this.isMouseDown) {
            // 非拖动时检测控制点
            if (this.drawingState === Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
                this.magnifierBoxCenter.x = mouseX;
                this.magnifierBoxCenter.y = mouseY;
                // const controlPoint = this._isInControlPoint(mouseX, mouseY);
                // this.layerOperation.style.cursor = controlPoint
                //     ? controlPoint.cursor
                //     : (this._isInsideSelection(mouseX, mouseY) ? "move" : "crosshair");
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
        } else {
            // 鼠标按下时的逻辑（物理坐标）
            if (this.drawingState >= Screenshot.DrawingState.DRAW_LINE) {
                // 标注绘制（物理坐标）
                this.markManager.updateDrawing(mouseX, mouseY);
            } else {
                // 选区操作（纯物理坐标）
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

    onMouseUp(e) {
        if (this.isMouseDown) {
            this._emit("showMagnifier", false);
            clearTimeout(this.magnifierTimer);
        }

        if (this.drawingState >= Screenshot.DrawingState.DRAW_LINE) { // 标注完成
            this.markManager.finishDrawing();
            this.drawingState = Screenshot.DrawingState.NO_ACTION;
        }

        /*开始标注 */
        if (this.drawingState >= 11 && this.drawingState <= 20) {
            this.refresh();
        }
        // 绘制完成，需要修改选区cavnas的宽高、
        // 原因：transform 不会触发重排，动画更流畅，且和之前的居中动画兼容
        if (this.isMouseDown) {
            this.isMouseDown = false;
            this.layerOperation.style.cursor = "arrow";
            if (this.drawingState == Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
                this.drawCaptureImage();
                this.captureFinish = true;
                this.refresh(e);
                this._emit("CaptureFinish", true);
                this.drawingState = Screenshot.DrawingState.NO_ACTION;
            }
        }
    }

    onMouseLeave() {
        // this.isMouseDown = false;
        window.channel.debug("mouse leave");
    }

    onKeyDown(e) {
        if (e.key === "Escape") {
            this.destroy();
            window.channel.cancelScreenshot();
        } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            const step = 1; // 按1物理像素移动
            this._handleArrowKey(e.key, step);
        }
    }

    _handleArrowKey(key, step) {
        this._updateSelection(key, step);
        this._updateMagnifier(key, step);
        this.refresh({ clientX: this.captureRect.x / this.dpr, clientY: this.captureRect.y / this.dpr });
    }

    _updateMagnifier(direction, step) {
        const magnifierSize = 11 * this.dpr; // 物理像素
        const pixelSize = 10 * this.dpr;     // 物理像素
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
        // 对外输出时转逻辑坐标
        this._emit("magnifierNewPos", this._physicalToLogical(x, y));
    }

    _updateSelection(direction, step) {
        const selection = this.captureRect;
        const maxX = this.physicalSize.width;
        const maxY = this.physicalSize.height;

        // 它们已经是计算后的矩形左上角坐标
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

        // 这样就能支持双向增长
        const newStartX = Math.min(selection.x, endX);
        const newStartY = Math.min(selection.y, endY);
        const newEndX = Math.max(selection.x, endX);
        const newEndY = Math.max(selection.y, endY);
        // 计算宽度和高度
        const width = Math.abs(newEndX - newStartX);
        const height = Math.abs(newEndY - newStartY);

        // 更新选择区域
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
        this.refresh(e);
    }

    // ========== 移动选区：纯物理坐标边界检查 ==========
    _moveCaptureRect(mouseX, mouseY) {
        const { width, height } = this.captureRect;
        const { x: offsetX, y: offsetY } = this.captureRectMoveOffset;

        // 物理坐标计算新位置
        let newX = mouseX - offsetX;
        let newY = mouseY - offsetY;

        // 物理边界检查（不超出屏幕物理尺寸）
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

        // 修正负尺寸（物理像素）
        if (newSelection.width < 0) {
            newSelection.x += newSelection.width;
            newSelection.width = Math.abs(newSelection.width);
        }
        if (newSelection.height < 0) {
            newSelection.y += newSelection.height;
            newSelection.height = Math.abs(newSelection.height);
        }

        // 物理边界检查
        newSelection.x = Math.max(0, newSelection.x);
        newSelection.y = Math.max(0, newSelection.y);
        newSelection.width = Math.min(newSelection.width, this.physicalSize.width - newSelection.x);
        newSelection.height = Math.min(newSelection.height, this.physicalSize.height - newSelection.y);

        this.captureRect = newSelection;
    }

    // ========== 检测控制点：纯物理像素 ==========
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

    // ========== 检测选区内部：纯物理像素 ==========
    _isInsideSelection(mouseX, mouseY) {
        const { x, y, width, height } = this.captureRect;
        return mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height;
    }

    // ========== 计算工具栏位置：纯物理像素 ==========
    _calculateToolbarPos() {
        const { x, y, width, height } = this.captureRect;
        const { width: tbW, height: tbH } = Screenshot.CONFIG.TOOLBAR_SIZE;

        let tbX = x + width - tbW;
        let tbY = y + height + 10 * this.dpr; // 物理像素间距

        // 物理边界检查
        tbX = Math.max(0, Math.min(tbX, this.physicalSize.width - tbW));
        tbY = Math.max(0, Math.min(tbY, this.physicalSize.height - tbH));

        this.toolbarPos = { x: tbX, y: tbY };
        // 对外输出转逻辑坐标
        this._emit("toolbarPosChange", this._physicalToLogical(tbX, tbY));
    }

    // 绘制静态图片
    drawCaptureImage() {
        if (!this.inEdit) {
            // 截图完成CSS3动画，需要调整layerCapture 的大小和起始位置
            const { x, y, width, height } = this.captureRect;
            const dpr = this.dpr;
            // 保存选框的逻辑坐标（供动画使用）
            let rect = {
                x: x / dpr, // 选框左上角X（逻辑坐标）
                y: y / dpr, // 选框左上角Y（逻辑坐标）
                width: width / dpr, // 选框宽度（逻辑坐标）
                height: height / dpr // 选框高度（逻辑坐标）
            };

            // 设置 canvas 绘图缓冲区尺寸（物理像素）
            this.layerCapture.width = width;
            this.layerCapture.height = height;
            // 设置 CSS 显示尺寸（逻辑像素，保证视觉大小正确）
            this.layerCapture.style.width = `${rect.width}px`;
            this.layerCapture.style.height = `${rect.height}px`;
            // 定位到选框位置（绝对定位）
            this.layerCapture.style.position = "fixed";
            this.layerCapture.style.left = `${rect.x}px`;
            this.layerCapture.style.top = `${rect.y}px`;
            this.layerCapture.style.right = "auto";
            this.layerCapture.style.bottom = "auto";

            this.ctxCapture.imageSmoothingEnabled = false;
            this.ctxCapture.webkitImageSmoothingEnabled = false; // 兼容webkit内核浏览器
            this.ctxCapture.mozImageSmoothingEnabled = false; // 兼容Firefox
            this.ctxCapture.msImageSmoothingEnabled = false; // 兼容IE/Edge
            this.ctxCapture.drawImage(this.imageDesktop,
                Math.floor(x),
                Math.floor(y),
                Math.floor(width),
                Math.floor(height),
                0, 0,
                Math.floor(width),
                Math.floor(height)
            )
        } else {

        }
    }

    // 清除上一次选区：纯物理像素
    _clearLastCaptureRect() {
        const { x, y, width, height } = this.lastCaptureRect;
        const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS;
        this.ctxOffscreen.clearRect(x - radius * 2, y - radius * 2, width + radius * 4, height + radius * 4);
    }

    // 绘制控制点：纯物理像素
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
        this.ctxOffscreen.lineWidth = 2; // 物理像素线宽
        points.forEach((p) => {
            this.ctxOffscreen.beginPath();
            this.ctxOffscreen.arc(p.x, p.y, radius, 0, Math.PI * 2);
            this.ctxOffscreen.fill();
            this.ctxOffscreen.stroke();
        });
    }

    // 绘制选区：纯物理像素
    _drawCurrentCaptureRect() {
        if (!this.captureFinish) {
            const { x, y, width, height } = this.captureRect;
            this.ctxOffscreen.strokeStyle = "rgba(0, 122, 255, 1)";
            this.ctxOffscreen.lineWidth = 2; // 物理像素线宽
            // 物理坐标绘制，取整避免亚像素模糊
            this.ctxOffscreen.strokeRect(
                Math.floor(x),
                Math.floor(y),
                Math.floor(width),
                Math.floor(height)
            );
        }
    }

    // ========== 重绘：纯物理像素 ==========
    refresh() {
        if (!this.inEdit) {
            // 清除上一次选区
            this._clearLastCaptureRect();
            // 绘制当前选区
            this._drawCurrentCaptureRect();
            // 绘制标注
            this.markManager.redraw();
            // 选区拖拽控制点
            if (this.showCtrlPoints) {
                this._drawControlPoints();
            }
            // 刷新画布（物理坐标）
            this.ctxOperation.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);
            this.ctxOperation.drawImage(this.canvasOffscreen, 0, 0);

            // 更新放大镜（仅在非拖拽状态下执行，减少开销）
            if (!this.isDragging && !this.magnifierTimer) {
                this.magnifierTimer = setTimeout(() => {
                    this._updateMagnifierRender();
                    this.magnifierTimer = null;
                }, this.renderThrottleDelay);
            }
            // 记录上一次选区
            this.lastCaptureRect = { ...this.captureRect };
        }

    }

    _updateMagnifierRender() {
        // 逻辑坐标转物理坐标
        const mouseX = this.magnifierBoxCenter.x;
        const mouseY = this.magnifierBoxCenter.y;

        const magnifierSize = 15; // 物理像素
        const pixelSize = 10;     // 物理像素
        const totalSize = magnifierSize * pixelSize;

        // 计算放大镜物理位置
        let magX = mouseX + 20 * this.dpr;
        let magY = mouseY + 20 * this.dpr;
        if (magX + totalSize > this.physicalSize.width) magX = mouseX - totalSize - 20 * this.dpr;
        if (magY + totalSize > this.physicalSize.height) magY = mouseY - totalSize - 20 * this.dpr;
        magX = Math.max(0, magX);
        magY = Math.max(0, magY);
        this.magnifierBoxPos = { x: magX, y: magY };

        // 清空放大镜（物理坐标）
        this.ctxMagnifierBox.clearRect(0, 0, totalSize, totalSize);

        // 绘制放大区域（纯物理像素）
        this.ctxMagnifierBox.drawImage(
            this.layerDesktop,
            mouseX - Math.floor(magnifierSize / 2),
            mouseY - Math.floor(magnifierSize / 2),
            magnifierSize, magnifierSize,
            0, 0,
            totalSize, totalSize
        );

        // 绘制网格（物理像素）
        this.ctxMagnifierBox.strokeStyle = "#ccc";
        this.ctxMagnifierBox.lineWidth = 1; // 物理像素
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

        // 绘制中心十字线（物理像素）
        this.ctxMagnifierBox.strokeStyle = "rgba(0, 122, 255, 1)";
        this.ctxMagnifierBox.lineWidth = pixelSize; // 物理像素
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
        // 对外输出逻辑坐标
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
    }

    // 对外暴露的选区信息：转成逻辑坐标
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
        this.state = null;
        this.eventListeners = null;
        this.ctxDesktop = this.ctxOperation = this.ctxOffscreen = this.ctxMagnifierBox = null;
    }
}