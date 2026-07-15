import RBush from 'rbush';
import EventTarget from './EventTarget.js';
import { SceneScaleCommand, MoveNodeCommand, UpdateNodeCommand, AddNodeCommand, SelectCommand } from '../index.js';

/**
 * 场景管理器,管理画布上所有的图形节点和文字
 */
class SceneManager extends EventTarget {
    /**
     * @param {HTMLCanvasElement} canvas 画布DOM
     */
    constructor(canvas) {
        super(null);
        // 画布实例与上下文
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        // RBush空间索引，存储所有Shape图形对象
        this.rbush = new RBush();
        // 当前选中节点集合 Set 避免重复选中
        this.activeNodes = new Set();
        // 视口可见节点缓存，绘图时仅渲染该集合，提升性能
        this.visibleNodes = new Set();
        // 弹窗组件（单次仅一个，碰撞检测优先弹窗）
        this.popup = null;
        // 画布缩放比例
        this.getBoundingBox = 1;
        // 画布平移偏移 x/y
        this.offset = { x: 0, y: 0 };
        // 画布缩放系数
        this.zoom = 1;
        // 画布最小缩放系数
        this.minZoom = 0.2;
        // 画布最大缩放系数
        this.maxZoom = 8;
        // 全量图形节点，渲染前按zIndex升序排序（底层先画，顶层后画）
        this.nodes = [];
        // 连线关联节点：存储节点间贝塞尔曲线连线对象
        this.connectNodes = [];
        // mode 场景模式：edit编辑 / preview预览
        this.mode = 'edit'; // edit | preview
        // 分析路径集合
        // 结构：[{ name: string, nodeIds: Set<string>, visible: boolean }]
        this.analysisPaths = [];
        // 当前激活的分析路径（预览模式点击后赋值）
        this.activeAnalysisPath = null;
        // 节点分类统计：key=节点类名，value=对应节点数组，total总数量
        this.nodeStat = {
            map: new Map(),
            total: 0
        };
        // 撤销重做命令栈
        this.commandStack = [];
        this.commandPointer = -1; // 当前命令指针，重做分界
        const MAX_STACK = 50; // 最大缓存命令数
        // 扩展补充字段
        this.hoverNode = null; // 当前鼠标悬浮节点，用于mouseenter/mouseleave
        this.isDragging = false; // 框选拖拽标记
        this.selectBox = null; // 框选矩形 {x0,y0,x1,y1}
        this.viewport = { x: 0, y: 0, w: canvas.width, h: canvas.height }; // 视口边界
        // 双击交互缓存
        this._clickCache = {
            time: 0,          // 上次点击时间戳
            pos: null,        // 上次点击坐标 {x,y}
            parentNode: null, // 上次点击所属父容器结构体
            hitNode: null     // 上次点击原始命中节点
        };
        this.DOUBLE_CLICK_DELAY = 250; // 双击间隔阈值 250ms
        // 绑定画布原生事件
        this._bindCanvasEvents();
        // 绑定全局键盘事件
        this._bindKeyboardEvents();
    }

    // 画布世界坐标转化为场景视口坐标
    worldToScene(worldX, worldY) {
        return {
            x: (worldX - this.offset.x) * this.zoom,
            y: (worldY - this.offset.y) * this.zoom,
        }
    }

    // 场景视口坐标转换为画布世界坐标
    sceneToWorld(sceneX, sceneY) {
        return {
            x: sceneX / this.zoom + this.offset.x,
            y: sceneY / this.zoom + this.offset.y
        }
    }

    /**
     * 绑定Canvas鼠标原生事件 mousedown/mouseup/mousemove/wheel
     */
    _bindCanvasEvents() {
        const canvas = this.canvas;
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('wheel', (e) => this.onWheelScale(e));
    }

