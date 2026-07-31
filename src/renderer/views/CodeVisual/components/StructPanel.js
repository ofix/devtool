import Component from "./Component.js"
import FieldType from "./FieldType.js";

/**
 * 功能特性
 * 1. 支持隐藏字段，连续隐藏的字段，合并显示为一个单元格
 * 2. 指针类型字段右侧有圆圈，支持拖拽连接线
 * 3. 支持面板整体折叠和展开
 * 4. Alt+F可以一键将隐藏字段打开
 * 5. 支持字段计数(总字段数目|隐藏字段)
 * 6. 支持选中
 **/
class StructPanel extends Component {
    constructor(options = {}) {
        super(options.parent || null, options.children || []);
        this.type = 'table';
        // 数据
        this.children = options.children || []; // 原始字段集合
        this.visibleChildren = []; // 合并隐藏字段或者折叠Union字段后的所有字段缓存

        // 状态
        this.expandedFields = new Set(options.expandedFields || []); // union 字段才会展开和折叠
        this.highlightedFields = new Set(options.highlightedFields || []);
        this.hiddenFields = new Set(options.hiddenFields || []); // 用户手动隐藏的字段
        this.fieldColors = new Map(options.fieldColors || []); // 自定义颜色覆盖
        this.fieldBytes = new Map(); // 每个字段占用的字节数

        // 统计
        this.totalBytes = 0; // 所有字段占用的字节总数
        this.totalFieldsCount = this.children.length;
        this.hiddenFieldsCount = this.hiddenFields.length;

        // 折叠状态
        this.collapsed = options.collapsed || false; // 自身的折叠状态
        this.mergeHiddenFields = options.mergeHiddenFields || false;
        this.selected = false; // 当前是否选中


        // 拖拽状态
        this.isDragging = false;
        this.draggingStartX = 0;
        this.draggingWidth = 0;
        this.isHoveringRightEdge = false;

        // 按钮映射
        this._buttonMap = new Map();
        // 指针或者引用的按钮
        this.pointerBtnMap = new Map();

        // 编辑状态
        this.editingField = null;

        // 主题监听
        this.themeListener = this._onThemeChange.bind(this);
        themeManager.onChange(this.themeListener);

        // 计算尺寸
        this._updateDimensions();
    }

    measureCollapsedHeight() {
        let referenceFields = 0;
        for (let i = 0; i < this.children.length; i++) {
            referenceFields += 1;
        }
        return (referenceFields + 1) * 18;
    }

    /**
     * 获取当前主题
     */
    getTheme() {
        return themeManager.getCurrentTheme();
    }

    // 计算节点高度（后续遍历）
    measureHeight(node) {
        // 叶子节点或折叠节点
        if (node.collapsed) {
            return node.collapsedHeight;
        }

        // 有子节点：递归计算子节点高度
        if (node.children && node.children.length > 0) {
            let childrenHeight = 0;
            for (const child of node.children) {
                if (child.isVisible) { // 只有节点可见的时候才计算对应节点的高度
                    childrenHeight += this.measureHeight(child);
                }
            }
            // 缓存计算结果供布局使用
            node.height = node.headerHeight + childrenHeight;
            return node.height;
        }

        // 普通叶子节点
        return node.height;
    }

    // 计算并设置宽度（前序遍历）
    setNodeWidth(node, containerWidth) {
        // 设置当前节点宽度
        node.width = containerWidth;

        // 如果有子节点且展开，递归设置子节点宽度
        if (node.children && node.children.length > 0) {
            if (node.isCollapsible && node.collapsed) {
                node.Width = containerWidth;
                return; // 折叠状态不处理子节点
            }

            // 子节点可以使用相同宽度或减去缩进
            const childContainerWidth = containerWidth - (node.indent || 0);
            for (const child of node.children) {
                this.setNodeWidth(child, childContainerWidth);
            }
        }
    }

