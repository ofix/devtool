import MarkManager from "./MarkManager.js"
import PerformanceMonitor from "../../common/PerformanceMonitor.js";
import { ShapeType } from "./Shapes/ShapeFactory.js";
import ShapeFactory from "./Shapes/ShapeFactory.js";

export default class Screenshot {
    static DrawingState = Object.freeze({
        NO_ACTION: 0,
        DRAG_CAPTURE_AREA: 1,
        MOVE_CAPTURE_AREA: 2,
        DRAG_CAPTURE_CORNER_TOP_LEFT: 3,
        DRAG_CAPTURE_CORNER_TOP_CENTER: 4,
        DRAG_CAPTURE_CORNER_TOP_RIGHT: 5,
        DRAG_CAPTURE_CORNER_LEFT_CENTER: 6,
        DRAG_CAPTURE_CORNER_RIGHT_CENTER: 7,
        DRAG_CAPTURE_CORNER_BOTTOM_LEFT: 8,
        DRAG_CAPTURE_BOTTOM_CENTER: 9,
        DRAG_CAPTURE_BOTTOM_RIGHT: 10,
        DRAW_LINE: 11,
        DRAW_ARROW: 12,
        DRAW_RECT: 13,
        DRAW_ELLIPSE: 14,
        DRAW_STAR: 15,
        DRAW_NUMBER: 16,
        DRAW_PENCIL: 17,
        DRAW_HILIGHTER: 18,
        DRAW_ERASER: 19,
        DRAW_MOSAIC: 20,
        DRAW_GAUSSIAN_BLUR: 21,
        MOVE_SHAPE: 30,
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

    constructor(canvasScreen, canvasCapture, canvasMagnifier) {
        // DOM 元素
        this.canvasBg = canvasScreen;
        this.canvasCapture = canvasCapture;
        this.canvasMagnifier = canvasMagnifier;

        // Canvas 上下文（不调用scale，纯物理绘制）
        this.ctxBg = this.canvasBg?.getContext("2d");
        this.ctxCapture = this.canvasCapture?.getContext("2d");
        this.ctxMagnifier = this.canvasMagnifier?.getContext("2d");

        // 离屏 Canvas（纯物理尺寸）
        this.canvasOffscreen = document.createElement("canvas");
        this.ctxOffscreen = this.canvasOffscreen.getContext("2d");

        this.perf = new PerformanceMonitor();
        // 核心：DPR仅用于坐标转换，不用于缩放上下文
        this.dpr = window.devicePixelRatio || 1;

        // ========== 全程使用物理尺寸 ==========
        this.physicalSize = {
            width: window.screen.width * this.dpr,
            height: window.screen.height * this.dpr
        };

        this.magnifierTimer = null;
        this.renderThrottleDelay = 16;

        // 核心状态：所有坐标都是物理像素！
        this.state = {
            isMouseDown: false,
            drawingState: Screenshot.DrawingState.NO_ACTION,
            currentSelection: { x: 0, y: 0, width: 0, height: 0 },  // 物理坐标
            lastSelection: { x: 0, y: 0, width: 0, height: 0 },     // 物理坐标
            startPos: { x: 0, y: 0 },                               // 物理坐标
            initialMoveOffset: { x: 0, y: 0 },                      // 物理坐标
            magnifierPos: { x: 0, y: 0 },                           // 物理坐标
            toolbarPos: { x: 0, y: 0 },                             // 物理坐标
            currentMarkTool: ShapeType.NONE,
            markManager: null,
            showCtrlPoints: false,
        };
        this.screenImage = null;

        // 初始化
        this._initCanvas();
        // 绑定事件
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    // ========== 逻辑坐标 → 物理坐标（核心转换） ==========
    _logicalToPhysical(logicalX, logicalY) {
        return {
            x: Math.floor(logicalX * this.dpr), // 取整避免亚像素绘制
            y: Math.floor(logicalY * this.dpr)
        };
    }

    // ========== 物理坐标 → 逻辑坐标（仅用于对外输出） ==========
    _physicalToLogical(physicalX, physicalY) {
        return {
            x: physicalX / this.dpr,
            y: physicalY / this.dpr
        };
    }

    // ========== 初始化Canvas：纯物理尺寸 ==========
    _initCanvas() {
        // 所有Canvas仅设置物理尺寸，不设置CSS尺寸（Electron全屏窗口中，Canvas会自动填满）
        this.canvasBg.width = this.physicalSize.width;
        this.canvasBg.height = this.physicalSize.height;
        this.canvasCapture.width = this.physicalSize.width;
        this.canvasCapture.height = this.physicalSize.height;
        this.canvasOffscreen.width = this.physicalSize.width;
        this.canvasOffscreen.height = this.physicalSize.height;

        // 放大镜Canvas（纯物理尺寸）
        if (this.canvasMagnifier) {
            this.canvasMagnifier.width = Screenshot.CONFIG.MAGNIFIER_SIZE;
            this.canvasMagnifier.height = Screenshot.CONFIG.MAGNIFIER_SIZE;
            // 放大镜不scale，直接物理绘制
            this.ctxMagnifier.imageSmoothingEnabled = false;
        }

        // 清空画布（物理坐标）
        this.ctxOffscreen.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);
        this.ctxCapture.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);

        // 初始化标注管理器（传递物理尺寸）
        this.state.markManager = new MarkManager(
            this.canvasCapture,
            this.canvasOffscreen,
            this.physicalSize // 标注也用物理像素绘制
        );
    }

    _base64ToImage(base64Str) {
        return new Promise((resolve, reject) => {
            if (!base64Str || !base64Str.startsWith('data:image/')) {
                reject(new Error('无效的 Base64 图片字符串'));
                return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(new Error(`图片加载失败：${err.message}`));
            img.src = base64Str;
        });
    }

    async init(base64Image) {
        try {
            this.screenImage = await this._base64ToImage(base64Image);
            // 绘制背景图：物理坐标（全屏绘制）
            this.ctxBg.drawImage(
                this.screenImage,
                0, 0, this.screenImage.width, this.screenImage.height, // 图片原始尺寸
                0, 0, this.physicalSize.width, this.physicalSize.height // 物理全屏
            );
        } catch (e) {
            console.log(e);
        }
    }

    // ========== 鼠标按下事件 ==========
    onMouseDown(e) {
        this.state.isMouseDown = true;
        // 鼠标clientX/Y是逻辑坐标 → 转物理坐标
        const physicalPos = this._logicalToPhysical(e.clientX, e.clientY);
        const mouseX = physicalPos.x;
        const mouseY = physicalPos.y;

        if (this.state.currentMarkTool === ShapeType.SELECT) {
            return;
        } else if (this.state.currentMarkTool !== ShapeType.NONE) {
            const key = `DRAW_${ShapeFactory.typeToStr(this.state.currentMarkTool).toUpperCase()}`;
            this.state.drawingState = Screenshot.DrawingState[key] || Screenshot.DrawingState.NO_ACTION;
            // 标注也传递物理坐标
            this.state.markManager.startDrawing(this.state.currentMarkTool, mouseX, mouseY);
            return;
        }

        // 选区模式（全程物理坐标）
        if (this.state.currentSelection.width < 1) { // 物理像素的最小宽度
            this.state.drawingState = Screenshot.DrawingState.DRAG_CAPTURE_AREA;
            this.state.startPos = { x: mouseX, y: mouseY };
            this.state.currentSelection = { x: mouseX, y: mouseY, width: 0, height: 0 };
            this.state.showCtrlPoints = false;
        } else {
            const controlPoint = this._isInControlPoint(mouseX, mouseY);
            if (controlPoint) {
                this.state.drawingState = controlPoint.state;
                this.canvasCapture.style.cursor = controlPoint.cursor;
            } else if (this._isInsideSelection(mouseX, mouseY)) {
                this.state.drawingState = Screenshot.DrawingState.MOVE_CAPTURE_AREA;
                this.canvasCapture.style.cursor = "move";
                // 物理坐标计算偏移
                this.state.initialMoveOffset = {
                    x: mouseX - this.state.currentSelection.x,
                    y: mouseY - this.state.currentSelection.y,
                };
            } else {
                this.state.drawingState = Screenshot.DrawingState.DRAG_CAPTURE_AREA;
                this.state.startPos = { x: mouseX, y: mouseY };
                this.state.currentSelection = { x: mouseX, y: mouseY, width: 0, height: 0 };
                this.state.showCtrlPoints = false;
            }
        }
    }

    onMouseMove(e) {
        // 逻辑坐标转物理坐标
        const physicalPos = this._logicalToPhysical(e.clientX, e.clientY);
        const mouseX = physicalPos.x;
        const mouseY = physicalPos.y;

        if (!this.state.isMouseDown) {
            // 非拖动时检测控制点（物理坐标）
            const controlPoint = this._isInControlPoint(mouseX, mouseY);
            this.canvasCapture.style.cursor = controlPoint
                ? controlPoint.cursor
                : (this._isInsideSelection(mouseX, mouseY) ? "move" : "crosshair");
        } else {
            // 鼠标按下时的逻辑（物理坐标）
            if (this.state.drawingState >= 11) {
                // 标注绘制（物理坐标）
                this.state.markManager.updateDrawing(mouseX, mouseY);
            } else {
                // 选区操作（纯物理坐标）
                if (this.state.drawingState === Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
                    this.state.currentSelection = {
                        x: Math.min(this.state.startPos.x, mouseX),
                        y: Math.min(this.state.startPos.y, mouseY),
                        width: Math.abs(mouseX - this.state.startPos.x),
                        height: Math.abs(mouseY - this.state.startPos.y),
                    };
                } else if (this.state.drawingState >= 3 && this.state.drawingState <= 10) {
                    this._adjustSelection(mouseX, mouseY);
                } else {
                    this._moveSelection(mouseX, mouseY);
                }
                this._emit("showToolbar", false);
            }
        }
        this.refresh(e);
    }

    onMouseUp(e) {
        if (this.state.isMouseDown) {
            this._emit("showMagnifier", false);
            clearTimeout(this.magnifierTimer);
        }
        this.state.isMouseDown = false;
        this.canvasCapture.style.cursor = "crosshair";

        if (this.state.drawingState >= 11) {
            this.state.markManager.finishDrawing();
            this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
            return;
        }

        if (this.state.drawingState === Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
            this._calculateToolbarPos();
            this.state.showCtrlPoints = true;
            this.refresh(e);
        }
        this._emit("showToolbar", true);
        this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
    }

    onMouseLeave() {
        wnd.log("mouse leave");
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
        this.refresh({ clientX: this.state.currentSelection.x / this.dpr, clientY: this.state.currentSelection.y / this.dpr });
    }

    _updateMagnifier(direction, step) {
        const magnifierSize = 11 * this.dpr; // 物理像素
        const pixelSize = 10 * this.dpr;     // 物理像素
        const totalMagnifierSize = magnifierSize * pixelSize;
        const maxX = this.physicalSize.width - totalMagnifierSize;
        const maxY = this.physicalSize.height - totalMagnifierSize;

        let { x, y } = this.state.magnifierPos;
        switch (direction) {
            case "ArrowUp": y = Math.max(0, y - step); break;
            case "ArrowDown": y = Math.min(maxY, y + step); break;
            case "ArrowLeft": x = Math.max(0, x - step); break;
            case "ArrowRight": x = Math.min(maxX, x + step); break;
        }
        this.state.magnifierPos = { x, y };
        // 对外输出时转逻辑坐标
        this._emit("magnifierNewPos", this._physicalToLogical(x, y));
    }

    _updateSelection(direction, step) {
        const selection = this.state.currentSelection;
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
        this.state.currentSelection = {
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
    _moveSelection(mouseX, mouseY) {
        const { width, height } = this.state.currentSelection;
        const { x: offsetX, y: offsetY } = this.state.initialMoveOffset;

        // 物理坐标计算新位置
        let newX = mouseX - offsetX;
        let newY = mouseY - offsetY;

        // 物理边界检查（不超出屏幕物理尺寸）
        newX = Math.max(0, Math.min(newX, this.physicalSize.width - width));
        newY = Math.max(0, Math.min(newY, this.physicalSize.height - height));

        this.state.currentSelection.x = newX;
        this.state.currentSelection.y = newY;
    }

    _adjustSelection(mouseX, mouseY) {
        const { x, y, width, height } = this.state.currentSelection;
        const newSelection = { x, y, width, height };

        switch (this.state.drawingState) {
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

        this.state.currentSelection = newSelection;
    }

    // ========== 绘制控制点：纯物理像素 ==========
    _drawControlPoints() {
        const { x, y, width, height } = this.state.currentSelection;
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

    // ========== 检测控制点：纯物理像素 ==========
    _isInControlPoint(mouseX, mouseY) {
        const { x, y, width, height } = this.state.currentSelection;
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
        const { x, y, width, height } = this.state.currentSelection;
        return mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height;
    }

    // ========== 计算工具栏位置：纯物理像素 ==========
    _calculateToolbarPos() {
        const { x, y, width, height } = this.state.currentSelection;
        const { width: tbW, height: tbH } = Screenshot.CONFIG.TOOLBAR_SIZE;

        let tbX = x + width - tbW;
        let tbY = y + height + 10 * this.dpr; // 物理像素间距

        // 物理边界检查
        tbX = Math.max(0, Math.min(tbX, this.physicalSize.width - tbW));
        tbY = Math.max(0, Math.min(tbY, this.physicalSize.height - tbH));

        this.state.toolbarPos = { x: tbX, y: tbY };
        // 对外输出转逻辑坐标
        this._emit("toolbarPosChange", this._physicalToLogical(tbX, tbY));
    }

    // ========== 清除上一次选区：纯物理像素 ==========
    _clearLastSelection() {
        const { x, y, width, height } = this.state.lastSelection;
        const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS;
        this.ctxOffscreen.clearRect(x - radius, y - radius, width + radius * 2, height + radius * 2);
    }

    // ========== 绘制选区：纯物理像素 ==========
    _drawCurrentSelection() {
        const { x, y, width, height } = this.state.currentSelection;

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

    // ========== 重绘：纯物理像素 ==========
    refresh(e) {

        // 清除上一次选区
        this._clearLastSelection();
        // 绘制当前选区
        this._drawCurrentSelection();
        // 绘制标注和控制点
        this.state.markManager.redraw();
        if (this.state.showCtrlPoints) this._drawControlPoints();
        // 刷新主画布（物理坐标）
        this.ctxCapture.clearRect(0, 0, this.physicalSize.width, this.physicalSize.height);
        this.ctxCapture.drawImage(this.canvasOffscreen, 0, 0);

        // 更新放大镜
        if (!this.magnifierTimer && e) {
            this.magnifierTimer = setTimeout(() => {
                this._updateMagnifierRender(e);
                this.magnifierTimer = null;
            }, this.renderThrottleDelay);
        }
        // 记录上一次选区
        this.state.lastSelection = { ...this.state.currentSelection };
    }

    _updateMagnifierRender(e) {
        // 逻辑坐标转物理坐标
        const physicalPos = this._logicalToPhysical(e.clientX, e.clientY);
        const mouseX = physicalPos.x;
        const mouseY = physicalPos.y;

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
        this.state.magnifierPos = { x: magX, y: magY };

        // 清空放大镜（物理坐标）
        this.ctxMagnifier.clearRect(0, 0, totalSize, totalSize);

        // 绘制放大区域（纯物理像素）
        this.ctxMagnifier.drawImage(
            this.canvasBg,
            mouseX - Math.floor(magnifierSize / 2),
            mouseY - Math.floor(magnifierSize / 2),
            magnifierSize, magnifierSize,
            0, 0,
            totalSize, totalSize
        );

        // 绘制网格（物理像素）
        this.ctxMagnifier.strokeStyle = "#ccc";
        this.ctxMagnifier.lineWidth = 1; // 物理像素
        this.ctxMagnifier.globalAlpha = 0.6;
        this.ctxMagnifier.beginPath();
        for (let i = 0; i <= magnifierSize; i++) {
            const pos = i * pixelSize;
            this.ctxMagnifier.moveTo(pos, 0);
            this.ctxMagnifier.lineTo(pos, totalSize);
            this.ctxMagnifier.moveTo(0, pos);
            this.ctxMagnifier.lineTo(totalSize, pos);
        }
        this.ctxMagnifier.stroke();
        this.ctxMagnifier.globalAlpha = 1;

        // 绘制中心十字线（物理像素）
        this.ctxMagnifier.strokeStyle = "rgba(0, 122, 255, 1)";
        this.ctxMagnifier.lineWidth = pixelSize; // 物理像素
        const center = totalSize / 2;
        this.ctxMagnifier.beginPath();
        this.ctxMagnifier.moveTo(0, center);
        this.ctxMagnifier.lineTo(center + pixelSize / 2, center);
        this.ctxMagnifier.moveTo(center, 0);
        this.ctxMagnifier.lineTo(center, center);
        this.ctxMagnifier.stroke();

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
        this.state.currentMarkTool = tool;
    }

    // 对外暴露的选区信息：转成逻辑坐标
    getCurrentSelection() {
        const { x, y, width, height } = this.state.currentSelection;
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
        this.ctxBg = this.ctxCapture = this.ctxOffscreen = this.ctxMagnifier = null;
    }
}