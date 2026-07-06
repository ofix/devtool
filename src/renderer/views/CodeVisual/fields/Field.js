// fields/Field.js
export class Field {
    constructor(options = {}) {
        this.id = options.id || `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.name = options.name || 'field';
        this.type = options.type || 'string'; // 'string', 'number', 'boolean', 'object', 'array', 'pointer', 'reference'
        this.value = options.value !== undefined ? options.value : null;
        this.desc = options.desc || '';
        this.visible = options.visible !== undefined ? options.visible : true;
        this.collapsed = options.collapsed || false;
        this.active = options.active || false;
        this.hovered = false;
        this.parent = null;
        this.visibleIndex = options.visibleIndex || 0;
        this.index = options.index || 0;
        this.width = options.width || 0;
        this.height = options.height || 0;
        this.x = options.x || 0;
        this.y = options.y || 0;
        
        // 渲染相关
        this._truncated = false;
        this._fullName = options.name || 'field';
        this._cachedWidth = 0;
        
        // 类型颜色
        this.typeColors = {
            'string': '#e83e8c',
            'number': '#0d6efd',
            'boolean': '#198754',
            'object': '#6f42c1',
            'array': '#fd7e14',
            'pointer': '#dc3545',
            'reference': '#6c757d',
            'function': '#6610f2',
            'undefined': '#adb5bd',
            'null': '#adb5bd'
        };
    }

    // 获取显示名称（截断后）
    getDisplayName(ctx, maxWidth) {
        let displayName = this.name;
        if (ctx) {
            const metrics = ctx.measureText(displayName);
            if (metrics.width > maxWidth) {
                while (ctx.measureText(displayName + '…').width > maxWidth && displayName.length > 1) {
                    displayName = displayName.slice(0, -1);
                }
                displayName += '…';
                this._truncated = true;
            } else {
                this._truncated = false;
            }
        }
        return displayName;
    }

    // 获取类型颜色
    getTypeColor() {
        return this.typeColors[this.type] || '#6c757d';
    }

    // 是否基本类型
    isPrimitive() {
        return ['string', 'number', 'boolean', 'undefined', 'null'].includes(this.type);
    }

    // 是否引用类型
    isReference() {
        return ['pointer', 'reference', 'object', 'array'].includes(this.type);
    }

    // 获取完整名称（包含类型）
    getFullDisplay() {
        return `${this.name}: ${this.type}${this.value !== null ? ` = ${this.value}` : ''}`;
    }

    // 渲染
    render(ctx, x, y, width, height) {
        if (!this.visible) return;
        
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        
        // 背景
        let bgColor = '#f8f9fa';
        let textColor = '#212529';
        let borderColor = 'transparent';
        
        if (this.active) {
            bgColor = '#bbdefb';
            textColor = '#0d47a1';
            borderColor = '#4a90d9';
        } else if (this.hovered) {
            bgColor = '#e3f2fd';
        }
        
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, width, height);
        
        // 边框
        if (borderColor !== 'transparent') {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, y, width, height);
        }
        
        // 类型标签
        const typeLabel = this.type;
        const typeColor = this.getTypeColor();
        const padding = 4;
        const typeWidth = ctx.measureText(typeLabel).width + padding * 2;
        const typeX = x + width - typeWidth - padding;
        const typeY = y + padding;
        const typeHeight = height - padding * 2;
        
        ctx.fillStyle = typeColor + '20'; // 20%透明度
        ctx.strokeStyle = typeColor;
        ctx.lineWidth = 1;
        const radius = 4;
        ctx.beginPath();
        ctx.moveTo(typeX + radius, typeY);
        ctx.lineTo(typeX + typeWidth - radius, typeY);
        ctx.quadraticCurveTo(typeX + typeWidth, typeY, typeX + typeWidth, typeY + radius);
        ctx.lineTo(typeX + typeWidth, typeY + typeHeight - radius);
        ctx.quadraticCurveTo(typeX + typeWidth, typeY + typeHeight, typeX + typeWidth - radius, typeY + typeHeight);
        ctx.lineTo(typeX + radius, typeY + typeHeight);
        ctx.quadraticCurveTo(typeX, typeY + typeHeight, typeX, typeY + typeHeight - radius);
        ctx.lineTo(typeX, typeY + radius);
        ctx.quadraticCurveTo(typeX, typeY, typeX + radius, typeY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = typeColor;
        ctx.font = '9px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typeLabel, typeX + typeWidth / 2, typeY + typeHeight / 2);
        
        // 字段名
        const nameMaxWidth = width - padding * 2 - typeWidth - padding * 2;
        const displayName = this.getDisplayName(ctx, nameMaxWidth);
        
        ctx.fillStyle = textColor;
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayName, x + padding, y + height / 2);
        
        // 如果有描述且空间足够，显示描述
        if (this.desc && width > 150) {
            const descMaxWidth = Math.min(width / 2, 120);
            let displayDesc = this.desc;
            if (ctx.measureText(displayDesc).width > descMaxWidth) {
                while (ctx.measureText(displayDesc + '…').width > descMaxWidth && displayDesc.length > 1) {
                    displayDesc = displayDesc.slice(0, -1);
                }
                displayDesc += '…';
            }
            ctx.fillStyle = '#6c757d';
            ctx.font = '10px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayDesc, x + width - typeWidth - padding - 4, y + height / 2);
        }
        
        // 如果截断了，存储完整名称用于tooltip
        if (this._truncated) {
            this._tooltipText = this.name;
        }
    }

    // 命中测试
    hitTest(mx, my) {
        if (!this.visible) return false;
        return mx >= this.x && mx <= this.x + this.width &&
               my >= this.y && my <= this.y + this.height;
    }

    // 序列化
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            value: this.value,
            desc: this.desc,
            visible: this.visible,
            collapsed: this.collapsed,
            active: this.active,
            visibleIndex: this.visibleIndex,
            index: this.index
        };
    }

    // 反序列化
    static fromJSON(data) {
        return new Field({
            id: data.id,
            name: data.name,
            type: data.type,
            value: data.value,
            desc: data.desc,
            visible: data.visible,
            collapsed: data.collapsed,
            active: data.active,
            visibleIndex: data.visibleIndex,
            index: data.index
        });
    }

    // 克隆
    clone() {
        return new Field({
            name: this.name,
            type: this.type,
            value: this.value,
            desc: this.desc,
            visible: this.visible,
            collapsed: this.collapsed,
            active: this.active
        });
    }
}