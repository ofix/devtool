// structs/StructGraph.js
import { StructBase } from '../core/StructBase.js';
import { StructContainer } from '../core/StructContainer.js';

export class StructGraph extends StructBase {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Graph';
        this.maxNodes = options.maxNodes || 10;
        this.nodes = [];
        this.edges = [];
        this.connectionColor = options.connectionColor || '#6c757d';
        this.directed = options.directed || false;
        this.nodeSpacing = options.nodeSpacing || 100;
        this.layoutAlgorithm = options.layoutAlgorithm || 'force'; // 'force', 'circular', 'grid'
    }

    // 添加节点
    addNode(data) {
        if (this.nodes.length >= this.maxNodes) {
            throw new Error(`Graph size exceeds maximum (${this.maxNodes})`);
        }
        
        const node = new StructContainer({
            title: data.label || `Node ${this.nodes.length + 1}`,
            width: 60,
            height: 40,
            backgroundColor: data.color || '#e7f3ff',
            borderColor: '#0d6efd'
        });
        node.x = data.x || Math.random() * 400;
        node.y = data.y || Math.random() * 300;
        this.nodes.push(node);
        this.markDirty();
        return this;
    }

    // 添加边
    addEdge(fromIndex, toIndex, weight = null) {
        if (fromIndex < 0 || fromIndex >= this.nodes.length ||
            toIndex < 0 || toIndex >= this.nodes.length) {
            throw new Error('Invalid node index');
        }
        this.edges.push({ from: fromIndex, to: toIndex, weight });
        this.markDirty();
        return this;
    }

    // 计算布局
    calculateLayout(ctx) {
        if (!this.dirty) return;
        
        if (this.layoutAlgorithm === 'force') {
            this._forceDirectedLayout();
        } else if (this.layoutAlgorithm === 'circular') {
            this._circularLayout();
        } else {
            this._gridLayout();
        }
        
        super.calculateLayout(ctx);
    }

    _forceDirectedLayout() {
        const iterations = 100;
        const repulsion = 1000;
        const attraction = 0.01;
        const damping = 0.9;
        
        for (let iter = 0; iter < iterations; iter++) {
            // 计算斥力
            for (let i = 0; i < this.nodes.length; i++) {
                for (let j = i + 1; j < this.nodes.length; j++) {
                    const dx = this.nodes[j].x - this.nodes[i].x;
                    const dy = this.nodes[j].y - this.nodes[i].y;
                    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
                    const force = repulsion / (dist * dist);
                    const fx = force * dx / dist;
                    const fy = force * dy / dist;
                    this.nodes[i]._vx = (this.nodes[i]._vx || 0) - fx * damping;
                    this.nodes[i]._vy = (this.nodes[i]._vy || 0) - fy * damping;
                    this.nodes[j]._vx = (this.nodes[j]._vx || 0) + fx * damping;
                    this.nodes[j]._vy = (this.nodes[j]._vy || 0) + fy * damping;
                }
            }
            
            // 计算引力
            for (const edge of this.edges) {
                const from = this.nodes[edge.from];
                const to = this.nodes[edge.to];
                if (!from || !to) continue;
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const dist = Math.sqrt(dx * dx + dy * dy) + 1;
                const force = attraction * dist;
                const fx = force * dx / dist;
                const fy = force * dy / dist;
                from._vx = (from._vx || 0) + fx;
                from._vy = (from._vy || 0) + fy;
                to._vx = (to._vx || 0) - fx;
                to._vy = (to._vy || 0) - fy;
            }
            
            // 更新位置
            for (const node of this.nodes) {
                node.x += (node._vx || 0);
                node.y += (node._vy || 0);
                // 边界约束
                node.x = Math.max(10, Math.min(400, node.x));
                node.y = Math.max(10, Math.min(300, node.y));
                // 阻尼
                node._vx = (node._vx || 0) * 0.8;
                node._vy = (node._vy || 0) * 0.8;
            }
        }
    }

    _circularLayout() {
        const centerX = 200;
        const centerY = 150;
        const radius = Math.min(centerX, centerY) - 50;
        const count = this.nodes.length;
        
        this.nodes.forEach((node, index) => {
            const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
        });
    }

    _gridLayout() {
        const cols = Math.ceil(Math.sqrt(this.nodes.length));
        const spacing = 80;
        
        this.nodes.forEach((node, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            node.x = 50 + col * spacing;
            node.y = 50 + row * spacing;
        });
    }

    drawConnections(ctx) {
        for (const edge of this.edges) {
            const from = this.nodes[edge.from];
            const to = this.nodes[edge.to];
            if (!from || !to) continue;
            
            const fromRect = from.getBoundingRect();
            const toRect = to.getBoundingRect();
            
            const startX = fromRect.x + fromRect.width / 2;
            const startY = fromRect.y + fromRect.height / 2;
            const endX = toRect.x + toRect.width / 2;
            const endY = toRect.y + toRect.height / 2;
            
            ctx.strokeStyle = edge.weight ? '#28a745' : this.connectionColor;
            ctx.lineWidth = edge.weight ? 3 : 2;
            ctx.setLineDash([]);
            
            // 贝塞尔曲线连接
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const offset = 30;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(
                midX + offset * (Math.random() - 0.5),
                midY + offset * (Math.random() - 0.5),
                endX, endY
            );
            ctx.stroke();
            
            // 边权重标签
            if (edge.weight !== null) {
                const labelX = (startX + endX) / 2;
                const labelY = (startY + endY) / 2 - 15;
                ctx.fillStyle = '#28a745';
                ctx.font = '12px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`[${edge.weight}]`, labelX, labelY);
            }
            
            // 有向图箭头
            if (this.directed) {
                const angle = Math.atan2(endY - startY, endX - startX);
                const arrowSize = 10;
                ctx.fillStyle = this.connectionColor;
                ctx.beginPath();
                ctx.moveTo(endX, endY);
                ctx.lineTo(
                    endX - arrowSize * Math.cos(angle - 0.4),
                    endY - arrowSize * Math.sin(angle - 0.4)
                );
                ctx.lineTo(
                    endX - arrowSize * Math.cos(angle + 0.4),
                    endY - arrowSize * Math.sin(angle + 0.4)
                );
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    render(ctx, viewport) {
        super.render(ctx, viewport);
        // 渲染节点
        this.nodes.forEach(node => {
            if (node.render) {
                node.render(ctx);
            }
        });
    }

    // 获取所有相邻节点
    getNeighbors(nodeIndex) {
        const neighbors = [];
        this.edges.forEach(edge => {
            if (edge.from === nodeIndex) neighbors.push(edge.to);
            if (edge.to === nodeIndex && !this.directed) neighbors.push(edge.from);
        });
        return neighbors;
    }

    // 邻接矩阵
    getAdjacencyMatrix() {
        const n = this.nodes.length;
        const matrix = Array.from({ length: n }, () => Array(n).fill(0));
        this.edges.forEach(edge => {
            matrix[edge.from][edge.to] = 1;
            if (!this.directed) matrix[edge.to][edge.from] = 1;
        });
        return matrix;
    }
}