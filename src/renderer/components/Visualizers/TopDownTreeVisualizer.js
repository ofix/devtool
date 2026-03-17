// TopDownTreeVisualizer.js
export default class TopDownTreeVisualizer {
    /**
     * 构造函数
     * @param {HTMLCanvasElement} canvas - 画布元素
     * @param {Object} treeData - 树形数据（MP4 节点数据）
     * @param {Object} options - 配置项
     */
    constructor(canvas, treeData, options = {}) {
        // 核心 DOM/数据
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.treeData = treeData;
        this.allElements = []; // 存储所有绘制元素

        // 默认配置 + 外部配置覆盖
        this.config = {
            baseHeight: 40,
            expandHeight: 30,
            minWidth: 80,
            maxWidth: 200,
            widthLogBase: 10,
            easeFactor: 0.15,
            scaleRange: { min: 0.4, max: 2.5 },
            dblClickThreshold: 300, // 双击时间阈值（ms）
            ...options
        };

        // 视图状态
        this.state = {
            scale: 1,
            offsetX: 100,
            offsetY: 60,
            targetX: 100,
            targetY: 60,
            isDragging: false,
            isAnimating: false,
            lastMouseX: 0,
            lastMouseY: 0
        };

        // 双击检测相关
        this.dblClickState = {
            lastClickTime: 0,    // 上次点击时间
            lastClickNode: null, // 上次点击的节点
            clickPos: { x: 0, y: 0 } // 点击位置
        };

        // 绑定事件
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
        this.handleWheel = this.handleWheel.bind(this);

        // 动画帧
        this.animationFrame = null;

        // 初始化
        this.initCanvasSize();
        this.render();
        this.startAnimationLoop();
    }

    /**
     * 初始化画布尺寸（适配容器）
     */
    initCanvasSize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        // 适配高清屏
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        this.ctx.scale(dpr, dpr);

