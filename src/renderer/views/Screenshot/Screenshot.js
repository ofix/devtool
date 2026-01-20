import MarkManager from "./MarkManager.js"
import PerformanceMonitor from "../../common/PerformanceMonitor.js";

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
        DRAW_RECT: 12,
        DRAW_ARROW: 13,
        DRAW_ELLIPSE: 14,
        DRAW_ERASER: 15,
        DRAW_BLUR_AREA: 16,
        MOVE_SHAPE: 17,
    });

    static CONFIG = {
        CONTROL_POINT_RADIUS: 4,
        MAGNIFIER_SIZE: 200,
        MAGNIFIER_RADIUS: 20,
        TOOLBAR_SIZE: { width: 28 * 12 + 10, height: 60 },
    };

    constructor(canvasScreen, canvasCapture, canvasMagnifier) {
        // DOM 元素
        this.canvasBg = canvasScreen;
        this.canvasCapture = canvasCapture;
        this.canvasMagnifier = canvasMagnifier;
        // Canvas 上下文
        this.ctxBg = this.canvasBg?.getContext("2d");
        this.ctxCapture = this.canvasCapture?.getContext("2d");
        this.ctxMagnifier = this.canvasMagnifier?.getContext("2d");
        // 离屏 Canvas（优化重绘性能）
        this.canvasOffscreen = document.createElement("canvas");
        this.ctxOffscreen = this.canvasOffscreen.getContext("2d");
        this.perf = new PerformanceMonitor();
        // 核心状态
        this.state = {
            isMouseDown: false,
            drawingState: Screenshot.DrawingState.DRAG_CAPTURE_AREA,
            captureStarted: false,
            scaleX: 1,
            scaleY: 1,
            screenSize: { width: window.screen.width, height: window.screen.height },
            currentSelection: { x: 0, y: 0, width: 0, height: 0 },
            lastSelection: { x: 0, y: 0, width: 0, height: 0 },
            startPos: { x: 0, y: 0 },
            initialMoveOffset: { x: 0, y: 0 },
            magnifierPos: { x: 0, y: 0 },
            toolbarPos: { x: 0, y: 0 },
            currentMarkTool: "none",
            markManager: null,
            showCtrlPoints: false, // 修复：挂载到state中
        };

        this.magnifierThrottle = {
            lastUpdate: 0,
            frameCount: 0,
            pendingUpdate: false
        };

        this.screenImage = null;

        // 初始化
        this._initCanvas();
        // 绑定事件
        this.handleMousedown = this.handleMousedown.bind(this);
        this.handleMousemove = this.handleMousemove.bind(this);
        this.handleMouseup = this.handleMouseup.bind(this);
        this.handleMouseleave = this.handleMouseleave.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
    }

    _initCanvas() {
        // 设置 Canvas 尺寸
        this.canvasBg.width = this.state.screenSize.width;
        this.canvasBg.height = this.state.screenSize.height;
        this.canvasCapture.width = this.state.screenSize.width;
        this.canvasCapture.height = this.state.screenSize.height;
        this.canvasOffscreen.width = this.state.screenSize.width;
        this.canvasOffscreen.height = this.state.screenSize.height;

        // 计算缩放比
        const rect = this.canvasCapture.getBoundingClientRect();
        this.state.scaleX = this.state.screenSize.width / rect.width;
        this.state.scaleY = this.state.screenSize.height / rect.height;

        // 初始化画布为透明
        this.ctxOffscreen.clearRect(0, 0, this.canvasOffscreen.width, this.canvasOffscreen.height);
        this.ctxCapture.clearRect(0, 0, this.canvasCapture.width, this.canvasCapture.height);

        // 初始化标注管理器
        this.state.markManager = new MarkManager(
            this.canvasCapture,
            this.canvasOffscreen,
            this.state.screenSize
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
            this.ctxBg.drawImage(this.screenImage, 0, 0);
        } catch (e) {
            wnd.log(e.message);
            console.log(e);
        }
    }

    handleMousedown(e) {
        this.state.isMouseDown = true;
        const { x: mouseX, y: mouseY } = this._getRealMousePos(e);

        // 标注模式
        if (this.state.currentMarkTool !== "none" && this.state.markManager) {
            this.state.drawingState = Screenshot.DrawingState[`DRAW_${this.state.currentMarkTool.toUpperCase()}`] || Screenshot.DrawingState.NO_ACTION;
            this.state.markManager.startDrawing(this.state.currentMarkTool, mouseX, mouseY);
            return;
        }

        // 选区模式
        this.state.captureStarted = true;
        if (this.state.currentSelection.width < 2) {
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
                this.state.initialMoveOffset = {
                    x: mouseX - this.state.currentSelection.x,
                    y: mouseY - this.state.currentSelection.y,
                };
            } else {
                this.state.drawingState = Screenshot.DrawingState.DRAG_CAPTURE_AREA;
                this.state.startPos = { x: mouseX, y: mouseY };
                this.state.currentSelection = { x: mouseX, y: mouseY, width: 0, height: 0 };
            }
        }
    }

    handleMousemove(e) {
        if (!this.state.isMouseDown) {
            const { x: mouseX, y: mouseY } = this._getRealMousePos(e);
            const controlPoint = this._isInControlPoint(mouseX, mouseY);
            this.canvasCapture.style.cursor = controlPoint
                ? controlPoint.cursor
                : (this._isInsideSelection(mouseX, mouseY) ? "move" : "crosshair");
            return;
        }
        const { x: mouseX, y: mouseY } = this._getRealMousePos(e);

        // 标注绘制
        if (this.state.markManager && this.state.drawingState >= 11) {
            this.state.markManager.updateDrawing(mouseX, mouseY);
            return;
        }

        // 选区操作
        if (this.state.captureStarted) {
            if (this.state.drawingState === Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
                this.state.currentSelection = {
                    x: Math.min(this.state.startPos.x, mouseX),
                    y: Math.min(this.state.startPos.y, mouseY),
                    width: Math.abs(mouseX - this.state.startPos.x),
                    height: Math.abs(mouseY - this.state.startPos.y),
                };
            } else if (this.state.drawingState >= 3 && this.state.drawingState <= 10) {
                this._adjustSelection(mouseX, mouseY);
            } else if (this.state.drawingState === Screenshot.DrawingState.MOVE_CAPTURE_AREA) {
                this._moveSelection(mouseX, mouseY);
            }
            this.refresh();
        }
    }

    handleMouseup(e) {
        this.state.isMouseDown = false;
        this._emit("magnifierShow", false);
        this.canvasCapture.style.cursor = "crosshair";

        // 标注结束
        if (this.state.markManager && this.state.drawingState >= 11) {
            this.state.markManager.finishDrawing();
            this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
            return;
        }

        // 选区结束
        if (this.state.captureStarted) {
            this._calculateToolbarPos();
            this.state.captureStarted = false;
            if (this.state.currentSelection.width < 2 || this.state.currentSelection.height < 2) {
                this._emit("toolbarShow", false);
            } else {
                this._emit("toolbarShow", true);
            }
            this.refresh();
            this.state.showCtrlPoints = true; // 修复：改为state中的变量
            this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
        }
    }

    handleMouseleave() {
        this.state.isMouseDown = false;
        this._emit("magnifierShow", false);
        this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
        this.canvasCapture.style.cursor = "crosshair";
    }

    handleKeydown(e) {
        if (e.key === "Escape") {
            console.log("handleKeyDown");
            this.destroy();
            window.channel.cancelScreenshot();
        }
    }

    _getRealMousePos(e) {
        return {
            x: e.clientX * this.state.scaleX,
            y: e.clientY * this.state.scaleY,
        };
    }

    _adjustSelection(mouseX, mouseY) {
        const { x, y, width, height } = this.state.currentSelection;
        const newSelection = { ...this.state.currentSelection };

        switch (this.state.drawingState) {
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_LEFT:
                newSelection.x = mouseX;
                newSelection.y = mouseY;
                newSelection.width = x + width - mouseX;
                newSelection.height = y + height - mouseY;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_RIGHT:
                newSelection.y = mouseY;
                newSelection.width = mouseX - x;
                newSelection.height = y + height - mouseY;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_BOTTOM_LEFT:
                newSelection.x = mouseX;
                newSelection.width = x + width - mouseX;
                newSelection.height = mouseY - y;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_BOTTOM_RIGHT:
                newSelection.width = mouseX - x;
                newSelection.height = mouseY - y;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_CENTER:
                newSelection.y = mouseY;
                newSelection.height = y + height - mouseY;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_BOTTOM_CENTER:
                newSelection.height = mouseY - y;
                break;
            case Screenshot.DrawingState.DRAG_CAPTURE_CORNER_LEFT_CENTER:
                newSelection.x = mouseX;
                newSelection.width = x + width - mouseX;
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

        this.state.currentSelection = newSelection;
    }

    _moveSelection(mouseX, mouseY) {
        const newX = mouseX - this.state.initialMoveOffset.x;
        const newY = mouseY - this.state.initialMoveOffset.y;

        this.state.currentSelection.x = Math.max(
            0,
            Math.min(newX, this.state.screenSize.width - this.state.currentSelection.width)
        );
        this.state.currentSelection.y = Math.max(
            0,
            Math.min(newY, this.state.screenSize.height - this.state.currentSelection.height)
        );
    }

    // 修复：局部清除上一次选区（而非清空整个离屏画布）
    _clearLastSelection() {
        const { x, y, width, height } = this.state.lastSelection;
        if (width > 2 && height > 2) {
            const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS;
            // 清除范围包含控制点，避免残留
            this.ctxOffscreen.clearRect(x - radius, y - radius, width + radius * 2, height + radius * 2);
        }
    }

    _drawCurrentSelection() {
        const { x, y, width, height } = this.state.currentSelection;
        if (width < 2 || height < 2) return;

        // 绘制选区背景
        this.ctxOffscreen.fillStyle = "rgba(0, 122, 255, 0.2)";
        this.ctxOffscreen.fillRect(x, y, width, height);
        // 绘制选区边框（取整避免模糊）
        this.ctxOffscreen.strokeStyle = "rgba(0, 122, 255, 1)";
        this.ctxOffscreen.lineWidth = 2;
        this.ctxOffscreen.strokeRect(
            Math.floor(x),
            Math.floor(y),
            Math.floor(width),
            Math.floor(height)
        );
    }

    // 重绘
    refresh() {
        // 清除离屏画布的上一次选区
        this._clearLastSelection();
        // 绘制当前选区
        this._drawCurrentSelection();
        // 绘制控制点（仅当需要显示时）
        if (this.state.showCtrlPoints) {
            this._drawControlPoints();
        }

        // 清空主画布 + 完整渲染离屏画布到主画布
        this.ctxCapture.clearRect(0, 0, this.canvasCapture.width, this.canvasCapture.height);
        this.ctxCapture.drawImage(this.canvasOffscreen, 0, 0);

        // 记录本次选区为下一次的“上一次选区”
        this.state.lastSelection = { ...this.state.currentSelection };
        this._emit("toolbarPosChange", this.state.toolbarPos);
    }

    _drawControlPoints() {
        const { x, y, width, height } = this.state.currentSelection;
        const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS;
        const points = [
            { x: x, y: y, cursor: "nwse-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_LEFT },
            { x: x + width / 2, y: y, cursor: "ns-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_CENTER },
            { x: x + width, y: y, cursor: "nesw-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_RIGHT },
            { x: x, y: y + height / 2, cursor: "ew-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_LEFT_CENTER },
            { x: x + width, y: y + height / 2, cursor: "ew-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_RIGHT_CENTER },
            { x: x, y: y + height, cursor: "nesw-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_BOTTOM_LEFT },
            { x: x + width / 2, y: y + height, cursor: "ns-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_BOTTOM_CENTER },
            { x: x + width, y: y + height, cursor: "nwse-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_BOTTOM_RIGHT },
        ];

        this.ctxOffscreen.fillStyle = "white";
        this.ctxOffscreen.strokeStyle = "rgba(0, 122, 255, 1)";
        this.ctxOffscreen.lineWidth = 1;

        points.forEach((point) => {
            this.ctxOffscreen.beginPath();
            this.ctxOffscreen.arc(point.x, point.y, radius, 0, Math.PI * 2);
            this.ctxOffscreen.fill();
            this.ctxOffscreen.stroke();
        });
    }

    _isInControlPoint(mouseX, mouseY) {
        const { x, y, width, height } = this.state.currentSelection;
        const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS + 2;
        const points = [
            { x: x, y: y, cursor: "nwse-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_LEFT },
            { x: x + width / 2, y: y, cursor: "ns-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_CENTER },
            { x: x + width, y: y, cursor: "nesw-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_TOP_RIGHT },
            { x: x, y: y + height / 2, cursor: "ew-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_LEFT_CENTER },
            { x: x + width, y: y + height / 2, cursor: "ew-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_RIGHT_CENTER },
            { x: x, y: y + height, cursor: "nesw-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_CORNER_BOTTOM_LEFT },
            { x: x + width / 2, y: y + height, cursor: "ns-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_BOTTOM_CENTER },
            { x: x + width, y: y + height, cursor: "nwse-resize", state: Screenshot.DrawingState.DRAG_CAPTURE_BOTTOM_RIGHT },
        ];

        for (const point of points) {
            const dx = mouseX - point.x;
            const dy = mouseY - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= radius) {
                return point;
            }
        }
        return null;
    }

    _isInsideSelection(mouseX, mouseY) {
        const { x, y, width, height } = this.state.currentSelection;
        return mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height;
    }

    _calculateToolbarPos() {
        const { x, y, width, height } = this.state.currentSelection;
        const { TOOLBAR_SIZE } = Screenshot.CONFIG;
        const finalX = Math.max(
            0,
            x * this.state.scaleX + width * this.state.scaleX - TOOLBAR_SIZE.width
        );
        const finalY = Math.max(
            0,
            y * this.state.scaleY + height * this.state.scaleY + 10
        );
        this.state.toolbarPos = { x: finalX, y: finalY };
    }

    _updateMagnifier(e) {
        this.magnifierThrottle.frameCount++;
        if (this.magnifierThrottle.frameCount % 3 !== 0) {
            return;
        }

        const now = Date.now();
        if (now - this.magnifierThrottle.lastUpdate < 30) {
            return;
        }
        this.perf.start("updateMagnifier");
        this.magnifierThrottle.lastUpdate = now;

        const mouseX = e.clientX * this.state.scaleX;
        const mouseY = e.clientY * this.state.scaleY;
        const magnifierSize = 100;
        const magnifierRadius = 5;

        let magnifierX = mouseX + 20;
        let magnifierY = mouseY + 20;

        if (magnifierX + magnifierSize > window.innerWidth) {
            magnifierX = mouseX - magnifierSize - 20;
        }
        if (magnifierY + magnifierSize > window.innerHeight) {
            magnifierY = mouseY - magnifierSize - 20;
        }
        if (magnifierX < 0) magnifierX = 20;
        if (magnifierY < 0) magnifierY = 20;

        this.state.magnifierPos = { x: magnifierX, y: magnifierY };
        this.ctxMagnifier.clearRect(0, 0, magnifierSize, magnifierSize);

        this.ctxMagnifier.imageSmoothingEnabled = false;
        this.ctxMagnifier.drawImage(
            this.canvasBg,
            mouseX - magnifierRadius, mouseY - magnifierRadius,
            magnifierRadius * 2, magnifierRadius * 2,
            0, 0,
            magnifierSize, magnifierSize
        );

        this.ctxMagnifier.strokeStyle = "#fff";
        this.ctxMagnifier.lineWidth = 1;
        const center = magnifierSize / 2;
        this.ctxMagnifier.beginPath();
        this.ctxMagnifier.moveTo(0, center);
        this.ctxMagnifier.lineTo(magnifierSize, center);
        this.ctxMagnifier.stroke();
        this.ctxMagnifier.beginPath();
        this.ctxMagnifier.moveTo(center, 0);
        this.ctxMagnifier.lineTo(center, magnifierSize);
        this.ctxMagnifier.stroke();

        this.perf.end("updateMagnifier");
        this.perf.logStats('updateMagnifier');
        this._emit("magnifierPosChange", this.state.magnifierPos);
    }

    _emit(eventName, data) {
        if (this.eventListeners && this.eventListeners[eventName]) {
            this.eventListeners[eventName].forEach((callback) => callback(data));
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

    getCurrentSelection() {
        return { ...this.state.currentSelection };
    }

    destroy() {
        this.state = null;
        this.eventListeners = null;
        this.ctxBg = null;
        this.ctxCapture = null;
        this.ctxOffscreen = null;
    }
}