    // 布局函数：只负责设置坐标（前序遍历）
    doLayout(node, currentIndent = 0) {
        let y = 0;

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            // 设置坐标
            child.x = currentIndent;
            child.y = y;

            // 计算当前节点占用的总高度（使用缓存值）
            y += child.height;

            // 递归布局子节点（如果展开）
            if (!child.collapsed) {
                this.doLayout(child, currentIndent + 20);
            }
        }
    }

    layout() {
        // 后续遍历所有节点，获取面板高度
        this.measureHeight(this);
        // 前序遍历设置子元素相对父容器位置
        this.doLayout(this);
    }

    /**
     * 主题变化回调
     */
    _onThemeChange(theme) {
        this._markDirty();
        if (this._canvas) {
            this._canvas.doDraw();
        }
        this.fire('themeChanged', { theme });
    }

    //  交互检测
    doHitTest(localX, localY) {
        // 检查右边框拖拽
        if (this._rightEdgeHandle) {
            const handle = this._rightEdgeHandle;
            if (localX >= handle.x && localX <= handle.x + handle.width &&
                localY >= handle.y && localY <= handle.y + handle.height) {
                return { type: 'resize_table', handle };
            }
        }

        // 检查列宽调整手柄
        if (this._resizeHandles) {
            for (const [column, rect] of Object.entries(this._resizeHandles)) {
                if (localX >= rect.x && localX <= rect.x + rect.width &&
                    localY >= rect.y && localY <= rect.y + rect.height) {
                    return { type: 'resize_column', column, rect };
                }
            }
        }

        // 检查折叠按钮
        if (this._collapseButton) {
            const btn = this._collapseButton;
            if (localX >= btn.x && localX <= btn.x + btn.width &&
                localY >= btn.y && localY <= btn.y + btn.height) {
                return { type: 'toggle_collapse' };
            }
        }

        if (this.collapsed) return null;

        // 检查展开/折叠按钮
        for (const [fieldId, btnRect] of this._buttonMap) {
            if (localX >= btnRect.x && localX <= btnRect.x + btnRect.width &&
                localY >= btnRect.y && localY <= btnRect.y + btnRect.height) {
                return { type: 'toggle_field', fieldId };
            }
        }

        // 检查隐藏组
        if (this._hiddenGroupMap) {
            for (const [fieldId, rect] of this._hiddenGroupMap) {
                if (localX >= rect.x && localX <= rect.x + rect.width &&
                    localY >= rect.y && localY <= rect.y + rect.height) {
                    return { type: 'show_hidden_group', fieldId, hiddenFields: rect.hiddenFields };
                }
            }
        }

        // 检查圆圈
        for (const [fieldId, circleRect] of this.pointerBtnMap) {
            if (localX >= circleRect.x && localX <= circleRect.x + circleRect.width &&
                localY >= circleRect.y && localY <= circleRect.y + circleRect.height) {
                return { type: 'click_circle', fieldId };
            }
        }

        // 检查字段行
        const field = this._getFieldAtPoint(localX, localY);
        if (field) {
            return { type: 'click_field', fieldId: field.id, field };
        }

        return null;
    }

    // 绘制
    doDraw(ctx, tansform = new Matrix()) {
        if (this.collapsed) {
            this.doDrawCollapsed(ctx);
            return;
        }

        this.drawBorder(); // 绘制面板边框
        this.drawFieldBorders(); // 绘制每个Field的分割线，用于拖拽操作
        this.drawHeader(ctx); // 绘制结构体面板顶部标题栏
        // 调用children让其绘制自身
        for (let child of this.children) {
            if (child.isVisible()) {
                child.draw(ctx, level); // 传入层级0
            }
        }
    }

    //  绘制表头
    drawHeader(ctx, x, y, w) {
        const theme = this.getTheme();
        const tableStyle = theme.table;
        const elements = theme.elements;
        const font = theme.font;
        const spacing = theme.spacing;

        const height = this.headerHeight;
        const padding = spacing.cellPadding;
        const nameWidth = this.nameWidth;
        const valueWidth = this.maxCellWidth;
        const actionWidth = this.actionWidth;

        // 背景
        ctx.fillStyle = tableStyle.headerBg;
        ctx.fillRect(x, y, w, height);

        // 折叠按钮
        this._drawCollapseButton(ctx, x, y, w, height, false);

        // 标题
        ctx.fillStyle = tableStyle.headerText;
        ctx.font = `bold ${font.headerSize}px ${font.family}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.name || '数据结构', x + 30, y + height / 2);

        // 统计信息
        const total = this.visibleFieldsCount;
        const hidden = this.getHiddenFieldCount();
        const visible = total - hidden;
        ctx.fillStyle = '#888';
        ctx.font = `${font.size * 0.8}px ${font.family}`;
        ctx.textAlign = 'right';
        ctx.fillText(`共 ${total} 字段 | 显示 ${visible} | 隐藏 ${hidden}`, w - 10, y + height / 2);

        // 列标题
        ctx.fillStyle = tableStyle.headerText;
        ctx.font = `bold ${font.size * 0.9}px ${font.family}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('字段', x + padding + 10, y + height / 2);
        ctx.fillText('值', nameEndX + padding + 5, y + height / 2);
        ctx.fillText('操作', valueEndX + padding + 5, y + height / 2);
    }

    // 绘制结构体面板
    drawBorder(ctx) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.width, this.y);
        ctx.restore();
    }

    /**
     * 递归批量绘制Field单元格边框（仅底边）
     * @param {Context2D} ctx Canvas 2D画布绘制上下文
     * @param {number} parentAbsX 父容器累计全局X偏移
     * @param {number} parentAbsY 父容器累计全局Y偏移
     */
    drawFieldBorders(ctx, parentAbsX, parentAbsY) {
        const w = this.width;
        for (const field of this.children) {
            if (!field.isVisible()) {
                continue;
            }
            // 当前Field全局坐标
            const absX = parentAbsX + field.x;
            const absY = parentAbsY + field.y;
            const h = field.height;

            // ----------------------
            // 绘制单元格单边边框: 底
            // ----------------------
            ctx.beginPath();
            // 顶部横线
            ctx.moveTo(absX, absY + h);
            ctx.lineTo(absX + w, absY + h);
            ctx.stroke();
            // ----------------------
            // 递归绘制子Field
            // ----------------------
            const childBaseX = absX + field.padding;
            const childBaseY = absY + field.padding;
            if (field.type == FieldType.UNION || field.type == FieldType.PANEL) {
                // 绘制标题栏
                const h = field.getHeaderHeight();
            }
            this.drawFieldBorders(field.children, childBaseX, childBaseY);
        }
    }

    // 绘制折叠状态 
    _drawCollapsed(ctx) {
        const theme = this.getTheme();
        const tableStyle = theme.table;
        const font = theme.font;

        const x = 0;
        const y = 0;
        const w = this.width;
        const h = this.height;

        ctx.fillStyle = tableStyle.headerBg;
        ctx.fillRect(x, y, w, h);

        this._drawCollapseButton(ctx, x, y, w, h, true);

        ctx.fillStyle = tableStyle.headerText;
        ctx.font = `bold ${font.headerSize}px ${font.family}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.name, x + 30, y + h / 2);

        this._drawStatistics();

        ctx.strokeStyle = tableStyle.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
    }

    /**
     * 绘制带圆圈的文字
     * @param {CanvasRenderingContext2D} ctx - Canvas上下文
     * @param {Object} options - 配置选项
     * @param {number} options.x - 圆心X坐标
     * @param {number} options.y - 圆心Y坐标
     * @param {string} options.text - 显示的文字
     * @param {string} options.color - 圆圈颜色
     * @param {number} options.radius - 圆圈半径（默认8）
     * @param {number} options.fontSize - 字体大小（默认由radius计算）
     * @param {string} options.fontFamily - 字体
     * @param {string} options.textColor - 文字颜色（默认白色）
     * @param {number} options.shadowBlur - 阴影模糊（默认4）
     * @param {string} options.align - 对齐方式 'left' | 'right' | 'center'
     * @param {number} options.offsetX - X偏移
     * @param {number} options.offsetY - Y偏移
     * @param {Function} options.onDraw - 额外绘制回调
     * @returns {Object} { circleX, circleY, width } 绘制位置和宽度
     */
    drawCircleText(ctx, options) {
        const {
            x,
            y,
            text,
            color,
            radius = 8,
            fontSize,
            fontFamily = 'monospace',
            textColor = '#ffffff',
            shadowBlur = 4,
            align = 'center',
            offsetX = 0,
            offsetY = 0,
        } = options;

        const cx = x + offsetX;
        const cy = y + offsetY;
        const fs = fontSize || radius * 1.2;

        // 绘制圆圈阴影
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = shadowBlur;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();

        // 额外绘制（如斜线、图标等）
        if (onDraw) {
            ctx.save();
            onDraw(ctx, cx, cy, radius);
            ctx.restore();
        }

        // 绘制文字
        ctx.save();
        ctx.fillStyle = textColor;
        ctx.font = `bold ${fs}px ${fontFamily}`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, cy + 1);
        ctx.restore();

        return { circleX: cx, circleY: cy };
    }

    _drawStatistics(ctx, x, y, w, height) {
        const font = themeManager.getFontConfig();
        const total = this.getTotalFieldCount();
        const hidden = this.getHiddenFieldCount();
        const visible = total - hidden;

        const padding = this.cellPadding;
        const radius = 8;
        const circleY = y + height / 2;

        // 从右向左布局
        let currentX = w - padding - 10;

        // 1. 可见字段（绿色）
        const visibleText = String(visible);
        const visibleWidth = ctx.measureText(visibleText).width;
        const visibleX = currentX - visibleWidth - radius - 6;

        drawCircleText(ctx, {
            x: visibleX,
            y: circleY,
            text: visibleText,
            color: '#4CAF50',
            radius: radius,
            fontFamily: font.family,
            shadowBlur: 6
        });

        currentX = visibleX - radius - 8;

        // 2. 分隔符
        ctx.save();
        ctx.fillStyle = '#555';
        ctx.font = `${radius * 0.7}px ${font.family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('|', currentX, circleY);
        ctx.restore();

        currentX -= 10;

        // 3. 隐藏字段（红色）
        const hiddenText = String(hidden);
        const hiddenWidth = ctx.measureText(hiddenText).width;
        const hiddenX = currentX - hiddenWidth - radius - 6;

        drawCircleText(ctx, {
            x: hiddenX,
            y: circleY,
            text: hiddenText,
            color: hidden > 0 ? '#F44336' : '#666',
            radius: radius,
            fontFamily: font.family,
            shadowBlur: hidden > 0 ? 6 : 0,
            onDraw: hidden > 0 ? (ctx, cx, cy, r) => {
                ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(cx - r * 0.6, cy - r * 0.6);
                ctx.lineTo(cx + r * 0.6, cy + r * 0.6);
                ctx.stroke();
            } : null
        });

        currentX = hiddenX - radius - 15;

        // 4. 总计
        ctx.save();
        ctx.fillStyle = '#888';
        ctx.font = `${radius * 0.8}px ${font.family}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`共${total}`, currentX, circleY);
        ctx.restore();
    }

    hitTest(mouseX, mouseY) {
        if (mouseX >= (this.x + this.width - 2) && mouseX <= (this.x + this.width + 2
            && mouseY >= this.y && mouseY <= this.y + this.height)
        ) {
            return this;
        }
        for (let i = 0; i < this.children.length; i++) {
            let hitted = this.children[i].hitTest(mouseX, mouseY);
            if (hitted) {
                return hitted;
            }
        }
        return null;
    }

    //  工具方法
    _truncateText(text, maxWidth) {
        const font = themeManager.getFontConfig();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `${font.size}px ${font.family}`;

        if (ctx.measureText(text).width <= maxWidth) {
            return text;
        }

        let left = 0;
        let right = text.length;
        let result = text;

        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            const substr = text.substring(0, mid);
            if (ctx.measureText(substr + '...').width <= maxWidth) {
                result = substr + '...';
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        return result;
    }

    _measureText(text) {
        const font = this.themeManager.getFontConfig();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `${font.size}px ${font.family}`;
        return ctx.measureText(text).width;
    }

    /**
     * 开始拖拽调整
     */
    onDragStart(data, startX) {
        this.isDragging = true;
        this.draggingStartX = startX;
        this.draggingWidth = this.width;
        this.fire('table:dragStart', { data });
    }

    /**
     * 更新拖拽
     */
    onDragging(currentX) {
        if (!this.isDragging) return;

        const deltaX = currentX - this.draggingStartX;
        const newWidth = Math.max(
            this.minTableWidth,
            Math.min(this.maxTableWidth, this.draggingWidth + deltaX)
        );
        // 按比例调整各列
        const ratio = newWidth / this.draggingWidth;
        this._updateDimensions();
        this._markDirty();
        this.fire('table:dragging', {
            width: newWidth
        });
    }

    /**
     * 结束拖拽调整
     */
    onDragEnd() {
        if (this.isDragging) {
            this.isDragging = false;
            this.fire('table:dragEnd', {
                widths: this.columnWidths,
                tableWidth: this.width
            });
        }
    }

    toJSON() {
        return {
            ...super.toJSON(),
            children: this.children,
            expandedFields: Array.from(this.expandedFields),
            highlightedFields: Array.from(this.highlightedFields),
            hiddenFields: Array.from(this.hiddenFields),
            fieldColors: Array.from(this.fieldColors.entries()),
            collapsed: this.collapsed,
            mergeHiddenFields: this.mergeHiddenFields,
        };
    }

    fromJSON(data) {
        super.fromJSON(data);
        this.children = data.children || [];
        this.expandedFields = new Set(data.expandedFields || []);
        this.highlightedFields = new Set(data.highlightedFields || []);
        this.hiddenFields = new Set(data.hiddenFields || []);
        this.fieldColors = new Map(data.fieldColors || []);
        this.collapsed = data.collapsed || false;
        this.mergeHiddenFields = data.mergeHiddenFields || false;
        this._updateDimensions();
        return this;
    }
}

export default StructPanel;