    /**
     * 全局键盘事件 keydown（快捷键、多选Ctrl、撤销重做）
     */
    _bindKeyboardEvents() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    /**
     * 鼠标按下处理：弹窗优先、单选/框选、Ctrl多选区分
     */
    onMouseDown(event) {
        const pos = this._getMousePos(event);
        // this.fire('mousedown', { pos, rawEvent: event });

        // 弹窗碰撞检测，命中则直接操作弹窗，不处理图形
        if (this.popup && this._hitTestPopup(pos)) {
            this.fire('popup-mousedown', { pos, popup: this.popup });
            return;
        }

        // 双击判定逻辑
        const now = Date.now();
        const isDoubleClick = (
            this._clickCache.parentNode === parentStruct &&
            this._clickCache.hitNode === hitTarget &&
            this._clickCache.pos &&
            Math.abs(this._clickCache.pos.x - pos.x) < 3 &&
            Math.abs(this._clickCache.pos.y - pos.y) < 3 &&
            now - this._clickCache.time < this.DOUBLE_CLICK_DELAY
        );

        // 更新点击缓存
        this._clickCache = {
            time: now,
            pos: { ...pos },
            parentNode: parentStruct,
            hitNode: hitTarget
        };


        if (this.mode === 'preview') {
            // 预览模式：点击匹配分析路径，高亮路径节点，隐藏其余
            const hitNode = this.hitTest(pos);
            if (hitNode) this._triggerAnalysisPathByNode(hitNode);
            return;
        }

        // 编辑模式：框选逻辑
        this.isDragging = true;
        this.selectBox = { x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y };

        // Ctrl键多选：不清空选中；无Ctrl：清空原有选中
        // if (!event.ctrlKey) this.activeNodes.clear();

        // // 单点碰撞检测
        // const hitNode = this.hitTest(pos);
        // if (hitNode) this.activeNodes.add(hitNode);
        // Ctrl 多选标记
        const isCtrlMulti = event.ctrlKey;

        if (isDoubleClick) {
            // 双击分支：选中内部字段（子节点）
            if (!hitTarget) return;
            this.fire('struct-doubleclick-field',
                { fieldNode: hitTarget, structParent: parentStruct, pos }
            );
            // 执行选中字段命令
            this.selectNode(hitTarget, isCtrlMulti);
        } else {
            // 单击分支：选中整个结构体容器
            if (!parentStruct) {
                // 无父结构体，普通图形，直接选中自身
                hitTarget && this.selectNode(hitTarget, isCtrlMulti);
                return;
            }
            this.fire('struct-singleclick-whole',
                { structNode: parentStruct, fieldHit: hitTarget, pos }
            );
            // 单击只选中根结构体，忽略内部字段
            this.selectNode(parentStruct, isCtrlMulti);
        }
    }

    /**
     * 从字段子节点向上递归查找最顶层结构体容器
     * @param {Shape} node 点击命中的字段节点
     * @returns {Shape|null} 结构体容器节点
     */
    _findRootStructParent(node) {
        let current = node;
        let rootStruct = null;
        const maxDepth = 30;
        let depth = 0;

        while (current && depth < maxDepth) {
            // 约定：结构体容器标记 isStruct = true
            if (current.isStruct === true) {
                rootStruct = current;
            }
            // Shape 基类约定 getParent() 返回父容器，无父返回 null
            current = current.getParent?.() ?? null;
            depth++;
        }
        return rootStruct;
    }
    /**
     * 鼠标移动：框选更新、悬浮mouseenter/mouseleave、实时碰撞高亮
     */
    onMouseMove(event) {
        const pos = this._getMousePos(event);
        this.fire('mousemove', { pos, rawEvent: event });

        // 更新框选矩形
        if (this.isDragging && this.selectBox) {
            this.selectBox.x1 = pos.x;
            this.selectBox.y1 = pos.y;
            // RBush批量框选查询
            const boxNodes = this._getNodesBySelectBox();
            if (!event.ctrlKey) this.activeNodes.clear();
            boxNodes.forEach(node => this.activeNodes.add(node));
        }

        // 悬浮节点检测，触发mouseenter/mouseleave
        const hitNode = this.hitTest(pos);
        if (this.hoverNode !== hitNode) {
            if (this.hoverNode) {
                this.fire('node-mouseleave', { node: this.hoverNode, pos });
            }
            this.hoverNode = hitNode;
            if (hitNode) {
                this.fire('node-mouseenter', { node: hitNode, pos });
            }
        }

        // 实时刷新可见节点缓存，优化渲染
        this._updateVisibleNodes();
        this.draw();
    }

