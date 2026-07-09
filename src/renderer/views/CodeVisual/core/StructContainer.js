import { StructBase } from './StructBase.js';

export class StructContainer extends StructBase {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Container';
        this.children = options.children || [];
        this.showTitle = options.showTitle !== undefined ? options.showTitle : true;
        this.borderColor = options.borderColor || '#4a90d9';
        this.backgroundColor = options.backgroundColor || '#ffffff';
        
        // 容器特有属性
        this.collapsible = options.collapsible || false;
        this.collapsed = options.collapsed || false;
        this.expandButtonSize = 20;
    }

    addChild(child) {
        this.children.push(child);
        child.parent = this;
        this.markDirty();
        return this;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child.parent = null;
            this.markDirty();
        }
        return this;
    }

    calculateLayout(ctx) {
        if (!this.dirty) return;
        
        // 先计算子节点布局
        this.children.forEach(child => {
            if (child.calculateLayout) {
                child.calculateLayout(ctx);
            }
        });
        
        // 然后计算自身布局
        super.calculateLayout(ctx);
        
        // 更新子节点位置（如果使用相对布局）
        if (this._layoutMode === 'horizontal') {
            this._layoutHorizontal(ctx);
        } else if (this._layoutMode === 'vertical') {
            this._layoutVertical(ctx);
        }
    }

    _layoutHorizontal(ctx) {
        let offsetX = this.padding;
        const maxHeight = 0;
        this.children.forEach(child => {
            child.x = offsetX;
            child.y = this.padding + this.titleHeight;
            offsetX += child.width + this.padding;
        });
        this.width = offsetX + this.padding;
        this.height = Math.max(this.titleHeight + this.padding * 2 + maxHeight, 80);
    }

    _layoutVertical(ctx) {
        let offsetY = this.titleHeight + this.padding;
        this.children.forEach(child => {
            child.x = this.padding;
            child.y = offsetY;
            offsetY += child.height + this.padding;
        });
        this.height = offsetY + this.padding;
        this.width = Math.max(this.width, 120);
    }

    draw(ctx) {
        if (this.collapsed) {
            this.drawCollapsed(ctx);
            return;
        }
        super.draw(ctx);
        this.drawChildren(ctx);
    }

    drawCollapsed(ctx) {
        const rect = this.getBoundingRect();
        const { x, y, width, height } = rect;
        
        ctx.fillStyle = this.theme.backgroundColor;
        ctx.strokeStyle = this.theme.borderColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, width, height);
        
        ctx.fillStyle = this.theme.titleBgColor;
        ctx.fillRect(x, y, width, this.titleHeight);
        
        ctx.fillStyle = this.theme.titleColor;
        ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`▶ ${this.title} (${this.children.length} items)`, x + width / 2, y + this.titleHeight / 2);
    }

    drawChildren(ctx) {
        this.children.forEach(child => {
            if (child.render) {
                child.render(ctx);
            }
        });
    }

    toggleCollapse() {
        this.collapsed = !this.collapsed;
        this.markDirty();
        this.emit('collapseChanged', this.collapsed);
        return this;
    }

    hitTest(x, y) {
        if (!this.visible) return false;
        // 检查子节点
        for (let i = this.children.length - 1; i >= 0; i--) {
            if (this.children[i].hitTest(x, y)) {
                return this.children[i];
            }
        }
        return super.hitTest(x, y);
    }
}