        this.render();
    }

    /**
     * 初始化画布事件（供 Vue 组件调用）
     */
    initEvents() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
        window.addEventListener('resize', () => this.initCanvasSize());
    }

    /**
     * 销毁事件/动画（供 Vue 组件卸载时调用）
     */
    destroy() {
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
        this.canvas.removeEventListener('wheel', this.handleWheel);
        window.removeEventListener('resize', () => this.initCanvasSize());

        cancelAnimationFrame(this.animationFrame);
    }

    // ==================== 核心修改：双击检测 + 拖拽分离 ====================
    /**
     * 检测双击事件
     * @param {Object} clickedNode - 点击的节点
     * @param {Number} clickTime - 当前点击时间
     * @returns {Boolean} 是否为有效双击
     */
    isDoubleClick(clickedNode, clickTime) {
        // 条件：
        // 1. 两次点击时间差 < 阈值
        // 2. 两次点击的是同一个节点
        // 3. 点击位置距离 < 5px（防止拖拽误判）
        const timeDiff = clickTime - this.dblClickState.lastClickTime;
        const sameNode = clickedNode === this.dblClickState.lastClickNode;
        const posDiff = Math.sqrt(
            Math.pow(this.dblClickState.clickPos.x - this.dblClickState.clickPos.x, 2) +
            Math.pow(this.dblClickState.clickPos.y - this.dblClickState.clickPos.y, 2)
        );

        const isDblClick = timeDiff < this.config.dblClickThreshold && sameNode && posDiff < 5;

        // 更新双击状态
        this.dblClickState.lastClickTime = clickTime;
        this.dblClickState.lastClickNode = clickedNode;

        return isDblClick;
    }

    /**
     * 鼠标按下事件（拆分拖拽和双击逻辑）
     */
    handleMouseDown(e) {
        const clickTime = Date.now();
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const clickX = (e.clientX - rect.left) / dpr;
        const clickY = (e.clientY - rect.top) / dpr;
        const clickedNode = this.findClickedNode(clickX, clickY);

        // 记录点击位置（用于双击检测）
        this.dblClickState.clickPos = { x: clickX, y: clickY };

        // 1. 双击逻辑（仅处理 box 节点）
        if (clickedNode && clickedNode.type === 'box') {
            if (this.isDoubleClick(clickedNode, clickTime)) {
                // 双击：切换节点展开/收缩
                clickedNode.expanded = !clickedNode.expanded;
                this.render();
                this.onNodeClick && this.onNodeClick(clickedNode);
                // 重置双击状态，避免连续点击触发多次
                this.dblClickState.lastClickTime = 0;
                return; // 双击时不触发拖拽
            }
        }

        // 2. 拖拽逻辑（非双击时触发）
        this.state.isDragging = true;
        this.state.lastMouseX = e.clientX;
        this.state.lastMouseY = e.clientY;
    }

    // ==================== 原有事件逻辑（无修改） ====================
    handleMouseMove(e) {
        if (this.state.isDragging) {
            const dx = e.clientX - this.state.lastMouseX;
            const dy = e.clientY - this.state.lastMouseY;

            this.state.offsetX += dx;
            this.state.offsetY += dy;
            this.state.targetX = this.state.offsetX;
            this.state.targetY = this.state.offsetY;

            this.state.lastMouseX = e.clientX;
            this.state.lastMouseY = e.clientY;

            this.render();
        }

        // 鼠标悬浮提示
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const mx = (e.clientX - rect.left) / dpr;
        const my = (e.clientY - rect.top) / dpr;
        const hoveredNode = this.findClickedNode(mx, my);

        this.onNodeHover && this.onNodeHover(hoveredNode);
    }

    handleMouseUp() {
        this.state.isDragging = false;
    }

    handleMouseLeave() {
        this.state.isDragging = false;
        this.onNodeHover && this.onNodeHover(null); // 清空悬浮
        // 离开画布时重置双击状态
        this.dblClickState.lastClickTime = 0;
        this.dblClickState.lastClickNode = null;
    }

    handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this.setScale(this.state.scale + delta);
    }

    // ==================== 核心绘制逻辑（无修改） ====================
    calculateNodePositions(node, parentX, parentY) {
        const logVal = Math.log(node.bytes + 1) / Math.log(this.config.widthLogBase);
        const width = Math.max(
            this.config.minWidth,
            Math.min(this.config.maxWidth, this.config.minWidth + logVal * 25)
        );

        const scaledW = width * this.state.scale;
        const scaledH = this.config.baseHeight * this.state.scale;
        const expandH = this.config.expandHeight * this.state.scale;

        node.x = parentX + this.state.offsetX;
        node.y = parentY + this.state.offsetY;
        node.width = scaledW;
        node.height = scaledH;

        this.allElements.push(node);
        node.expandArea = null;

        if (node.expanded && node.children && node.children.length) {
            let totalChildWidth = 0;
            node.children.forEach(child => {
                const cw = this.calcChildWidth(child);
                totalChildWidth += cw;
                child.width = cw;
            });

            let childX = parentX + (scaledW - totalChildWidth) / 2;
            const childY = parentY + scaledH + expandH;

            node.children.forEach(child => {
                this.calculateNodePositions(child, childX, childY);
                childX += child.width;
            });

            node.expandArea = {
                topLeft: node.x,
                topRight: node.x + scaledW,
                topY: node.y + scaledH,
                bottomLeft: node.children[0].x,
                bottomRight: node.children[node.children.length - 1].x + node.children[node.children.length - 1].width,
                bottomY: node.children[0].y
            };
        }
    }

    calcChildWidth(child) {
        const logVal = Math.log((child.bytes || 1) + 1) / Math.log(this.config.widthLogBase);
        const width = Math.max(
            this.config.minWidth,
            Math.min(this.config.maxWidth, this.config.minWidth + logVal * 25)
        );
        return width * this.state.scale;
    }

    drawNode(node) {
        if (!node || !node.width) return;

        // 1. 绘制背景
        this.ctx.fillStyle = node.type === 'box' ? '#ADD8E6' : '#E0E0E0';
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1 * this.state.scale;
        this.ctx.fillRect(node.x, node.y, node.width, node.height);
        this.ctx.strokeRect(node.x, node.y, node.width, node.height);

        // 2. 绘制节点名称
        this.ctx.fillStyle = '#000';
        this.ctx.font = `${11 * this.state.scale}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const nameY = node.y + node.height / 2 - 6 * this.state.scale;
        this.ctx.fillText(node.name, node.x + node.width / 2, nameY);

        // 3. 绘制节点值
        if (node.value) {
            this.ctx.fillStyle = '#888';
            this.ctx.font = `${8 * this.state.scale}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const valueY = node.y + node.height / 2 + 6 * this.state.scale;
            const displayValue = node.value.length > 12 ? `${node.value.substring(0, 10)}...` : node.value;
            this.ctx.fillText(displayValue, node.x + node.width / 2, valueY);
        }

        // 4. 绘制字节数
        this.ctx.fillStyle = '#666';
        this.ctx.font = `${9 * this.state.scale}px Arial`;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${node.bytes}B`, node.x + node.width - 4 * this.state.scale, node.y + 2 * this.state.scale);

        // 5. 绘制展开梯形
        if (node.expandArea) {
            this.ctx.beginPath();
            this.ctx.moveTo(node.expandArea.topLeft, node.expandArea.topY);
            this.ctx.lineTo(node.expandArea.topRight, node.expandArea.topY);
            this.ctx.lineTo(node.expandArea.bottomRight, node.expandArea.bottomY);
            this.ctx.lineTo(node.expandArea.bottomLeft, node.expandArea.bottomY);
            this.ctx.closePath();
            this.ctx.fillStyle = 'rgba(173,216,230,0.2)';
            this.ctx.strokeStyle = '#88AACC';
            this.ctx.fill();
            this.ctx.stroke();
        }

        // 6. 递归绘制子节点
        if (node.expanded && node.children) {
            node.children.forEach(child => this.drawNode(child));
        }
    }

    render() {
        const dpr = window.devicePixelRatio || 1;
        this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
        this.allElements = [];

        this.calculateNodePositions(this.treeData, 0, 0);
        this.drawNode(this.treeData);
    }

    // ==================== 动画与控制方法（无修改） ====================
    startAnimationLoop() {
        const animate = () => {
            if (this.state.isAnimating) {
                const dx = this.state.targetX - this.state.offsetX;
                const dy = this.state.targetY - this.state.offsetY;

                this.state.offsetX += dx * this.config.easeFactor;
                this.state.offsetY += dy * this.config.easeFactor;

                if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
                    this.state.offsetX = this.state.targetX;
                    this.state.offsetY = this.state.targetY;
                    this.state.isAnimating = false;
                }

                this.render();
            }
            this.animationFrame = requestAnimationFrame(animate);
        };
        animate();
    }

    setScale(scale) {
        const clampedScale = Math.max(
            this.config.scaleRange.min,
            Math.min(this.config.scaleRange.max, scale)
        );
        this.state.scale = clampedScale;
        this.render();
    }

    centerView() {
        if (this.state.isAnimating) return;

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        this.allElements.forEach(el => {
            if (el.x < minX) minX = el.x;
            if (el.x + el.width > maxX) maxX = el.x + el.width;
            if (el.y < minY) minY = el.y;
            if (el.y + el.height > maxY) maxY = el.y + el.height;
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const dpr = window.devicePixelRatio || 1;
        const canvasCenterX = this.canvas.width / (2 * dpr);
        const canvasCenterY = this.canvas.height / (2 * dpr);

        this.state.targetX = this.state.offsetX + (canvasCenterX - centerX);
        this.state.targetY = this.state.offsetY + (canvasCenterY - centerY);
        this.state.isAnimating = true;
    }

    resetView() {
        this.state.scale = 1;
        this.state.offsetX = 100;
        this.state.offsetY = 60;
        this.state.targetX = 100;
        this.state.targetY = 60;
        this.state.isAnimating = false;
        this.render();
    }

    findClickedNode(x, y) {
        for (let i = this.allElements.length - 1; i >= 0; i--) {
            const el = this.allElements[i];
            if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height) {
                return el;
            }
        }
        return null;
    }

    updateTreeData(newData) {
        this.treeData = newData;
        this.render();
    }
}