    /**
     * 鼠标抬起：结束框选、重置拖拽状态
     */
    onMouseUp(event) {
        const pos = this._getMousePos(event);
        this.fire('mouseup', { pos, rawEvent: event });
        this.isDragging = false;
        this.selectBox = null;
        this.draw();
    }

    /**
     * 滚轮缩放：以鼠标光标为中心点缩放画布
     */
    onWheelScale(event) {
        event.preventDefault();
        const pos = this._getMousePos(event);
        const zoomStep = event.deltaY > 0 ? 0.9 : 1.1;
        // 保存缩放前快照
        const oldZoom = this.zoom;
        const oldOffset = { ...this.offset };

        // 计算新缩放与偏移
        this.zoom = Math.max(0.1, Math.min(5, this.zoom * zoomStep));
        const zoomDelta = this.zoom / zoom;
        this.offset.x = pos.x - (pos.x - this.offset.x) * zoomDelta;
        this.offset.y = pos.y - (pos.y - this.offset.y) * zoomDelta;

        // 推入缩放命令栈，支持撤销重做
        const zoomCmd = new SceneScaleCommand(this, oldZoom, oldOffset, this.zoom, this.offset);
        this.pushCommand(zoomCmd);

        this._updateVisibleNodes();
        this.render();
        this.fire('zoom-change', { zoom: this.zoom, offset: this.offset });
    }

    /**
     * 键盘快捷键监听 Ctrl+Z撤销 / Ctrl+Y重做
     */
    onKeyDown(event) {
        this.fire('keydown', { key: event.key, rawEvent: event });
        // Ctrl+Z 撤销
        if (event.ctrlKey && event.key.toLowerCase() === 'z') {
            this.undo();
        }
        // Ctrl+Y 重做（修正需求Ctrl+R，R预留重置画布）
        if (event.ctrlKey && event.key.toLowerCase() === 'y') {
            this.redo();
        }
        // Ctrl+R 重置画布视图
        if (event.ctrlKey && event.key.toLowerCase() === 'r') {
            this.resetView();
        }
    }

