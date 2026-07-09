import { EventEmitter } from '../utils/EventEmitter.js';
import { Field } from './fields/Field.js';
import { StructBase } from './core/StructBase.js';
import { StructContainer } from './core/StructContainer.js';
import { StructHierarchy } from './core/StructHierarchy.js';
import { StructLinear } from './core/StructLinear.js';
import { StructArray } from './structs/StructArray.js';
import { StructList } from './structs/StructList.js';
import { StructDblList } from './structs/StructDblList.js';
import { StructTree } from './structs/StructTree.js';
import { StructTrie } from './structs/StructTrie.js';
import { StructSet } from './structs/StructSet.js';
import { StructMap } from './structs/StructMap.js';
import { StructBST } from './structs/StructBST.js';
import { StructBTree } from './structs/StructBTree.js';
import { StructBPlusTree } from './structs/StructBPlusTree.js';
import { StructBlackRedTree } from './structs/StructBlackRedTree.js';
import { StructGraph } from './structs/StructGraph.js';
import { SpatialIndex } from './utils/SpatialIndex.js';

const DEFAULT_ZOOM_MIN = 0.1;
const DEFAULT_ZOOM_MAX = 3;
const DEFAULT_ZOOM_STEP = 0.1;

export class DataStructureVisualizer extends EventEmitter {
    constructor(canvas, options = {}) {
        super();
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.structures = [];
        this.spatialIndex = new SpatialIndex();
        this.selected = null;
        this.hovered = null;
        this.dragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.viewport = options.viewport || { x: 0, y: 0, width: canvas.width, height: canvas.height };
        this.zoom = options.zoom || 1;
        this.isRendering = false;
        this._bindHandlers = new Map(); // 存储绑定的处理器
        this.animationId = null;

        // 绑定事件
        this._bindEvents();

        // 渲染循环
        this.render = this.render.bind(this);
        this.render();
    }

    // 添加数据结构
    addStructure(structure) {
        this.structures.push(structure);
        this._updateSpatialIndex();
        structure.on('transformChanged', () => {
            this._updateSpatialIndex();
            this.render();
        });
        return this;
    }

    // 创建示例 - Linux进程控制块
    createLinuxTaskStruct() {
        const task = new StructContainer({
            title: 'task_struct',
            x: 50,
            y: 50,
            width: 300,
            height: 200,
            backgroundColor: '#f8f9fa',
            borderColor: '#0d6efd'
        });

        task.addFields([
            new Field({ name: 'pid', type: 'number', value: 1234, desc: 'Process ID' }),
            new Field({ name: 'state', type: 'string', value: 'TASK_RUNNING', desc: 'Process state' }),
            new Field({ name: 'mm', type: 'pointer', value: '0xffff8800', desc: 'Memory descriptor' }),
            new Field({ name: 'files', type: 'pointer', value: '0xffff8801', desc: 'Files descriptor' }),
            new Field({ name: 'fs', type: 'pointer', value: '0xffff8802', desc: 'Filesystem info' }),
            new Field({ name: 'sighand', type: 'pointer', value: '0xffff8803', desc: 'Signal handler' }),
            new Field({ name: 'comm', type: 'string', value: 'bash', desc: 'Command name' }),
            new Field({ name: 'parent', type: 'pointer', value: '0xffff8804', desc: 'Parent process' }),
            new Field({ name: 'children', type: 'array', value: '[0xffff8805, 0xffff8806]', desc: 'Child processes' })
        ]);

        return task;
    }

    // 更新空间索引
    _updateSpatialIndex() {
        this.spatialIndex.clear();
        this.structures.forEach(struct => {
            if (struct.visible) {
                const rect = struct.getBoundingRect();
                this.spatialIndex.insert(struct, rect);
            }
        });
    }

    // 绑定事件
    _bindEvents() {
        const handlers = {
            onMouseDown: this._onMouseDown.bind(this),
            onMouseMove: this._onMouseMove.bind(this),
            onMouseUp: this._onMouseUp.bind(this),
            onMouseLeave: this._onMouseLeave.bind(this),
            onWheel: this._onWheel.bind(this),
            onKeyDown: this._onKeyDown.bind(this)
        };

        // 存储以便后续移除
        Object.entries(handlers).forEach(([name, handler]) => {
            this._bindHandlers.set(name, handler);
        });

        this.canvas.addEventListener('mousedown', handlers.onMouseDown);
        this.canvas.addEventListener('mousemove', handlers.onMouseMove);
        this.canvas.addEventListener('mouseup', handlers.onMouseUp);
        this.canvas.addEventListener('mouseleave', handlers.onMouseLeave);
        this.canvas.addEventListener('wheel', handlers.onWheel, { passive: false });
        document.addEventListener('keydown', handlers.onKeyDown);
    }

