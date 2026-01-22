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
        CONTROL_POINT_RADIUS: 4,
        MAGNIFIER_SIZE: 200,
        MAGNIFIER_RADIUS: 20,
        TOOLBAR_SIZE: { width: 30 * 13, height: 50 },
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
        this.dpr = window.devicePixelRatio;
        this.logicalSize = {
            width: window.screen.width,
            height: window.screen.height,
        }
        this.screenSize = {
            width: window.screen.width * this.dpr,
            height: window.screen.height * this.dpr
        }
        this.magnifierTimer = null; // 降频定时器
        this.renderThrottleDelay = 16; // 约60fps，可调至20（50fps）

        // 核心状态
        this.state = {
            isMouseDown: false,
            drawingState: Screenshot.DrawingState.NO_ACTION,
            currentSelection: { x: 0, y: 0, width: 0, height: 0 },
            lastSelection: { x: 0, y: 0, width: 0, height: 0 },
            startPos: { x: 0, y: 0 },
            initialMoveOffset: { x: 0, y: 0 },
            magnifierPos: { x: 0, y: 0 },
            toolbarPos: { x: 0, y: 0 },
            currentMarkTool: ShapeType.NONE,
            markManager: null,
            showCtrlPoints: false, // 修复：挂载到state中
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
        this.canvasBg.width = this.screenSize.width;
        this.canvasBg.height = this.screenSize.height;
        this.canvasCapture.width = this.screenSize.width;
        this.canvasCapture.height = this.screenSize.height;
        this.canvasOffscreen.width = this.screenSize.width;
        this.canvasOffscreen.height = this.screenSize.height;

        // 计算缩放比
        const rect = this.canvasCapture.getBoundingClientRect();
        // 必须在设置完cavnas的宽高之后调用scale，后续坐标都是逻辑坐标，和CSS保持一致
        this.ctxBg.scale(this.dpr, this.dpr);
        this.ctxOffscreen.scale(this.dpr, this.dpr);
        this.ctxCapture.scale(this.dpr, this.dpr);
        // 初始化画布为透明
        this.ctxOffscreen.clearRect(0, 0, this.logicalSize.width, this.logicalSize.height);
        this.ctxCapture.clearRect(0, 0, this.logicalSize.width, this.logicalSize.height);

        // 初始化标注管理器
        this.state.markManager = new MarkManager(
            this.canvasCapture,
            this.canvasOffscreen,
            this.screenSize
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
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        if (this.state.currentMarkTool == ShapeType.SELECT) { // 移动标注对象

        } else if (this.state.currentMarkTool !== ShapeType.NONE) { // 标注模式
            let key = `DRAW_${ShapeFactory.typeToStr(this.state.currentMarkTool).toUpperCase()}`;
            this.state.drawingState = Screenshot.DrawingState[key] || Screenshot.DrawingState.NO_ACTION;
            this.state.markManager.startDrawing(this.state.currentMarkTool, mouseX, mouseY);
            return;
        }

        // 选区模式
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
                this.state.showCtrlPoints = false;
            }
        }
    }

    handleMousemove(e) {
        // 更新放大镜
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        if (!this.state.isMouseDown) {
            const controlPoint = this._isInControlPoint(mouseX, mouseY);
            this.canvasCapture.style.cursor = controlPoint
                ? controlPoint.cursor
                : (this._isInsideSelection(mouseX, mouseY) ? "move" : "crosshair");
        } else {
            // 标注绘制
            if (this.state.drawingState >= 11) {
                this.state.markManager.updateDrawing(mouseX, mouseY);
            }
            // 选区操作
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
            this._emit("showToolbar", false); // 拖拽选区和移动选区的时候隐藏工具栏
            this.refresh(e);
        }
    }

    handleMouseup(e) {
        if (this.state.isMouseDown) {
            this._emit("showMagnifier", false);
            clearTimeout(this.magnifierTimer);
        }
        this.state.isMouseDown = false;
        this.canvasCapture.style.cursor = "crosshair";

        // 标注结束
        if (this.state.drawingState >= 11) {
            this.state.markManager.finishDrawing();
            this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
            return;
        }

        // 选区结束
        if (this.state.drawingState == Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
            this._calculateToolbarPos();

            if (this.state.currentSelection.width < 2 || this.state.currentSelection.height < 2) {
                this._emit("showToolbar", false);
            } else {
                this._emit("showToolbar", true);
            }
            this.refresh(e);
            this.state.showCtrlPoints = true; // 修复：改为state中的变量
            this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
        }
    }

    handleMouseleave() {
        wnd.log("mouse leave");
        // 以下代码在拖放选区的时候可能导致提前终止
        // this.state.isMouseDown = false;
        // this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
        // this.canvasCapture.style.cursor = "crosshair";
    }

    handleKeydown(e) {
        if (e.key === "Escape") {
            console.log("handleKeyDown");
            this.destroy();
            window.channel.cancelScreenshot();
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown" ||
            e.key === "ArrowLeft" || e.key === "ArrowRight") {
            // 阻止默认的页面滚动行为
            e.preventDefault();
            // 处理方向键
            this._handleArrowKey(e.key);
        }
    }

    _handleArrowKey(key) {
        const step = 1; // 每次移动的像素数        
        switch (key) {
            case "ArrowUp":
            case "ArrowDown":
            case "ArrowLeft":
            case "ArrowRight":
                this._updateMagnifier(key, step);
                this._updateSelection(key, step);
                break;
        }
    }

    // 统一更新放大镜位置
    _updateMagnifier(direction, step) {
        // 获取放大镜参数（需要确保这些变量在类中定义）
        const magnifierSize = 11;  // 网格数量
        const pixelSize = 10;      // 每个像素的显示大小
        const totalMagnifierSize = magnifierSize * pixelSize;

        const maxX = this.logicalSize.width - 1;
        const maxY = this.logicalSize.height - 1;

        let newX = this.state.magnifierPos.x;
        let newY = this.state.magnifierPos.y;

        // 根据方向计算新位置
        switch (direction) {
            case "ArrowUp":
                newY = Math.max(0, newY - step);
                break;
            case "ArrowDown":
                newY = Math.min(maxY - totalMagnifierSize, newY + step);
                break;
            case "ArrowLeft":
                newX = Math.max(0, newX - step);
                break;
            case "ArrowRight":
                newX = Math.min(maxX - totalMagnifierSize, newX + step);
                break;
        }

        // 严格的边界检查（确保放大镜完全在屏幕内）
        newX = Math.max(0, Math.min(maxX - totalMagnifierSize, newX));
        newY = Math.max(0, Math.min(maxY - totalMagnifierSize, newY));

        // 只有位置发生变化时才更新
        if (newX !== this.state.magnifierPos.x || newY !== this.state.magnifierPos.y) {
            this.state.magnifierPos = { x: newX, y: newY };
            // 触发事件通知
            this._emit("magnifierNewPos", this.state.magnifierPos);
        }
    }

    // 更新选择区域
    _updateSelection(direction, step) {
        const selection = this.state.currentSelection;
        const maxX = this.logicalSize.width - 1;
        const maxY = this.logicalSize.height - 1;

        // 它们已经是计算后的矩形左上角坐标
        let endX = selection.x + selection.width;
        let endY = selection.y + selection.height;

        // 根据方向移动结束点
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
        wnd.log('x,y,w,h = ', newStartX, newStartY, width, height);
        let e = {
            clientX: newEndX,
            clientY: newEndY
        };

        this.refresh(e);


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
            Math.min(newX, this.screenSize.width - this.state.currentSelection.width)
        );
        this.state.currentSelection.y = Math.max(
            0,
            Math.min(newY, this.screenSize.height - this.state.currentSelection.height)
        );
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

        // 计算工具条在物理屏幕上的基础位置（选择区域右下角）
        let finalX = x + width - TOOLBAR_SIZE.width;
        let finalY = y + height + 10; // +10是工具条和选择框的间距

        // 处理边界（左右上下都要处理，避免工具条超出屏幕）
        // 左边界：不能小于0
        finalX = Math.max(0, finalX);
        // 右边界：不能超过屏幕宽度 - 工具条宽度
        finalX = Math.min(finalX, this.logicalSize.width - TOOLBAR_SIZE.width);
        // 上边界：不能小于0
        finalY = Math.max(0, finalY);
        // 下边界：不能超过屏幕高度 - 工具条高度
        finalY = Math.min(finalY, this.logicalSize.height - TOOLBAR_SIZE.height);

        // 将物理坐标转回渲染坐标（如果需要在渲染层显示）
        this.state.toolbarPos = {
            x: finalX,
            y: finalY
        };
    }

    // 修复：局部清除上一次选区（而非清空整个离屏画布）
    _clearLastSelection() {
        const { x, y, width, height } = this.state.lastSelection;
        const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS;
        // 清除范围包含控制点，避免残留
        this.ctxOffscreen.clearRect(x - radius, y - radius, width + radius * 2, height + radius * 2);
    }

    _drawCurrentSelection() {
        const { x, y, width, height } = this.state.currentSelection;

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
    refresh(e) {
        // 清除离屏画布的上一次选区
        this._clearLastSelection();
        // 绘制当前选区
        this._drawCurrentSelection();
        // 绘制所有形状
        this.state.markManager.redraw();
        // 绘制控制点（仅当需要显示时）
        if (this.state.showCtrlPoints) {
            this._drawControlPoints();
        }

        // 清空主画布 + 完整渲染离屏画布到主画布
        this.ctxCapture.clearRect(0, 0, this.canvasCapture.width, this.canvasCapture.height);
        this.ctxCapture.drawImage(this.canvasOffscreen, 0, 0);

        if (!this.magnifierTimer) {
            this.magnifierTimer = setTimeout(() => {
                this._updateMagnifier(e); // 延迟渲染放大镜
                this.magnifierTimer = null;
            }, this.renderThrottleDelay);
        }

        // 记录本次选区为下一次的“上一次选区”
        this.state.lastSelection = { ...this.state.currentSelection };
        this._emit("toolbarPosChange", this.state.toolbarPos);
    }

    _updateMagnifier(e) {
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // 放大镜大小为11x11像素，每个网格对应1个屏幕像素
        const magnifierSize = 15;
        const pixelSize = 10; // 每个像素在放大镜中显示为10x10像素

        // 计算放大镜在屏幕上的位置（避免超出边界）
        let magnifierX = mouseX + 20;
        let magnifierY = mouseY + 20;

        if (magnifierX + magnifierSize * pixelSize > this.logicalSize.width) {
            magnifierX = mouseX - magnifierSize * pixelSize - 20;
        }
        if (magnifierY + magnifierSize * pixelSize > this.logicalSize.height) {
            magnifierY = mouseY - magnifierSize * pixelSize - 20;
        }
        if (magnifierX < 0) magnifierX = 20;
        if (magnifierY < 0) magnifierY = 20;

        this.state.magnifierPos = { x: magnifierX, y: magnifierY };

        // 清空放大镜画布
        this.ctxMagnifier.clearRect(0, 0, magnifierSize * pixelSize, magnifierSize * pixelSize);

        // 禁用图像平滑，保持像素清晰
        this.ctxMagnifier.imageSmoothingEnabled = false;

        // 绘制放大后的像素区域
        // 从屏幕截取11x11像素区域，放大到110x110像素
        this.ctxMagnifier.drawImage(
            this.canvasBg,
            mouseX - Math.floor(magnifierSize / 2),  // 中心对准鼠标位置
            mouseY - Math.floor(magnifierSize / 2),
            magnifierSize, magnifierSize,            // 源图像大小：11x11像素
            0, 0,
            magnifierSize * pixelSize, magnifierSize * pixelSize  // 目标大小：110x110像素
        );

        // 绘制网格线（11x11网格）
        this.ctxMagnifier.strokeStyle = "#ccc";
        this.ctxMagnifier.lineWidth = 1;
        this.ctxMagnifier.globalAlpha = 0.6;

        // 绘制垂直线
        for (let i = 0; i <= magnifierSize; i++) {
            this.ctxMagnifier.beginPath();
            this.ctxMagnifier.moveTo(i * pixelSize, 0);
            this.ctxMagnifier.lineTo(i * pixelSize, magnifierSize * pixelSize);
            this.ctxMagnifier.stroke();
        }

        // 绘制水平线
        for (let i = 0; i <= magnifierSize; i++) {
            this.ctxMagnifier.beginPath();
            this.ctxMagnifier.moveTo(0, i * pixelSize);
            this.ctxMagnifier.lineTo(magnifierSize * pixelSize, i * pixelSize);
            this.ctxMagnifier.stroke();
        }
        this.ctxMagnifier.globalAlpha = 1;

        // 绘制中心十字线（更显眼）
        this.ctxMagnifier.strokeStyle = "rgba(0, 122, 255, 1)";
        this.ctxMagnifier.lineWidth = pixelSize;
        this.ctxMagnifier.globalAlpha = 0.8;
        const center = magnifierSize * pixelSize / 2;
        this.ctxMagnifier.beginPath();
        // 水平线
        this.ctxMagnifier.moveTo(0, center);
        this.ctxMagnifier.lineTo(center + pixelSize / 2, center);
        // 垂直线
        this.ctxMagnifier.moveTo(center, 0);
        this.ctxMagnifier.lineTo(center, center);
        this.ctxMagnifier.stroke();
        this.ctxMagnifier.globalAlpha = 1;

        this._emit("magnifierNewPos", this.state.magnifierPos);
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