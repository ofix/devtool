import MarkManager from "./MarkManager.js"
// 基于Canvas的截图实现类
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

    // 配置常量
    static CONFIG = {
        CONTROL_POINT_RADIUS: 4,
        MAGNIFIER_SIZE: 200,
        MAGNIFIER_RADIUS: 20,
        TOOLBAR_SIZE: { width: 28 * 12 + 10, height: 60 },
    };

    constructor(canvasEl, magnifierCanvasEl) {
        // DOM 元素
        this.canvas = canvasEl;
        this.magnifierCanvas = magnifierCanvasEl;
        // Canvas 上下文
        this.ctx = this.canvas.getContext("2d");
        this.magnifierCtx = this.magnifierCanvas?.getContext("2d");
        // 离屏 Canvas（优化重绘性能）
        this.offscreenCanvas = document.createElement("canvas");
        this.offscreenCtx = this.offscreenCanvas.getContext("2d");

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
            markManager: null, // 标注管理器（可按需传入）
        };

        this.screenImage = null;

        // 初始化
        this._initCanvas();
        // 绑定事件（确保 this 指向类实例）
        this.handleMousedown = this.handleMousedown.bind(this);
        this.handleMousemove = this.handleMousemove.bind(this);
        this.handleMouseup = this.handleMouseup.bind(this);
        this.handleMouseleave = this.handleMouseleave.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
    }

    _initCanvas() {
        // 设置 Canvas 尺寸
        this.canvas.width = this.state.screenSize.width;
        this.canvas.height = this.state.screenSize.height;
        this.offscreenCanvas.width = this.state.screenSize.width;
        this.offscreenCanvas.height = this.state.screenSize.height;

        // 计算缩放比（Canvas 显示尺寸 vs 实际屏幕尺寸）
        const rect = this.canvas.getBoundingClientRect();
        this.state.scaleX = this.state.screenSize.width / rect.width;
        this.state.scaleY = this.state.screenSize.height / rect.height;

        // 初始化标注管理器（按需）
        
            this.state.markManager = new MarkManager(
                this.canvas,
                this.offscreenCanvas,
                this.state.screenSize
            );
        
    }

    getMarkManager(){
        return this.state.markManager;
    }

    /**
     * Base64 字符串转 Image 对象（异步）
     * @param {string} base64Str - Base64 图片字符串
     * @returns {Promise<HTMLImageElement>} 加载完成的图像对象
     */
    _base64ToImage(base64Str) {
        return new Promise((resolve, reject) => {
            // 校验 Base64 格式（可选，增强健壮性）
            if (!base64Str || !base64Str.startsWith('data:image/')) {
                reject(new Error('无效的 Base64 图片字符串'));
                return;
            }

            const img = new Image();
            // 解决跨域问题（如果截图来自不同域）
            img.crossOrigin = 'anonymous';

            img.onload = () => resolve(img);
            img.onerror = (err) => reject(new Error(`图片加载失败：${err.message}`));
            img.src = base64Str; // 触发图片加载
        });
    }


    // ========== 对外暴露的初始化方法（Vue 组件调用） ==========
    async init(base64Image) {
        try {
            this.screenImage = await this._base64ToImage(base64Image);
            // 绘制全屏截图到离屏 Canvas
            this.offscreenCtx.drawImage(this.screenImage, 0, 0);
            // 同步到主 Canvas
            this.ctx.drawImage(this.offscreenCanvas, 0, 0);
        } catch (e) {
            console.log(e);
        }
    }

    // ========== 鼠标事件处理（核心交互逻辑） ==========
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
            // 新建选区
            this.state.drawingState = Screenshot.DrawingState.DRAG_CAPTURE_AREA;
            this.state.startPos = { x: mouseX, y: mouseY };
            this.state.currentSelection = { x: mouseX, y: mouseY, width: 0, height: 0 };
        } else {
            // 调整/移动选区
            const controlPoint = this._isInControlPoint(mouseX, mouseY);
            if (controlPoint) {
                this.state.drawingState = controlPoint.state;
                this.canvas.style.cursor = controlPoint.cursor;
            } else if (this._isInsideSelection(mouseX, mouseY)) {
                this.state.drawingState = Screenshot.DrawingState.MOVE_CAPTURE_AREA;
                this.canvas.style.cursor = "move";
                this.state.initialMoveOffset = {
                    x: mouseX - this.state.currentSelection.x,
                    y: mouseY - this.state.currentSelection.y,
                };
            } else {
                // 空白处新建选区
                this.state.drawingState = Screenshot.DrawingState.DRAG_CAPTURE_AREA;
                this.state.startPos = { x: mouseX, y: mouseY };
                this.state.currentSelection = { x: mouseX, y: mouseY, width: 0, height: 0 };
            }
        }

        // 触发外部事件（通知 Vue 组件显示放大窗）
        this._emit("magnifierShow", true);
        this._updateMagnifier(e);
    }

    handleMousemove(e) {
        if (!this.state.isMouseDown) {
            // 仅更新鼠标样式
            const { x: mouseX, y: mouseY } = this._getRealMousePos(e);
            const controlPoint = this._isInControlPoint(mouseX, mouseY);
            this.canvas.style.cursor = controlPoint
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
            this._updateMagnifier(e);

            // 新建选区
            if (this.state.drawingState === Screenshot.DrawingState.DRAG_CAPTURE_AREA) {
                this.state.currentSelection = {
                    x: Math.min(this.state.startPos.x, mouseX),
                    y: Math.min(this.state.startPos.y, mouseY),
                    width: Math.abs(mouseX - this.state.startPos.x),
                    height: Math.abs(mouseY - this.state.startPos.y),
                };
            }
            // 调整选区（8方向）
            else if (this.state.drawingState >= 3 && this.state.drawingState <= 10) {
                this._adjustSelection(mouseX, mouseY);
            }
            // 移动选区
            else if (this.state.drawingState === Screenshot.DrawingState.MOVE_CAPTURE_AREA) {
                this._moveSelection(mouseX, mouseY);
            }

            // 重绘选区
            this._clearLastSelection();
            this._drawCurrentSelection();
            this.state.lastSelection = { ...this.state.currentSelection };

            // 计算工具栏位置并通知 Vue 组件
            this._calculateToolbarPos();
            this._emit("toolbarPosChange", this.state.toolbarPos);
        }
    }

    handleMouseup(e) {
        this.state.isMouseDown = false;
        this._emit("magnifierShow", false);
        this.canvas.style.cursor = "crosshair";

        // 标注结束
        if (this.state.markManager && this.state.drawingState >= 11) {
            this.state.markManager.finishDrawing();
            this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
            return;
        }

        // 选区结束
        if (this.state.captureStarted) {
            // 空选区重置
            if (this.state.currentSelection.width < 2 || this.state.currentSelection.height < 2) {
                this.state.captureStarted = false;
                this._emit("toolbarShow", false);
            } else {
                this._emit("toolbarShow", true);
            }
            this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
        }
    }

    handleMouseleave() {
        this.state.isMouseDown = false;
        this._emit("magnifierShow", false);
        this.state.drawingState = Screenshot.DrawingState.NO_ACTION;
        this.canvas.style.cursor = "crosshair";
    }

    handleKeydown(e) {
        if (e.key === "Escape") {
            console.log("handleKeyDown");
            this.destroy();
            window.channel.cancelScreenshot();
        }
    }

    // 获取真实鼠标位置（缩放修正）
    _getRealMousePos(e) {
        return {
            x: e.clientX * this.state.scaleX,
            y: e.clientY * this.state.scaleY,
        };
    }

    // 调整选区（8方向）
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

        // 修正负数宽高
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

    // 移动选区
    _moveSelection(mouseX, mouseY) {
        const newX = mouseX - this.state.initialMoveOffset.x;
        const newY = mouseY - this.state.initialMoveOffset.y;

        // 边界限制
        this.state.currentSelection.x = Math.max(
            0,
            Math.min(newX, this.state.screenSize.width - this.state.currentSelection.width)
        );
        this.state.currentSelection.y = Math.max(
            0,
            Math.min(newY, this.state.screenSize.height - this.state.currentSelection.height)
        );
    }

    // 清除上一帧选区
    _clearLastSelection() {
        const { x, y, width, height } = this.state.lastSelection;
        if (width > 2 && height > 2) {
            const radius = Screenshot.CONFIG.CONTROL_POINT_RADIUS;
            this.ctx.drawImage(
                this.offscreenCanvas,
                x - radius,
                y - radius,
                width + radius * 2,
                height + radius * 2,
                x - radius,
                y - radius,
                width + radius * 2,
                height + radius * 2
            );
        }
    }

    // 绘制当前选区
    _drawCurrentSelection() {
        const { x, y, width, height } = this.state.currentSelection;
        if (width < 2 || height < 2) return;

        // 绘制选区背景
        this.ctx.fillStyle = "rgba(0, 122, 255, 0.2)";
        this.ctx.fillRect(x, y, width, height);
        // 绘制选区边框
        this.ctx.strokeStyle = "rgba(0, 122, 255, 1)";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
        // 绘制控制点（8个）
        this._drawControlPoints();
    }

    // 绘制选区控制点
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

        this.ctx.fillStyle = "white";
        this.ctx.strokeStyle = "rgba(0, 122, 255, 1)";
        this.ctx.lineWidth = 1;

        points.forEach((point) => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        });
    }

    // 检测是否在控制点上
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

    // 检测是否在选区内部
    _isInsideSelection(mouseX, mouseY) {
        const { x, y, width, height } = this.state.currentSelection;
        return mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height;
    }

    // 计算工具栏位置
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

    // 更新放大窗
    _updateMagnifier(e) {
        if (!this.magnifierCtx) return;
        // 省略放大窗绘制逻辑（可按需实现）
        // 计算鼠标真实坐标（相对于原始画布）
        const mouseX = e.clientX * this.scaleX;
        const mouseY = e.clientY * this.scaleY;
        const magnifierSize = 200;
        const magnifierRadius = 20;

        // 计算放大窗位置：默认显示在鼠标右下角（+20偏移），自适应边界
        let magnifierX = e.clientX + 20;
        let magnifierY = e.clientY + 20;

        // 边界检测：如果右下角超出屏幕，调整到左侧/上侧
        if (magnifierX + magnifierSize > window.innerWidth) {
            magnifierX = e.clientX - magnifierSize - 20;
        }
        if (magnifierY + magnifierSize > window.innerHeight) {
            magnifierY = e.clientY - magnifierSize - 20;
        }
        // 确保不超出屏幕左上角
        if (magnifierX < 0) magnifierX = 20;
        if (magnifierY < 0) magnifierY = 20;

        console.log("magnifier x:", maginifierX, "maginifier y: ", maginifierY);

        let magnifierPos = { x: magnifierX, y: magnifierY };
        // ===== 核心修改：像素级放大（拾色器效果） =====
        const pixelRadius = magnifierRadius; // 要放大的原像素区域半径（比如5，表示取10x10像素）
        const scale = magnifierSize / (pixelRadius * 2); // 放大比例（画布尺寸 / 原像素区域尺寸）

        // 清空放大镜画布
        this.this.magnifierCtx.clearRect(0, 0, magnifierSize, magnifierSize);

        // 获取原画布中鼠标周围pixelRadius*2区域的像素数据
        const imageData = this.offscreenCtx
            .getImageData(
                mouseX - pixelRadius,
                mouseY - pixelRadius,
                pixelRadius * 2,
                pixelRadius * 2
            );
        const data = imageData.data; // 像素数据数组（RGBA格式，每个像素占4位）

        // 逐像素绘制放大后的效果（每个原像素放大为scale*scale的方块）
        for (let y = 0; y < pixelRadius * 2; y++) {
            for (let x = 0; x < pixelRadius * 2; x++) {
                // 计算当前像素在data数组中的索引
                const index = (y * pixelRadius * 2 + x) * 4;
                // 获取RGBA值
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const a = data[index + 3];

                // 设置画笔颜色
                this.magnifierCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
                // 绘制放大后的像素块（每个块的尺寸是scale）
                this.magnifierCtx.fillRect(
                    x * scale, // 放大后的X坐标
                    y * scale, // 放大后的Y坐标
                    scale, // 块宽度
                    scale // 块高度
                );
            }
        }

        // 可选：在放大镜中心绘制十字线，方便定位像素
        this.magnifierCtx.strokeStyle = "#fff";
        this.magnifierCtx.lineWidth = 1;
        const center = magnifierSize / 2;
        // 水平十字线
        this.magnifierCtx.beginPath();
        this.magnifierCtx.moveTo(0, center);
        this.magnifierCtx.lineTo(magnifierSize, center);
        this.magnifierCtx.stroke();
        // 垂直十字线
        this.magnifierCtx.beginPath();
        this.magnifierCtx.moveTo(center, 0);
        this.magnifierCtx.lineTo(center, magnifierSize);
        this.magnifierCtx.stroke();
        this.state.magnifierPos = { x: e.clientX + 20, y: e.clientY + 20 };
        this._emit("magnifierPosChange", this.state.magnifierPos);
    }

    // 简易事件发射器（通知 Vue 组件状态变化）
    _emit(eventName, data) {
        if (this.eventListeners && this.eventListeners[eventName]) {
            this.eventListeners[eventName].forEach((callback) => callback(data));
        }
    }

    // 注册事件监听
    on(eventName, callback) {
        if (!this.eventListeners) this.eventListeners = {};
        if (!this.eventListeners[eventName]) this.eventListeners[eventName] = [];
        this.eventListeners[eventName].push(callback);
    }

    // 设置当前标注工具
    setMarkTool(tool) {
        this.state.currentMarkTool = tool;
    }

    // 获取当前选区
    getCurrentSelection() {
        return { ...this.state.currentSelection };
    }

    // 销毁（清理事件/资源）
    destroy() {
        this.state = null;
        this.eventListeners = null;
        this.ctx = null;
        this.offscreenCtx = null;
    }
}