    _onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.zoom - this.viewport.x;
        const y = (e.clientY - rect.top) / this.zoom - this.viewport.y;

        // 使用空间索引快速查找
        const candidates = this.spatialIndex.search(x, y);

        // 按z-index排序
        candidates.sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

        let selected = null;
        for (const struct of candidates) {
            if (struct.hitTest(x, y)) {
                selected = struct;
                break;
            }
        }

        if (selected) {
            this.selected = selected;
            this.dragging = true;
            const rect = selected.getBoundingRect();
            this.dragOffset.x = x - rect.x;
            this.dragOffset.y = y - rect.y;
            selected.selected = true;
            this.emit('structureSelected', selected);
            this.render();
        } else {
            this.selected = null;
            this.emit('structureDeselected');
            this.render();
        }
    }

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.zoom - this.viewport.x;
        const y = (e.clientY - rect.top) / this.zoom - this.viewport.y;

        if (this.dragging && this.selected) {
            const newX = x - this.dragOffset.x;
            const newY = y - this.dragOffset.y;
            this.selected.setPosition(newX, newY);
            this._updateSpatialIndex();
            this.render();
        } else {
            // 悬停检测
            const candidates = this.spatialIndex.search(x, y);
            let hovered = null;
            for (const struct of candidates) {
                if (struct.hitTest(x, y)) {
                    hovered = struct;
                    break;
                }
            }

            if (hovered !== this.hovered) {
                if (this.hovered) this.hovered.hovered = false;
                this.hovered = hovered;
                if (this.hovered) this.hovered.hovered = true;
                this.canvas.style.cursor = hovered ? 'pointer' : 'default';
                this.render();
            }
        }
    }

    _onMouseUp(e) {
        this.dragging = false;
    }

    _onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / this.zoom - this.viewport.x;
        const mouseY = (e.clientY - rect.top) / this.zoom - this.viewport.y;

        this.zoom *= delta;
        this.zoom = Math.max(0.1, Math.min(3, this.zoom));

        // 缩放视图以鼠标为中心
        this.viewport.x = mouseX - (e.clientX - rect.left) / this.zoom;
        this.viewport.y = mouseY - (e.clientY - rect.top) / this.zoom;

        this.render();
    }

    _onKeyDown(e) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selected) {
                const index = this.structures.indexOf(this.selected);
                if (index !== -1) {
                    this.structures.splice(index, 1);
                    this.selected = null;
                    this._updateSpatialIndex();
                    this.render();
                    this.emit('structureDeleted');
                }
            }
        }
    }

    _onMouseLeave(e) {
        if (this.hovered) {
            this.hovered.hovered = false;
            this.hovered = null;
            this.canvas.style.cursor = 'default';
            this.render();
        }
    }


    // 渲染循环
    render() {
        if (this.isRendering) return;
        this.isRendering = true;

        requestAnimationFrame(() => {
            try {
                this._render();
            } catch (error) {
                console.error('Render error:', error);
            } finally {
                this.isRendering = false;
            }
        });
    }

    // 平移
    pan(dx, dy) {
        this.viewport.x += dx / this.zoom;
        this.viewport.y += dy / this.zoom;
        this._invalidateCache();
        this.render();
    }

    // 缩放（以鼠标为中心）
    zoomAt(mouseX, mouseY, delta) {
        const zoomFactor = delta > 0 ? 1.1 : 0.9;
        const newZoom = Math.max(0.1, Math.min(3, this.zoom * zoomFactor));
        
        // 计算鼠标在世界坐标的位置
        const worldX = mouseX / this.zoom + this.viewport.x;
        const worldY = mouseY / this.zoom + this.viewport.y;
        
        this.zoom = newZoom;
        
        // 保持鼠标位置不变
        this.viewport.x = worldX - mouseX / this.zoom;
        this.viewport.y = worldY - mouseY / this.zoom;
        
        this._invalidateCache();
        this.render();
    }

    // 重置视口
    fitView() {
        if (this.structures.length === 0) {
            this.viewport.x = 0;
            this.viewport.y = 0;
            this.zoom = 1;
            return;
        }
        
        // 计算所有结构体的包围盒
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        this.structures.forEach(struct => {
            if (!struct.visible) return;
            const rect = struct.getBoundingRect();
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.width);
            maxY = Math.max(maxY, rect.y + rect.height);
        });
        
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = 50;
        
        // 计算合适的缩放
        const scaleX = (this.viewport.width - padding * 2) / width;
        const scaleY = (this.viewport.height - padding * 2) / height;
        this.zoom = Math.min(scaleX, scaleY);
        this.zoom = Math.max(0.1, Math.min(3, this.zoom));
        
        // 居中
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        this.viewport.x = centerX - this.viewport.width / 2 / this.zoom;
        this.viewport.y = centerY - this.viewport.height / 2 / this.zoom;
        
        this._invalidateCache();
        this.render();
    }

    // 渲染
    _render() {
        const ctx = this.ctx;
        const canvas = this.canvas;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 正确的变换顺序：先缩放再平移
        ctx.save();
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.viewport.x, -this.viewport.y);

        // 渲染所有结构
        this.structures.forEach(struct => {
            if (struct.visible) {
                struct.render(ctx, this.viewport);
            }
        });

        ctx.restore();

        this._renderInfo(ctx);
    }

    // 渲染信息
    _renderInfo(ctx) {
        ctx.fillStyle = '#6c757d';
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const info = [
            `Structures: ${this.structures.length}`,
            `Zoom: ${(this.zoom * 100).toFixed(0)}%`,
            `Selected: ${this.selected ? this.selected.title || 'Unknown' : 'None'}`
        ];

        info.forEach((text, index) => {
            ctx.fillText(text, 10, 10 + index * 20);
        });

        // 如果有选中的结构，显示其信息
        if (this.selected) {
            ctx.fillStyle = '#0d6efd';
            ctx.font = '11px system-ui, -apple-system, sans-serif';
            const rect = this.selected.getBoundingRect();
            const infoText = `Position: (${rect.x.toFixed(1)}, ${rect.y.toFixed(1)}) Size: ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}`;
            ctx.fillText(infoText, 10, 70);
        }
    }

    // 清空
    clear() {
        this.structures = [];
        this.spatialIndex.clear();
        this.selected = null;
        this.hovered = null;
        this.render();
    }

    // 导出为JSON
    exportJSON() {
        return JSON.stringify(this.structures.map(s => s.toJSON()));
    }

    // 从JSON导入
    importJSON(json) {
        try {
            const data = JSON.parse(json);
            if (!Array.isArray(data)) {
                throw new Error('Invalid JSON format: expected array');
            }

            this.clear();
            data.forEach(structData => {
                try {
                    const struct = new StructContainer();
                    struct.fromJSON(structData);
                    this.addStructure(struct);
                } catch (error) {
                    console.warn('Failed to import structure:', error);
                }
            });
            this.render();
        } catch (error) {
            console.error('Import failed:', error);
            throw new Error('Failed to import JSON: ' + error.message);
        }
    }

    destroy() {
        // 清理事件监听
        this._bindHandlers.forEach((handler, name) => {
            if (name === 'onKeyDown') {
                document.removeEventListener('keydown', handler);
            } else if (name === 'onWheel') {
                this.canvas.removeEventListener('wheel', handler);
            } else {
                this.canvas.removeEventListener(
                    name.replace('on', '').toLowerCase(),
                    handler
                );
            }
        });
        this._bindHandlers.clear();

        // 清理资源
        this.clear();
        this.emit('destroyed');
    }
}

// 导出所有类
export {
    Field,
    StructBase,
    StructContainer,
    StructLinear,
    StructHierarchy,
    StructArray,
    StructList,
    StructDblList,
    StructTree,
    StructTrie,
    StructSet,
    StructMap,
    StructBST,
    StructBTree,
    StructBPlusTree,
    StructBlackRedTree,
    StructGraph,
    SpatialIndex,
    DataStructureVisualizer
};