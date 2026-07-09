import { Matrix } from '../utils/Matrix.js';
import { EventEmitter } from '../utils/EventEmitter.js';

export class StructBase extends EventEmitter {
    constructor(options = {}) {
        super();
        this.id = options.id || `struct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.width = options.width || 100;
        this.height = options.height || 50;
        this.transform = new Matrix();
        this.fields = [];
        this.dirty = true;
        this.visible = true;
        this.selected = false;
        this.hovered = false;
        this.zIndex = options.zIndex || 0;
        this.parent = null;
        this.children = [];
        this.connections = [];
        this.padding = options.padding || 8;
        this.title = options.title || 'Struct';
        this.titleHeight = 24;

        // 布局缓存
        this._layoutCache = null;
        this._fieldPositions = new Map();

        // 颜色主题
        this.theme = this.applyTheme('dark');
    }

    // 预设主题
    static themes = {
        light: {
            backgroundColor: '#ffffff',
            borderColor: '#4a90d9',
            titleColor: '#ffffff',
            titleBgColor: '#4a90d9',
            fieldBgColor: '#f8f9fa',
            fieldHoverColor: '#e3f2fd',
            fieldActiveColor: '#bbdefb',
            fieldTextColor: '#212529',
            fieldActiveTextColor: '#0d47a1',
            gridLineColor: '#e9ecef',
            shadowColor: 'rgba(0,0,0,0.1)'
        },
        dark: {
            backgroundColor: '#1e1e2e',
            borderColor: '#bd93f9',
            titleColor: '#f8f8f2',
            titleBgColor: '#6272a4',
            fieldBgColor: '#282a36',
            fieldHoverColor: '#44475a',
            fieldActiveColor: '#6272a4',
            fieldTextColor: '#f8f8f2',
            fieldActiveTextColor: '#ffffff',
            gridLineColor: '#44475a',
            shadowColor: 'rgba(0,0,0,0.3)'
        },
    };

    setTheme(theme) {
        // 合并主题
        this.theme = {
            ...this.theme,
            ...theme
        };
        this.markDirty();
        this.emit('themeChanged', this.theme);
        return this;
    }

    // 使用预设主题
    applyTheme(themeName) {
        const theme = this.themes[themeName];
        if (theme) {
            this.setTheme(theme);
        }
        return this;
    }

    // 添加字段
    addField(field) {
        this.fields.push(field);
        field.parent = this;
        this.markDirty();
        return this;
    }

    // 批量添加字段
    addFields(fields) {
        fields.forEach(f => this.addField(f));
        return this;
    }

    // 移除字段
    removeField(field) {
        const index = this.fields.indexOf(field);
        if (index !== -1) {
            this.fields.splice(index, 1);
            field.parent = null;
            this.markDirty();
        }
        return this;
    }

    // 标记需要重新布局
    markDirty() {
        this.dirty = true;
        this._layoutCache = null;
        this._fieldPositions.clear();
        this.emit('dirty');
        return this;
    }

    // 计算布局
    calculateLayout(ctx) {
        if (!this.dirty) return;

        const padding = this.padding;
        let maxWidth = 0;
        let totalHeight = this.titleHeight + padding * 2;
        let currentY = totalHeight;

        // 第一遍：计算最大宽度
        const visibleFields = this.fields.filter(f => f.visible && !f.collapsed);
        if (visibleFields.length > 0) {
            // 测量字段名宽度
            visibleFields.forEach(field => {
                const nameWidth = this.measureText(ctx, field.name);
                const descWidth = field.desc ? this.measureText(ctx, field.desc) : 0;
                const fieldWidth = Math.max(nameWidth, descWidth) + padding * 4;
                const maxFieldWidth = 64 * 16; // 64字符宽度
                field._cachedWidth = Math.min(fieldWidth, maxFieldWidth);
                maxWidth = Math.max(maxWidth, field._cachedWidth);
            });

            // 第二遍：计算每个字段的位置
            visibleFields.forEach((field, index) => {
                const fieldHeight = 28; // 固定行高
                field._x = padding;
                field._y = currentY;
                field._width = maxWidth;
                field._height = fieldHeight;
                field._index = index;
                this._fieldPositions.set(field.id, {
                    x: field._x,
                    y: field._y,
                    width: field._width,
                    height: field._height
                });
                currentY += fieldHeight;
            });
            totalHeight = currentY + padding;
        } else {
            // 没有可见字段时的最小高度
            totalHeight = this.titleHeight + padding * 2 + 20;
            maxWidth = Math.max(maxWidth, 80);
        }

        // 确保最小宽度
        maxWidth = Math.max(maxWidth, 120);
        this.width = maxWidth + padding * 2;
        this.height = totalHeight;
        this._layoutCache = {
            fieldStartY: this.titleHeight + padding,
            fieldHeight: 28,
            visibleFields: visibleFields
        };

        this.dirty = false;
        this.emit('layoutChanged');
    }

    // 测量文本宽度
    measureText(ctx, text) {
        if (!text) return 0;
        return ctx.measureText(text).width || text.length * 8;
    }

    // 获取字段的全局位置
    getFieldGlobalPosition(field) {
        const pos = this._fieldPositions.get(field.id);
        if (!pos) return null;
        const point = this.transform.applyToPoint({
            x: this.x + pos.x,
            y: this.y + pos.y
        });
        return { ...point, width: pos.width, height: pos.height };
    }

    // 命中测试
    hitTest(x, y) {
        if (!this.visible) return false;
        const rect = this.getBoundingRect();
        return x >= rect.x && x <= rect.x + rect.width &&
            y >= rect.y && y <= rect.y + rect.height;
    }

    // 获取边界矩形
    getBoundingRect() {
        const p1 = this.transform.applyToPoint({ x: this.x, y: this.y });
        const p2 = this.transform.applyToPoint({
            x: this.x + this.width,
            y: this.y + this.height
        });
        return {
            x: Math.min(p1.x, p2.x),
            y: Math.min(p1.y, p2.y),
            width: Math.abs(p2.x - p1.x),
            height: Math.abs(p2.y - p1.y)
        };
    }

    // 获取中心点
    getCenter() {
        const rect = this.getBoundingRect();
        return {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2
        };
    }

    // 移动
    move(dx, dy) {
        this.x += dx;
        this.y += dy;
        this.emit('moved', { dx, dy });
        this.emit('transformChanged');
        return this;
    }

    // 设置位置
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.emit('transformChanged');
        return this;
    }

    // 缩放
    scale(sx, sy, center) {
        if (center) {
            const cx = center.x || 0;
            const cy = center.y || 0;
            const newX = cx + (this.x - cx) * sx;
            const newY = cy + (this.y - cy) * sy;
            this.x = newX;
            this.y = newY;
        }
        this.width *= sx;
        this.height *= sy;
        this.markDirty();
        this.emit('transformChanged');
        return this;
    }

    // 渲染
    render(ctx, viewport) {
        if (!this.visible) return;

        // 视口裁剪优化
        if (viewport) {
            const rect = this.getBoundingRect();
            if (rect.x + rect.width < viewport.x ||
                rect.x > viewport.x + viewport.width ||
                rect.y + rect.height < viewport.y ||
                rect.y > viewport.y + viewport.height) {
                return;
            }
        }

        this.calculateLayout(ctx);
        this.draw(ctx);
        this.drawFields(ctx);
        this.drawConnections(ctx);
    }

    // 绘制主框架
    draw(ctx) {
        const rect = this.getBoundingRect();
        const { x, y, width, height } = rect;

        // 阴影
        ctx.shadowColor = this.theme.shadowColor;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

        // 主背景
        ctx.shadowColor = this.theme.shadowColor;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

        const radius = 6;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        ctx.fillStyle = this.theme.backgroundColor;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // 边框
        ctx.strokeStyle = this.selected ? '#ff6b6b' : this.theme.borderColor;
        ctx.lineWidth = this.selected ? 2.5 : 1.5;
        ctx.stroke();

        // 标题栏
        const titleY = y;
        ctx.fillStyle = this.theme.titleBgColor;
        ctx.beginPath();
        ctx.moveTo(x + radius, titleY);
        ctx.lineTo(x + width - radius, titleY);
        ctx.quadraticCurveTo(x + width, titleY, x + width, titleY + radius);
        ctx.lineTo(x + width, titleY + this.titleHeight);
        ctx.lineTo(x, titleY + this.titleHeight);
        ctx.lineTo(x, titleY + radius);
        ctx.quadraticCurveTo(x, titleY, x + radius, titleY);
        ctx.closePath();
        ctx.fill();

        // 标题文字
        ctx.fillStyle = this.theme.titleColor;
        ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.title, x + width / 2, titleY + this.titleHeight / 2);

        // 标题栏底部分隔线
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + this.titleHeight);
        ctx.lineTo(x + width, y + this.titleHeight);
        ctx.stroke();
    }

    // 绘制字段
    drawFields(ctx) {
        const rect = this.getBoundingRect();
        const { x, y, width, height } = rect;

        if (!this._layoutCache || this._layoutCache.visibleFields.length === 0) {
            // 没有字段时的提示
            ctx.fillStyle = '#adb5bd';
            ctx.font = '12px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('(empty)', x + width / 2, y + this.titleHeight + 20);
            return;
        }

        const visibleFields = this._layoutCache.visibleFields;
        const padding = this.padding;

        visibleFields.forEach(field => {
            const pos = this._fieldPositions.get(field.id);
            if (!pos) return;

            const fx = x + pos.x;
            const fy = y + pos.y;
            const fw = pos.width;
            const fh = pos.height;

            // 字段背景
            let bgColor = this.theme.fieldBgColor;
            let textColor = this.theme.fieldTextColor;

            if (field.active) {
                bgColor = this.theme.fieldActiveColor;
                textColor = this.theme.fieldActiveTextColor;
            } else if (field.hovered || field === this._hoveredField) {
                bgColor = this.theme.fieldHoverColor;
            }

            // 透明背景（只有行分隔线）
            // 仅在鼠标悬浮或激活时显示背景
            if (field.active || field.hovered || field === this._hoveredField) {
                ctx.fillStyle = bgColor;
                ctx.fillRect(fx, fy, fw, fh);
            }

            // 行分隔线
            ctx.strokeStyle = this.theme.gridLineColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(fx + padding, fy + fh);
            ctx.lineTo(fx + fw - padding, fy + fh);
            ctx.stroke();

            // 字段名
            ctx.fillStyle = textColor;
            ctx.font = '13px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            let displayName = field.name;
            const maxWidth = fw - padding * 2;
            if (ctx.measureText(displayName).width > maxWidth) {
                while (ctx.measureText(displayName + '…').width > maxWidth && displayName.length > 1) {
                    displayName = displayName.slice(0, -1);
                }
                displayName += '…';
                field._truncated = true;
            } else {
                field._truncated = false;
            }

            // 绘制字段名
            ctx.fillText(displayName, fx + padding, fy + fh / 2);

            // 如果有描述且空间足够，绘制描述
            if (field.desc) {
                const descX = fx + fw - padding;
                ctx.fillStyle = '#6c757d';
                ctx.font = '11px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';

                let displayDesc = field.desc;
                const descMaxWidth = Math.min(fw / 2, 150);
                if (ctx.measureText(displayDesc).width > descMaxWidth) {
                    while (ctx.measureText(displayDesc + '…').width > descMaxWidth && displayDesc.length > 1) {
                        displayDesc = displayDesc.slice(0, -1);
                    }
                    displayDesc += '…';
                }
                ctx.fillText(displayDesc, descX - padding, fy + fh / 2);
            }
        });
    }

    // 绘制连接线（子类重写）
    drawConnections(ctx) {
        // 由子类实现
    }

    // 获取字段在鼠标位置
    getFieldAt(x, y) {
        const rect = this.getBoundingRect();
        if (!this.hitTest(x, y)) return null;

        const localX = x - rect.x;
        const localY = y - rect.y;

        for (const [fieldId, pos] of this._fieldPositions) {
            if (localX >= pos.x && localX <= pos.x + pos.width &&
                localY >= pos.y && localY <= pos.y + pos.height) {
                const field = this.fields.find(f => f.id === fieldId);
                return field || null;
            }
        }
        return null;
    }

    // 序列化
    toJSON() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            title: this.title,
            fields: this.fields.map(f => f.toJSON()),
            selected: this.selected,
            visible: this.visible
        };
    }

    // 反序列化
    fromJSON(data) {
        this.id = data.id || this.id;
        this.x = data.x || 0;
        this.y = data.y || 0;
        this.width = data.width || 100;
        this.height = data.height || 50;
        this.title = data.title || 'Struct';
        this.selected = data.selected || false;
        this.visible = data.visible !== undefined ? data.visible : true;
        this.fields = data.fields.map(f => Field.fromJSON(f));
        this.markDirty();
        return this;
    }
}