    // 碰撞检测相关
    /**
     * 获取鼠标转换后的世界坐标(视口坐标/摄像机坐标->世界坐标)
     */
    _getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left - this.offset.x) / this.zoom;
        const y = (event.clientY - rect.top - this.offset.y) / this.zoom;
        return { x, y };
    }

    /**
     * 弹窗优先碰撞检测
     */
    _hitTestPopup(pos) {
        if (!this.popup) return false;
        return this.popup.hitTest(pos);
    }

    /**
     * 单点图形碰撞检测：返回最顶层（zIndex最高）命中节点，支持嵌套子节点
     * @param {Object} pos {x,y} 画布原始坐标
     * @returns {Shape|null} 顶层命中图形节点
     */
    hitTest(pos) {
        // 弹窗优先级最高，命中弹窗直接不拾取图形
        if (this.popup && this._hitTestPopup(pos)) return null;

        // RBush粗筛包围盒候选
        const candidates = this.rbush.search({
            minX: pos.x, minY: pos.y,
            maxX: pos.x, maxY: pos.y
        });
        // 转节点数组 + 按zIndex降序（上层先检测，先命中直接返回）
        const nodes = candidates.map(item => item.data)
            .sort((a, b) => b.zIndex - a.zIndex);

        // 遍历所有候选，递归检测自身+嵌套子节点
        for (const node of nodes) {
            const hitTarget = this._recursiveHitSingle(node, pos);
            if (hitTarget) return hitTarget;
        }
        return null;
    }

    /**
     * 单点碰撞检测：返回全部命中节点（父+所有嵌套子节点，按zIndex从高到低排序）
     * @param {Object} pos {x,y}
     * @returns {Shape[]} 命中节点列表
     */
    hitTestAll(pos) {
        const hitList = [];
        if (this.popup && this._hitTestPopup(pos)) return hitList;

        const candidates = this.rbush.search({
            minX: pos.x, minY: pos.y,
            maxX: pos.x, maxY: pos.y
        });
        const nodes = candidates.map(item => item.data)
            .sort((a, b) => b.zIndex - a.zIndex);

        for (const node of nodes) {
            this._recursiveHitCollect(node, pos, hitList);
        }
        return hitList;
    }

    /**
     * 递归查找单个命中目标（用于hitTest，找到即返回）
     * @param {Shape} node 当前检测节点
     * @param {Object} pos 鼠标坐标
     * @returns {Shape|null} 命中节点（优先最深层子节点）
     */
    _recursiveHitSingle(node, pos) {
        // 先递归检测子节点（嵌套内层优先拾取）
        const children = node.getChildren?.() ?? [];
        for (const child of children) {
            const childHit = this._recursiveHitSingle(child, pos);
            if (childHit) return childHit;
        }
        // 子节点无命中，再检测自身
        if (node.hitTest(pos)) return node;
        return null;
    }

    /**
     * 递归收集所有命中节点（用于hitTestAll）
     * @param {Shape} node
     * @param {Object} pos
     * @param {Shape[]} result 收集数组
     */
    _recursiveHitCollect(node, pos, result) {
        const children = node.getChildren?.() ?? [];
        // 先递归子节点，内层先入数组
        for (const child of children) {
            this._recursiveHitCollect(child, pos, result);
        }
        // 当前节点命中则加入列表
        if (node.hitTest(pos)) {
            result.push(node);
        }
    }

    /**
     * 框选批量查询所有包围盒内节点
     */
    _getNodesBySelectBox() {
        if (!this.selectBox) return [];
        const { x0, y0, x1, y1 } = this.selectBox;
        const minX = Math.min(x0, x1);
        const minY = Math.min(y0, y1);
        const maxX = Math.max(x0, x1);
        const maxY = Math.max(y0, y1);
        const results = this.rbush.search({ minX, minY, maxX, maxY });
        return results.map(item => item.data);
    }

    // 节点管理 & 空间索引 
    /**
     * 添加图形节点，自动更新RBush、统计、zIndex排序
     * @param {Shape} node 图形子类实例
     */
    addNode(node) {
        this.nodes.push(node);
        // RBush插入包围盒数据
        this.rbush.insert({
            minX: node.bounds.minX,
            minY: node.bounds.minY,
            maxX: node.bounds.maxX,
            maxY: node.bounds.maxY,
            data: node
        });
        // 更新分类统计
        const className = node.constructor.name;
        if (!this.nodeStat.map.has(className)) this.nodeStat.map.set(className, []);
        this.nodeStat.map.get(className).push(node);
        this.nodeStat.total += 1;
        // zIndex升序重排（底层先渲染）
        this._sortNodesByZIndex();
        this._updateVisibleNodes();
        const addCmd = new AddNodeCommand(this, node);
        this.pushCommand(addCmd);
        this.fire('node-add', { node });
    }

    /**
     * 删除节点，同步清理索引、统计、选中集合
     */
    removeNode(node) {
        this.nodes = this.nodes.filter(n => n !== node);
        this.rbush.remove(node.rbushItem, (a, b) => a.data === b.data);
        this.activeNodes.delete(node);
        this.visibleNodes.delete(node);
        // 更新统计
        const className = node.constructor.name;
        const list = this.nodeStat.map.get(className);
        if (list) this.nodeStat.map.set(className, list.filter(n => n !== node));
        this.nodeStat.total -= 1;
        this._sortNodesByZIndex();
        this.draw();
        this.fire('node-remove', { node });
    }

    /**
     * 修改当前单个选中节点的图形类型
     * @param {Class} TargetShapeCls 目标Shape子类构造函数（如 RectShape / CircleShape）
     * @param {Object} [extraProps={}] 新图形额外自定义属性
     * @returns {boolean} 是否执行成功
     */
    updateNode(TargetShapeCls, extraProps = {}) {
        // 校验：仅允许单选
        if (this.activeNodes.size !== 1) {
            this.dispatchEvent(new CustomEvent('node-type-change-fail', {
                detail: { reason: '需仅选中一个节点才可切换类型' }
            }));
            return false;
        }

        const oldNode = Array.from(this.activeNodes)[0];
        // 构造新节点，继承原节点基础属性
        const newNode = new TargetShapeCls(oldNode.id, oldNode.zIndex);
        // 复制通用几何、业务属性
        newNode.bounds = { ...oldNode.bounds };
        newNode.updateBounds();
        Object.assign(newNode, extraProps);

        // 封装类型转换命令并入栈（支持撤销重做）
        const typeChangeCmd = new UpdateNodeCommand(this, oldNode, newNode);
        this.pushCommand(typeChangeCmd);
        return true;
    }

    /**
     * 移动当前所有选中节点，自动生成移动命令支持撤销
     * @param {number} dx X偏移
     * @param {number} dy Y偏移
     * @returns {boolean} 是否存在选中节点
     */
    moveActiveNodes(dx, dy) {
        if (this.activeNodes.size === 0) return false;
        const moveCmd = new MoveNodeCommand(this, this.activeNodes, dx, dy);
        this.pushCommand(moveCmd);
        return true;
    }

    /**
     * 统一选择操作入口
     * @param {string} opType select / deselect / selectBox / clearSelect
     * @param {object} payload 参数
     */
    selectOperate(opType, payload) {
        const validOps = ['select', 'deselect', 'selectBox', 'clearSelect'];
        if (!validOps.includes(opType)) return;
        const selCmd = new SelectCommand(this, opType, payload);
        this.pushCommand(selCmd);
    }

    // 快捷别名（方便外部调用）
    // 单选节点
    selectNode(node, ctrl = false) {
        this.selectOperate('select', { node, ctrl });
    }
    // 取消单个节点选中
    deselectNode(node) {
        this.selectOperate('deselect', { node });
    }
    // 执行框选
    selectByBox(box, ctrl = false) {
        this.selectOperate('selectBox', { box, ctrl });
    }
    // 清空全部选中+取消框选
    clearAllSelect() {
        this.selectOperate('clearSelect', {});
    }

    /**
     * 按zIndex从小到大排序节点
     */
    _sortNodesByZIndex() {
        this.nodes.sort((a, b) => a.zIndex - b.zIndex);
    }

    /**
     * 更新视口可见节点缓存，仅保留画布内图形，减少渲染开销
     */
    _updateVisibleNodes() {
        this.visibleNodes.clear();
        // 转换视口到原始图形坐标
        const viewBox = {
            minX: -this.offset.x / this.zoom,
            minY: -this.offset.y / this.zoom,
            maxX: (this.canvas.width - this.offset.x) / this.zoom,
            maxY: (this.canvas.height - this.offset.y) / this.zoom
        };
        const candidates = this.rbush.search(viewBox);
        candidates.forEach(item => this.visibleNodes.add(item.data));
    }

    // 分析路径 analysisPaths
    /**
     * 新增分析路径（局部数据结构关联路径）
     * @param {string} name 路径名称
     * @param {Shape[]} nodeList 路径包含节点
     */
    addAnalysisPath(name, nodeList) {
        const nodeIds = new Set(nodeList.map(n => n.id));
        this.analysisPaths.push({ name, nodeIds, visible: false });
    }

    /**
     * 预览模式：点击节点自动匹配对应路径，高亮路径内节点，隐藏其余
     */
    _triggerAnalysisPathByNode(hitNode) {
        const matchPath = this.analysisPaths.find(path => path.nodeIds.has(hitNode.id));
        if (!matchPath) return;
        // 切换激活路径
        this.activeAnalysisPath = matchPath;
        // 标记路径可见，其余隐藏
        this.analysisPaths.forEach(p => p.visible = false);
        matchPath.visible = true;
        this.fire('analysis-path-active', { path: matchPath });
        this.draw();
    }

    // 绘制渲染模块
    /**
     * 统一渲染入口
     */
    draw() {
        const ctx = this.ctx;
        // 清空画布
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // 应用缩放平移变换
        ctx.save();
        ctx.translate(this.offset.x, this.offset.y);
        ctx.zoom(this.zoom, this.zoom);

        // 预览模式：过滤仅渲染激活路径内节点
        let drawList = Array.from(this.visibleNodes);
        if (this.mode === 'preview' && this.activeAnalysisPath) {
            drawList = drawList.filter(node => this.activeAnalysisPath.nodeIds.has(node.id));
        }

        // 绘制连线 connectNodes 底层
        this.connectNodes.forEach(line => line.draw(ctx));
        // 绘制可见图形节点
        drawList.forEach(node => {
            node.draw(ctx);
            // 选中节点描边高亮
            if (this.activeNodes.has(node)) node.drawActive(ctx);
            // 悬浮节点高亮
            if (this.hoverNode === node) node.drawHover(ctx);
        });
        // 绘制框选矩形
        if (this.isDragging && this.selectBox) this._drawSelectBox(ctx);
        // 弹窗顶层渲染（最上层）
        if (this.popup) this.popup.draw(ctx);

        ctx.restore();
    }

    /**
     * 绘制框选虚线矩形
     */
    _drawSelectBox(ctx) {
        const { x0, y0, x1, y1 } = this.selectBox;
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#2196f3';
        ctx.lineWidth = 1 / this.zoom;
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.restore();
    }

    // 命令模式 撤销/重做 
    /**
     * 推入新命令，截断重做栈
     * @param {BaseCommand} cmd 命令实例
     */
    pushCommand(cmd) {
        // 截断指针后所有重做记录
        this.commandStack.splice(this.commandPointer + 1);
        this.commandStack.push(cmd);
        // 限制最大缓存数量
        if (this.commandStack.length > 50) this.commandStack.shift();
        this.commandPointer = this.commandStack.length - 1;
        cmd.execute();
    }

    /**
     * 撤销 Ctrl+Z
     */
    undo() {
        if (this.commandPointer < 0) return;
        const cmd = this.commandStack[this.commandPointer];
        cmd.undo();
        this.commandPointer -= 1;
        this.draw();
        this.fire('undo');
    }

    /**
     * 重做 Ctrl+Y
     */
    redo() {
        if (this.commandPointer >= this.commandStack.length - 1) return;
        this.commandPointer += 1;
        const cmd = this.commandStack[this.commandPointer];
        cmd.redo();
        this.draw();
        this.fire('redo');
    }

    //  视图控制工具方法 
    /**
     * 重置画布缩放偏移到初始状态
     */
    resetView() {
        this.zoom = 1;
        this.offset = { x: 0, y: 0 };
        this._updateVisibleNodes();
        this.draw();
    }

    /**
     * 切换场景模式 edit / preview
     */
    setMode(mode) {
        if (!['edit', 'preview'].includes(mode)) return;
        this.mode = mode;
        // 切换预览模式清空选中
        if (mode === 'preview') this.activeNodes.clear();
        this.activeAnalysisPath = null;
        this.draw();
        this.fire('mode-change', { mode });
    }

    /**
     * 清空所有选中节点
     */
    clearActiveNodes() {
        this.activeNodes.clear();
        this.draw();
    }

    /**
     * 设置弹窗（全局仅一个）
     */
    setPopup(popupIns) {
        this.popup = popupIns;
        this.draw();
    }

    /**
     * 销毁管理器，解绑事件释放内存
     */
    destroy() {
        this.rbush.clear();
        this.nodes = [];
        this.connectNodes = [];
        this.analysisPaths = [];
        this.commandStack = [];
        this.canvas.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('keydown', this.onKeyDown);
    }
}

// 导出类
export default SceneManager;