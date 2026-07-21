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
        this.visibleFields = []; // 合并隐藏字段或者折叠Union字段后的所有字段缓存

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
        this.collapsed = options.collapsed || false;
        this.mergeHiddenFields = options.mergeHiddenFields || false;
        this.selected = false; // 当前是否选中


        // 拖拽状态
        this.isDragging = false;
        // this._resizeType = null;
        // this._resizeColumn = null;
        this.draggingStartX = 0;
        this.draggingWidth = 0;
        this._hoverResizeColumn = null;
        this._isHoveringRightEdge = false;

        // 按钮映射
        this._buttonMap = new Map();
        // 指针或者引用的按钮
        this.pointerBtnMap = new Map();
        this._resizeHandles = {};
        this._rightEdgeHandle = null;
        this._collapseButton = null;

        // 编辑状态
        this._editingField = null;
        this._editingInput = null;

        // 主题监听
        this._themeListener = this._onThemeChange.bind(this);
        themeManager.onChange(this._themeListener);

        // 计算尺寸
        this._updateDimensions();
    }

    //  列宽管理 
    setColumnWidth(column, width) {
        const clampedWidth = Math.max(this.minColumnWidth, Math.min(this.maxColumnWidth, width));
        this.columnWidths[column] = clampedWidth;
        this._updateDimensions();
        this._markDirty();
        this.fire('columnWidthChanged', { column, width: clampedWidth });
        return this;
    }

    getColumnWidth(column) {
        return this.columnWidths[column] || 100;
    }

    setTableWidth(width) {
        const clampedWidth = Math.max(this.minTableWidth, Math.min(this.maxTableWidth, width));
        // 调整列宽比例
        const ratio = clampedWidth / this.width;
        for (const col of ['name', 'value', 'action']) {
            this.columnWidths[col] = Math.max(
                this.minColumnWidth,
                Math.min(this.maxColumnWidth, this.columnWidths[col] * ratio)
            );
        }
        this._updateDimensions();
        this._markDirty();
        this.fire('tableWidthChanged', { width: clampedWidth });
        return this;
    }

    autoFitColumns() {
        let maxNameWidth = 60;
        for (const field of this.children) {
            const nameWidth = this._measureText(this._getDisplayName(field));
            maxNameWidth = Math.max(maxNameWidth, nameWidth);
        }

        let maxValueWidth = 80;
        for (const field of this.children) {
            const value = field.value !== undefined ? String(field.value) : 'null';
            const valueWidth = this._measureText(value);
            maxValueWidth = Math.max(maxValueWidth, valueWidth);
        }

        this.columnWidths.name = Math.min(Math.max(maxNameWidth + 40, 80), 300);
        this.columnWidths.value = Math.min(Math.max(maxValueWidth + 40, 100), 500);

        this._updateDimensions();
        this._markDirty();
        this.fire('columnsAutoFitted');
        return this;
    }

    getCollapsedHeight() {
        let referenceFields = 0;
        for (let i = 0; i < this.children.length; i++) {
            referenceFields += 1;
        }
        return (referenceFields + 1) * 18;
    }

    // 尺寸更新
    _updateDimensions() {
        if (this.collapsed) {
            this.height = this.getCollapsedHeight();
            return;
        }

        const visibleFields = this.getVisibleFields();
        const displayFields = this.mergeHiddenFields ?
            this._mergeHiddenFields(visibleFields) : visibleFields;

        let totalRows = 1;
        for (const field of displayFields) {
            totalRows += this._getDisplayRows(field);
        }

        this.height = this.headerHeight + totalRows * this.rowHeight;

        // 使用配置的列宽
        this.nameWidth = this.columnWidths.name;
        this.maxCellWidth = this.columnWidths.value;
        this.actionWidth = this.columnWidths.action || 40;

        // 总宽度
        this.width = this.nameWidth + this.maxCellWidth + this.actionWidth + this.cellPadding * 4;
        this.width = Math.max(this.width, this.minTableWidth);
        this.width = Math.min(this.width, this.maxTableWidth);
    }

    /**
     * 获取当前主题
     */
    getTheme() {
        return themeManager.getCurrentTheme();
    }

    /**
     * 获取表格样式（快捷方法）
     */
    getTableStyle() {
        return themeManager.getTableStyle();
    }

    /**
     * 获取字段颜色
     */
    getFieldColor(field) {
        return themeManager.getFieldColor(field, this.fieldColors);
    }

    /**
     * 是否为指针/引用
     */
    isPointerOrReference(field) {
        return themeManager.isPointerOrReference(field);
    }

    /**
     * 获取指针颜色
     */
    getPointerColor(field) {
        return themeManager.getPointerColor(field);
    }

    // 重新布局，获取面板真实高度
    doLayout(parent, currentIndent = 0) {
        let y = 0; // 当前父内部垂直起始基线
        for (let i = 0; i < parent.children.lengthh; i++) {
            let child = parent.children[i];
            // 水平坐标赋值为层级缩进
            child.x = currentIndent;
            child.y = y;

            // 获取当前子节点实际占用高度
            const childRenderH = calcNodeHeight(child) - child.margin.bottom - child.margin.top;
            // 基线增加当前节点高度+间距，下一个节点往下排
            y += childRenderH + child.margin.top + child.margin.bottom;

            // 递归排布子节点内部：
            // 可折叠且收起 → 不递归内部子节点
            if (child.isCollapsible && child.collapsed) continue;
            // 普通节点 / 展开的折叠节点 → 继续递归排布内部子组件
            // 子层级缩进增加一层步长
            this.doLayout(child, currentIndent + 20);
        }
    }

    calcNodeHeight(node) {
        // 1.可折叠节点
        if (node.isCollapsible) {
            if (node.collapsed) {
                // 折叠状态：只算标题高度
                return node.margin.top + node.collapsedHeight + node.margin.bottom;
            }
            // 展开状态：先递归所有子节点，累加总高度
            let childSum = 0;
            for (const child of node.children) {
                childSum += this.calcNodeHeight(child);
            }
            // 缓存展开总高，供布局使用
            node.height = node.headerHeight + childSum;
            return node.margin.top + node.height + node.margin.bottom;
        }

        // 2.普通节点总高度 = 自身内容高度 + 上边距+ 下边距
        return node.margin.top + node.height + node.margin.bottom;
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

    _mergeHiddenFields(children) {
        if (!this.mergeHiddenFields) return children;

        const result = [];
        let hiddenGroup = [];
        let hiddenGroupId = 0;

        const flushGroup = () => {
            if (hiddenGroup.length === 0) return;

            result.push({
                id: `hg_${hiddenGroupId++}`,
                name: `隐藏字段 (${hiddenGroup.length})`,  // 统一命名风格
                type: FieldType.HIDDEN_GROUP,  // 只保留一个 type
                count: hiddenGroup.length,
                children: [...hiddenGroup]
            });
            hiddenGroup = [];
        };

        for (let i = 0; i < children.length; i++) {
            let field = children[i];
            if (this.hiddenFields.has(field.id)) {
                hiddenGroup.push(field);
            } else {
                flushGroup();
                result.push(field);
            }
        }

        flushGroup(); // 处理最后剩余的隐藏字段

        return result;
    }

    getVisibleFields() {
        if (this.mergeHiddenFields) {
            if (this.visibleFields.length > 0) {
                return this.visibleFields;
            }
            this.visibleFields = this._mergeHiddenFields(this.children);
            return this.visibleFields;
        }
        return this.children;
    }

    // 绘制
    doDraw(ctx) {
        const theme = this.getTheme();
        const tableStyle = theme.table;
        const highlightStyle = theme.highlight;
        const expandedStyle = theme.expanded;
        const elements = theme.elements;
        const font = theme.font;
        const spacing = theme.spacing;

        if (this.collapsed) {
            this.doDrawCollapsed(ctx);
            return;
        }

        this.drawBorder(); // 绘制面板边框
        this.drawFieldBorders(); // 绘制每个Field的分割线，用于拖拽操作
        this.drawHeader(ctx); // 绘制结构体面板顶部标题栏
        // 调用children让其绘制自身
        for(let child of this.children){
            if(child.isVisible()){
                child.doDraw(ctx,0); // 传入层级0
            }
        }
    }

    _drawHiddenFields(ctx, field, x, y, w, rowIndex) {
        const rowHeight = this.rowHeight;
        const padding = this.cellPadding;

        // 背景
        ctx.fillStyle = this.hiddenColor;
        ctx.fillRect(x, y, w, rowHeight);

        // 边框
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y + rowHeight);
        ctx.lineTo(x + w, y + rowHeight);
        ctx.stroke();

        // 显示隐藏信息
        ctx.fillStyle = '#888';
        ctx.font = `italic ${this.fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const text = `🔒 ${field.hiddenCount} 个隐藏字段 (点击展开)`;
        ctx.fillText(text, x + padding + 20, y + rowHeight / 2);

        // 统计显示隐藏字段数量
        ctx.fillStyle = '#666';
        ctx.font = `${this.fontSize * 0.8}px ${this.fontFamily}`;
        ctx.textAlign = 'right';
        ctx.fillText(`+${field.hiddenCount}`, w - padding, y + rowHeight / 2);

        // 保存点击区域
        this._hiddenGroupMap = this._hiddenGroupMap || new Map();
        this._hiddenGroupMap.set(field.id, {
            x: x,
            y: y,
            width: w,
            height: rowHeight,
            fieldId: field.id,
            hiddenFields: field._hiddenFields
        });

        return y + rowHeight;
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
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }

    /**
     * 递归批量绘制Field单元格边框（仅底边）
     * @param {Context2D} ctx Canvas 2D画布绘制上下文
     * @param {number} parentAbsX 父容器累计全局X偏移
     * @param {number} parentAbsY 父容器累计全局Y偏移
     */
    drawFieldBorders(ctx, parentAbsX, parentAbsY) {
        for (const field of this.children) {
            if (!field.isVisible()) {
                continue;
            }
            // 当前Field全局坐标
            const absX = parentAbsX + field.x;
            const absY = parentAbsY + field.y;
            const w = field.width;
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
            this.drawFieldBorders(field.children, childBaseX, childBaseY);
        }
    }



    // 绘制字段行 
    _drawField(
        ctx, field, x, y, w, rowIndex,
        indentLevel, isExpanded, isHighlighted,
        isPointer, color
    ) {
        const theme = this.getTheme();
        const config = this.getConfig();
        const tableStyle = theme.table;
        const highlightStyle = theme.highlight;
        const expandedStyle = theme.expanded;
        const elements = theme.elements;
        const font = theme.font;
        const spacing = config.spacing;

        const rowHeight = config.rowHeight;
        const padding = spacing.cellPadding;
        const nameWidth = config.nameWidth;
        const maxCellWidth = config.maxCellWidth;
        const indent = indentLevel * config.indentSize;
        const circleRadius = config.circleRadius;

        // 背景
        if (isHighlighted) {
            ctx.fillStyle = highlightStyle.bg;
        } else if (isExpanded) {
            ctx.fillStyle = expandedStyle.bg;
        } else if (field.frozen) {
            ctx.fillStyle = tableStyle.frozenBg;
        } else if (this.hiddenFields.has(field.id)) {
            ctx.fillStyle = tableStyle.hiddenBg;
        } else {
            ctx.fillStyle = tableStyle.rowBg; // rowIndex % 2 === 0 ? tableStyle.rowBg : tableStyle.rowAltBg;
        }
        ctx.fillRect(x, y, w, rowHeight);

        // 行边框
        ctx.strokeStyle = tableStyle.border;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y + rowHeight);
        ctx.lineTo(x + w, y + rowHeight);
        ctx.stroke();

        // 高亮边框
        if (isHighlighted) {
            ctx.strokeStyle = highlightStyle.border;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, w - 2, rowHeight - 2);
        }

        // 颜色标记
        if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x + padding, y + 4, 3, rowHeight - 8);
        }

        // 字段名
        const nameX = x + padding + indent + 6;
        const nameY = y + rowHeight / 2;
        const nameWidthActual = nameWidth - indent - padding * 2 - 10;

        ctx.fillStyle = field.frozen ? '#888' : tableStyle.text;
        ctx.font = `${font.size}px ${font.family}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const displayName = this._getDisplayName(field);
        const truncatedName = this._truncateText(displayName, nameWidthActual);
        ctx.fillText(truncatedName, nameX, nameY);

        // 类型标记
        if (field.type && !field._isHiddenGroup) {
            const typeX = nameX + this._measureText(truncatedName) + 8;
            ctx.fillStyle = '#888';
            ctx.font = `${font.size * font.typeSize}px ${font.family}`;
            ctx.fillText(`(${field.type})`, typeX, nameY);
        }

        // 值
        const valueX = x + nameWidth + padding * 3;
        const valueWidth = maxCellWidth - padding * 2;
        const valueY = y + rowHeight / 2;

        ctx.fillStyle = field.frozen ? '#888' : tableStyle.text;
        ctx.font = `${font.size}px ${font.family}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        let displayValue = field.value !== undefined ? String(field.value) : 'null';
        if (field.children && field.children.length > 0 && !field._isHiddenGroup) {
            displayValue = `{${this.getVisibleFields(field.children).length} 个子字段}`;
        }
        const truncatedValue = this._truncateText(displayValue, valueWidth - (isPointer ? 20 : 0));
        ctx.fillText(truncatedValue, valueX, valueY);

        // 指针/引用标记
        if (isPointer) {
            const circleX = valueX + valueWidth - 10;
            const circleY = y + rowHeight / 2;
            const pointerColor = this.getPointerColor(field);

            ctx.save();
            ctx.shadowColor = pointerColor;
            ctx.shadowBlur = 8;

            ctx.beginPath();
            ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
            ctx.fillStyle = pointerColor;
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
            ctx.stroke();

            this.pointerBtnMap.set(field.id, {
                x: circleX - circleRadius,
                y: circleY - circleRadius,
                width: circleRadius * 2,
                height: circleRadius * 2,
                fieldId: field.id
            });
        }

        // 展开/折叠按钮
        if (field.children && field.children.length > 0 && !field._isHiddenGroup) {
            const btnX = x + nameWidth + maxCellWidth + padding * 2;
            const btnY = y + rowHeight / 2;
            const btnSize = 16;

            ctx.fillStyle = isExpanded ? elements.expandButtonBg : elements.collapseButtonDefault;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(btnX - btnSize / 2, btnY - btnSize / 2, btnSize, btnSize, 3);
            } else {
                ctx.rect(btnX - btnSize / 2, btnY - btnSize / 2, btnSize, btnSize);
            }
            ctx.fill();

            ctx.fillStyle = elements.collapseButtonText;
            ctx.font = `${btnSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isExpanded ? '−' : '+', btnX, btnY + 1);

            this._buttonMap.set(field.id, {
                x: btnX - btnSize / 2,
                y: btnY - btnSize / 2,
                width: btnSize,
                height: btnSize,
                fieldId: field.id
            });
        }

        return y + rowHeight;
    }



    //  绘制右边框拖拽手柄 
    _drawRightEdgeHandle(ctx, x, y, w, h) {
        const theme = this.getTheme();
        const elements = theme.elements;
        const spacing = theme.spacing;

        const handleSize = spacing.resizeHandleSize * 2;
        const isActive = this.isDragging;
        const isHover = this._isHoveringRightEdge;

        const handleX = x + w - handleSize / 2;
        ctx.fillStyle = isActive ? elements.resizeHandleActive :
            isHover ? 'rgba(255,255,255,0.3)' : elements.resizeHandle;
        ctx.fillRect(handleX - handleSize / 2, y + 4, handleSize, h - 8);

        this._rightEdgeHandle = {
            x: handleX - handleSize / 2,
            y: y + 4,
            width: handleSize,
            height: h - 8,
            lineX: x + w
        };
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

    //  绘制折叠按钮 
    _drawCollapseButton(ctx, x, y, w, height, isCollapsed) {
        const theme = this.getTheme();
        const elements = theme.elements;

        const btnSize = 16;
        const btnX = x + 8;
        const btnY = y + (height - btnSize) / 2;

        this._collapseButton = { x: btnX, y: btnY, width: btnSize, height: btnSize };

        ctx.fillStyle = elements.collapseButtonBg;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(btnX, btnY, btnSize, btnSize, 3);
        } else {
            ctx.rect(btnX, btnY, btnSize, btnSize);
        }
        ctx.fill();

        ctx.fillStyle = elements.collapseButtonText;
        ctx.font = `${btnSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isCollapsed ? '▶' : '▼', btnX + btnSize / 2, btnY + btnSize / 2 + 1);
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

    //  鼠标事件处理（拖拽） 
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

    //  鼠标移动检测（更新悬停状态） 
    updateHover(localX, localY) {
        // 检查是否悬停在列分隔线上
        let hoverColumn = null;
        for (const [column, rect] of Object.entries(this._resizeHandles)) {
            if (localX >= rect.x && localX <= rect.x + rect.width &&
                localY >= rect.y && localY <= rect.y + rect.height) {
                hoverColumn = column;
                break;
            }
        }
        this._hoverResizeColumn = hoverColumn;

        // 检查是否悬停在右边框
        let hoverRightEdge = false;
        if (this._rightEdgeHandle) {
            const handle = this._rightEdgeHandle;
            if (localX >= handle.x && localX <= handle.x + handle.width &&
                localY >= handle.y && localY <= handle.y + handle.height) {
                hoverRightEdge = true;
            }
        }
        this._isHoveringRightEdge = hoverRightEdge;

        // 更新光标
        if (this._canvas) {
            if (hoverColumn || hoverRightEdge) {
                this._canvas.canvas.style.cursor = 'col-resize';
            } else if (!this.isDragging) {
                this._canvas.canvas.style.cursor = 'default';
            }
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
