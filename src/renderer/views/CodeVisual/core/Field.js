import FieldType from "./FieldType.js";
// 数据结构字段基类
export class FieldBasic extends Component{
    constructor(options = {}) {
        super(options.parent||null,[]);
        this.id = options.id || `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.name = options.name || 'field';
        this.type = options.type || FieldType.NUMBER;
        this.desc = options.desc || '';
        this.visible = options.visible || true;
        this.active = options.active || false;
        this.hovered = false;
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.width = options.width || 0;
        this.height = options.height || 0;

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
    formatName(ctx, maxWidth) {
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

    // 渲染
    doDraw(ctx) {
        if (!this.visible) return;
        
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
        
        // ctx.fillStyle = typeColor;
        // ctx.font = '9px system-ui, -apple-system, sans-serif';
        // ctx.textAlign = 'left';
        // ctx.textBaseline = 'middle';
        // ctx.fillText(typeLabel, typeX + typeWidth / 2, typeY + typeHeight / 2);
        
        // 字段名
        const nameMaxWidth = width - padding * 2 - typeWidth - padding * 2;
        const formatName = this.formatName(ctx, nameMaxWidth);
        
        ctx.fillStyle = textColor;
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatName, x + padding, y + height / 2);
        
        // 如果有描述且空间足够，显示描述
        // if (this.desc && width > 150) {
        //     const descMaxWidth = Math.min(width / 2, 120);
        //     let displayDesc = this.desc;
        //     if (ctx.measureText(displayDesc).width > descMaxWidth) {
        //         while (ctx.measureText(displayDesc + '…').width > descMaxWidth && displayDesc.length > 1) {
        //             displayDesc = displayDesc.slice(0, -1);
        //         }
        //         displayDesc += '…';
        //     }
        //     ctx.fillStyle = '#6c757d';
        //     ctx.font = '10px system-ui, -apple-system, sans-serif';
        //     ctx.textAlign = 'right';
        //     ctx.textBaseline = 'middle';
        //     ctx.fillText(displayDesc, x + width - typeWidth - padding - 4, y + height / 2);
        // }
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