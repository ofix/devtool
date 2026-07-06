// index.js
import { Field } from './fields/Field.js';
import { StructBase } from './core/StructBase.js';
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

// 主应用类
export class DataStructureVisualizer {
    constructor(canvas, options = {}) {
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
        this.animationId = null;
        
        // 绑定事件
        this._bindEvents();
        
        // 渲染循环
        this.renderLoop = this.renderLoop.bind(this);
        this.renderLoop();
    }

    // 添加数据结构
    addStructure(structure) {
        this.structures.push(structure);
        this._updateSpatialIndex();
        structure.on('transformChanged', () => {
            this._updateSpatialIndex();
            this.renderLoop();
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
        const canvas = this.canvas;
        
        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
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
                this.renderLoop();
            } else {
                this.selected = null;
                this.emit('structureDeselected');
                this.renderLoop();
            }
        });
        
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.zoom - this.viewport.x;
            const y = (e.clientY - rect.top) / this.zoom - this.viewport.y;
            
            if (this.dragging && this.selected) {
                const newX = x - this.dragOffset.x;
                const newY = y - this.dragOffset.y;
                this.selected.setPosition(newX, newY);
                this._updateSpatialIndex();
                this.renderLoop();
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
                    this.renderLoop();
                }
            }
        });
        
        canvas.addEventListener('mouseup', () => {
            this.dragging = false;
        });
        
        canvas.addEventListener('mouseleave', () => {
            if (this.hovered) {
                this.hovered.hovered = false;
                this.hovered = null;
                this.canvas.style.cursor = 'default';
                this.renderLoop();
            }
        });
        
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selected) {
                    const index = this.structures.indexOf(this.selected);
                    if (index !== -1) {
                        this.structures.splice(index, 1);
                        this.selected = null;
                        this._updateSpatialIndex();
                        this.renderLoop();
                        this.emit('structureDeleted');
                    }
                }
            }
        });
        
        // 滚轮缩放
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const rect = canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) / this.zoom - this.viewport.x;
            const mouseY = (e.clientY - rect.top) / this.zoom - this.viewport.y;
            
            this.zoom *= delta;
            this.zoom = Math.max(0.1, Math.min(3, this.zoom));
            
            // 缩放视图以鼠标为中心
            this.viewport.x = mouseX - (e.clientX - rect.left) / this.zoom;
            this.viewport.y = mouseY - (e.clientY - rect.top) / this.zoom;
            
            this.renderLoop();
        });
    }

    // 渲染循环
    renderLoop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.animationId = requestAnimationFrame(() => {
            this.render();
            this.animationId = null;
        });
    }

    // 渲染
    render() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        
        // 清空画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 应用变换
        ctx.save();
        ctx.translate(-this.viewport.x * this.zoom, -this.viewport.y * this.zoom);
        ctx.scale(this.zoom, this.zoom);
        
        // 渲染所有结构
        this.structures.forEach(struct => {
            struct.render(ctx, this.viewport);
        });
        
        ctx.restore();
        
        // 渲染信息
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
        this.renderLoop();
    }

    // 导出为JSON
    exportJSON() {
        return JSON.stringify(this.structures.map(s => s.toJSON()));
    }

    // 从JSON导入
    importJSON(json) {
        const data = JSON.parse(json);
        this.clear();
        data.forEach(structData => {
            const struct = new StructContainer();
            struct.fromJSON(structData);
            this.addStructure(struct);
        });
        this.renderLoop();
    }
}

// 示例使用
export function createDemo() {
    const canvas = document.getElementById('canvas');
    const app = new DataStructureVisualizer(canvas);
    
    // 创建Linux task_struct示例
    const task = app.createLinuxTaskStruct();
    app.addStructure(task);
    
    // 创建数组示例
    const array = new StructArray({
        title: 'Array',
        x: 400,
        y: 50,
        layoutMode: 'vertical'
    });
    for (let i = 0; i < 5; i++) {
        const element = new StructContainer({
            title: `[${i}]`,
            width: 60,
            height: 35,
            backgroundColor: '#f8f9fa',
            borderColor: '#6c757d'
        });
        element.addField(new Field({ name: `data[${i}]`, type: 'number', value: i * 10 }));
        array.addChild(element);
    }
    app.addStructure(array);
    
    // 创建链表示例
    const list = new StructList({
        title: 'Linked List',
        x: 50,
        y: 280,
        maxNodes: 5,
        nodeSpacing: 30
    });
    for (let i = 0; i < 4; i++) {
        const node = new StructContainer({
            title: `Node ${i + 1}`,
            width: 80,
            height: 45,
            backgroundColor: '#e7f3ff',
            borderColor: '#0d6efd'
        });
        node.addField(new Field({ name: `data`, type: 'number', value: i + 1 }));
        node.addField(new Field({ name: `next`, type: 'pointer', value: `0x${(i + 2).toString(16)}` }));
        list.addChild(node);
    }
    app.addStructure(list);
    
    // 创建BST示例
    const bst = new StructBST({
        title: 'BST',
        x: 400,
        y: 280,
        maxDepth: 3
    });
    bst.buildBST([50, 30, 70, 20, 40, 60, 80]);
    app.addStructure(bst);
    
    // 创建图示例
    const graph = new StructGraph({
        title: 'Graph',
        x: 700,
        y: 280,
        maxNodes: 6
    });
    for (let i = 0; i < 5; i++) {
        graph.addNode({ label: `V${i + 1}` });
    }
    graph.addEdge(0, 1, 5);
    graph.addEdge(0, 2, 3);
    graph.addEdge(1, 2, 2);
    graph.addEdge(1, 3, 4);
    graph.addEdge(2, 3, 1);
    graph.addEdge(3, 4, 6);
    app.addStructure(graph);
    
    return app;
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