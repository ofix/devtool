import Shape from "./Shape.js";
import FieldType from "./FieldType.js";

/**
 * ListCtrl - 基于 Canvas 的列表控制器
 * 支持虚拟滚动、点击交互、隐藏字段组折叠
 */
class ListCtrl extends Shape {
    constructor(options = {}) {
        super(options);

        // 基础配置 
        this.rowHeight = options.rowHeight || 32;
        this.cellPadding = options.cellPadding || 8;
        this.fontSize = options.fontSize || 14;
        this.fontFamily = options.fontFamily || 'Arial, sans-serif';

        // 颜色配置 
        this.colors = {
            backgroundColor: options.backgroundColor || '#ffffff',
            textColor: options.textColor || '#333333',
            borderColor: options.borderColor || '#e0e0e0',
            hoverColor: options.hoverColor || '#f5f5f5',
            selectedColor: options.selectedColor || '#e3f2fd',
            headerColor: options.headerColor || '#fafafa',
            evenRowColor: options.evenRowColor || '#ffffff',
            oddRowColor: options.oddRowColor || '#fafafa'
        };

        // 数据 
        this.fields = options.fields || [];

        // 状态 
        this.scrollOffset = 0;
        this.selectedIndex = -1;
        this.hoveredIndex = -1;

        // 点击区域缓存 
        this._clickableRegions = new Map();
        this._regionsDirty = true;

        this.visibleRowStart = 0; // 可见的列表起始行
        this.visibleRowEnd = 0; // 可见的列表结束行
        this.totalRows = 0; // 总共多少行
        this.selectedIndex = -1; // 当前选中行下标
        this.showList = false; // 默认不展开列表
        // 列表数据
        this.items = options.items || []; // 列表数据行

        //  事件回调 
        this.onListItemClick = options.onListItemClick || null;
        this.onFieldDoubleClick = options.onFieldDoubleClick || null;
        this.onHiddenGroupToggle = options.onHiddenGroupToggle || null;
        this.onSelectionChange = options.onSelectionChange || null;

        //  渲染缓存 
        this._cachedFields = null;

        //  鼠标事件绑定 
        this._bindEvents();
    }

    //  数据管理 

    /**
     * 设置数据
     */
    setData(fields, hiddenFields = []) {
        this.fields = fields || [];
        this.hiddenFields = new Set(hiddenFields);
        this._dataVersion++;
        this._regionsDirty = true;
        this._cachedFields = null;
        this.scrollOffset = 0;
        this.render();
    }

    /**
     * 更新隐藏字段
     */
    setHiddenFields(hiddenFields) {
        this.hiddenFields = new Set(hiddenFields);
        this._dataVersion++;
        this._regionsDirty = true;
        this._cachedFields = null;
        this.render();
    }

    /**
     * 切换隐藏字段组展开状态
     */
    toggleGroup(groupId) {
        if (this.expandedGroups.has(groupId)) {
            this.expandedGroups.delete(groupId);
        } else {
            this.expandedGroups.add(groupId);
        }
        this._regionsDirty = true;
        this.render();

        if (this.onHiddenGroupToggle) {
            this.onHiddenGroupToggle(groupId, this.expandedGroups.has(groupId));
        }
    }

    /**
     * 获取合并后的字段列表
     */
    getMergedFields() {
        if (!this.mergeHiddenFields) return this.fields;

        // 检查缓存
        if (this._cachedFields && this._cacheVersion === this._dataVersion) {
            return this._cachedFields;
        }

        const result = [];
        let hiddenGroup = [];
        let hiddenGroupId = 0;

        const flushGroup = () => {
            if (hiddenGroup.length === 0) return;

            // 检查是否已展开
            const groupId = `hg_${hiddenGroupId}`;
            const isExpanded = this.expandedGroups.has(groupId);

            result.push({
                id: groupId,
                name: `隐藏字段 (${hiddenGroup.length})`,
                type: FieldType.HIDDEN_GROUP,
                count: hiddenGroup.length,
                children: [...hiddenGroup],
                _isExpanded: isExpanded,
                _hiddenFields: hiddenGroup
            });
            hiddenGroupId++;
            hiddenGroup = [];
        };

        for (const field of this.fields) {
            if (this.hiddenFields.has(field.id)) {
                hiddenGroup.push(field);
            } else {
                flushGroup();
                result.push(field);
            }
        }
        flushGroup();

        // 缓存结果
        this._cachedFields = result;
        this._cacheVersion = this._dataVersion;

        return result;
    }

    /**
     * 获取可见字段列表（展开隐藏组）
     */
    getVisibleFields() {
        const merged = this.getMergedFields();
        const result = [];

        for (const field of merged) {
            if (field.type === FieldType.HIDDEN_GROUP && field._isExpanded) {
                // 展开隐藏组，显示子字段
                result.push(...field.children);
            } else {
                result.push(field);
            }
        }

        return result;
    }

    HitTest(worldX, worldY){
        // 检查是否在矩形内
        // 如果展开了，检查选中那几行了
    }

    /**
     * 主渲染方法
     */
    render() {
        const ctx = this.ctx;
        if (!ctx) return;

        const width = this.width;
        const height = this.height;

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        // 绘制背景
        ctx.fillStyle = this.colors.backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // 获取数据
        const fields = this.getMergedFields();
        if (!fields || fields.length === 0) {
            this._drawEmptyState(ctx, width, height);
            return;
        }

        // 计算可见范围（虚拟滚动）
        const startIndex = Math.floor(this.scrollOffset / this.rowHeight);
        const visibleCount = Math.ceil(height / this.rowHeight) + 1;
        const endIndex = Math.min(startIndex + visibleCount, fields.length);

        // 绘制表头
        this._drawHeader(ctx, width);

        // 计算起始Y位置
        const headerHeight = this.rowHeight;
        const startY = headerHeight - (this.scrollOffset % this.rowHeight);

        // 更新点击区域（只在脏时更新）
        if (this._regionsDirty) {
            this._clickableRegions.clear();
            this._regionsDirty = false;
        }

        // 绘制可见行
        let currentY = startY;
        for (let i = startIndex; i < endIndex; i++) {
            const field = fields[i];
            const y = currentY;
            const x = 0;
            const w = width;

            // 绘制行
            this._drawRow(ctx, field, i, x, y, w);

            // 更新点击区域
            if (field.type === FieldType.HIDDEN_GROUP) {
                this._clickableRegions.set(field.id, {
                    x: x,
                    y: y,
                    width: w,
                    height: this.rowHeight,
                    fieldId: field.id,
                    field: field,
                    index: i
                });
            }

            currentY += this.rowHeight;
        }

        // 绘制滚动条
        this._drawScrollbar(ctx, width, height, fields.length);
    }

    /**
     * 绘制空状态
     */
    _drawEmptyState(ctx, width, height) {
        ctx.fillStyle = '#999';
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('暂无数据', width / 2, height / 2);
    }

    /**
     * 绘制表头
     */
    _drawHeader(ctx, width) {
        const y = 0;

        ctx.fillStyle = this.colors.headerColor;
        ctx.fillRect(0, y, width, this.rowHeight);

        ctx.strokeStyle = this.colors.borderColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y + this.rowHeight);
        ctx.lineTo(width, y + this.rowHeight);
        ctx.stroke();

        ctx.fillStyle = this.colors.textColor;
        ctx.font = `bold ${this.fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('字段列表', this.cellPadding, y + this.rowHeight / 2);
    }

    /**
     * 绘制行
     */
    _drawRow(ctx, field, index, x, y, w) {
        const rowHeight = this.rowHeight;
        const isSelected = index === this.selectedIndex;
        const isHovered = index === this.hoveredIndex;
        const isHiddenGroup = field.type === FieldType.HIDDEN_GROUP;

        // 行背景
        let bgColor = index % 2 === 0 ? this.colors.evenRowColor : this.colors.oddRowColor;
        if (isSelected) bgColor = this.colors.selectedColor;
        else if (isHovered) bgColor = this.colors.hoverColor;

        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, w, rowHeight);

        // 边框
        ctx.strokeStyle = this.colors.borderColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y + rowHeight);
        ctx.lineTo(x + w, y + rowHeight);
        ctx.stroke();

        // 根据类型绘制不同内容
        if (isHiddenGroup) {
            this._drawHiddenGroup(ctx, field, x, y, w);
        } else {
            this._drawField(ctx, field, x, y, w);
        }
    }

    /**
     * 绘制普通字段
     */
    _drawField(ctx, field, x, y, w) {
        const padding = this.cellPadding;

        // 字段名
        ctx.fillStyle = this.colors.textColor;
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const name = field.name || field.id || '未命名';
        ctx.fillText(name, x + padding, y + this.rowHeight / 2);

        // 类型标签
        if (field.type) {
            ctx.fillStyle = '#999';
            ctx.font = `${this.fontSize * 0.8}px ${this.fontFamily}`;
            ctx.textAlign = 'right';
            const typeLabel = typeof field.type === 'string' ? field.type : 'unknown';
            ctx.fillText(typeLabel, x + w - padding, y + this.rowHeight / 2);
        }
    }

    /**
     * 绘制隐藏组
     */
    _drawHiddenGroup(ctx, field, x, y, w) {
        const padding = this.cellPadding;
        const rowHeight = this.rowHeight;
        const isExpanded = field._isExpanded;

        // 背景色
        ctx.fillStyle = this.colors.hiddenColor;
        ctx.fillRect(x, y, w, rowHeight);

        // 展开/折叠图标
        const iconX = x + padding;
        const iconY = y + rowHeight / 2;
        ctx.fillStyle = '#666';
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isExpanded ? '▼' : '▶', iconX, iconY);

        // 标题
        ctx.textAlign = 'left';
        ctx.fillStyle = '#888';
        ctx.font = `italic ${this.fontSize}px ${this.fontFamily}`;
        const text = `🔒 ${field.count} 个隐藏字段 ${isExpanded ? '(已展开)' : '(点击展开)'}`;
        ctx.fillText(text, x + padding + 24, y + rowHeight / 2);

        // 数量标签
        ctx.textAlign = 'right';
        ctx.fillStyle = '#999';
        ctx.font = `${this.fontSize * 0.8}px ${this.fontFamily}`;
        ctx.fillText(`+${field.count}`, x + w - padding, y + rowHeight / 2);
    }

    /**
     * 绘制滚动条
     */
    _drawScrollbar(ctx, width, height, totalRows) {
        const totalHeight = totalRows * this.rowHeight;
        if (totalHeight <= height) return;

        const scrollbarWidth = 8;
        const scrollbarHeight = height * (height / totalHeight);
        const scrollbarY = (this.scrollOffset / (totalHeight - height)) * (height - scrollbarHeight);
        const scrollbarX = width - scrollbarWidth - 4;

        // 滚动条轨道
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.roundRect(scrollbarX, 4, scrollbarWidth, height - 8, 4);
        ctx.fill();

        // 滚动条滑块
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.roundRect(scrollbarX, scrollbarY + 4, scrollbarWidth, scrollbarHeight, 4);
        ctx.fill();
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        if (!this.canvas) return;
        this.on('mousemove',this._onMouseMove.bind(this));
        this.on('mouseleave',this._onMouseLeave.bind(this));
        this.on('click',this._onClick.bind(this));
        this.on('dblclick',this._onDoubleClick.bind(this));
        this.on('wheel',this._onWheel.bind(this));
    }

    /**
     * 鼠标移动事件
     */
    _onMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // 检测悬停
        let found = -1;
        const fields = this.getMergedFields();
        const headerHeight = this.rowHeight;
        const startIndex = Math.floor(this.scrollOffset / this.rowHeight);
        const visibleCount = Math.ceil(this.height / this.rowHeight) + 1;

        for (let i = startIndex; i < startIndex + visibleCount && i < fields.length; i++) {
            const rowY = headerHeight + (i - startIndex) * this.rowHeight - (this.scrollOffset % this.rowHeight);
            if (mouseY >= rowY && mouseY < rowY + this.rowHeight) {
                found = i;
                break;
            }
        }

        if (this.hoveredIndex !== found) {
            this.hoveredIndex = found;
            this.render();
        }

        // 更新光标
        if (found >= 0 && fields[found]?.type === FieldType.HIDDEN_GROUP) {
            this.changeCursor('pointer');
        } else {
            this.changeCursor('default');
        }
    }

    /**
     * 鼠标离开事件
     */
    _onMouseLeave() {
        this.hoveredIndex = -1;
        this.render();
    }

    /**
     * 点击事件
     */
    _onClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // 检查是否点击到隐藏组
        for (const [id, region] of this._clickableRegions) {
            if (mouseX >= region.x && mouseX <= region.x + region.width &&
                mouseY >= region.y && mouseY <= region.y + region.height) {
                // 点击隐藏组
                this.toggleGroup(id);
                if (this.onListItemClick) {
                    this.onListItemClick(region.field, region.index);
                }
                return;
            }
        }

        // 检查是否点击到普通字段
        const fields = this.getMergedFields();
        const headerHeight = this.rowHeight;
        const startIndex = Math.floor(this.scrollOffset / this.rowHeight);
        const visibleCount = Math.ceil(this.height / this.rowHeight) + 1;

        for (let i = startIndex; i < startIndex + visibleCount && i < fields.length; i++) {
            const rowY = headerHeight + (i - startIndex) * this.rowHeight - (this.scrollOffset % this.rowHeight);
            if (mouseY >= rowY && mouseY < rowY + this.rowHeight) {
                if (fields[i].type !== FieldType.HIDDEN_GROUP) {
                    this.selectedIndex = i;
                    this.render();
                    if (this.onSelectionChange) {
                        this.onSelectionChange(fields[i], i);
                    }
                    if (this.onListItemClick) {
                        this.onListItemClick(fields[i], i);
                    }
                }
                break;
            }
        }
    }

    /**
     * 双击事件
     */
    _onDoubleClick(event) {
        if (this.onFieldDoubleClick) {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;

            // 检测双击的字段
            // ... 类似点击逻辑
        }
    }

    /**
     * 滚轮事件（虚拟滚动）
     */
    _onWheel(event) {
        event.preventDefault();

        const totalRows = this.getMergedFields().length;
        const maxScroll = Math.max(0, totalRows * this.rowHeight - this.height);

        this.scrollOffset += event.deltaY;
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

        this._regionsDirty = true;
        this.render();
    }

    /**
     * 滚动到指定行
     */
    scrollToIndex(index) {
        const fields = this.getMergedFields();
        if (index < 0 || index >= fields.length) return;

        this.scrollOffset = index * this.rowHeight;
        this._regionsDirty = true;
        this.render();
    }

    /**
     * 获取当前选中的字段
     */
    getSelectedField() {
        const fields = this.getMergedFields();
        if (this.selectedIndex >= 0 && this.selectedIndex < fields.length) {
            return fields[this.selectedIndex];
        }
        return null;
    }

    /**
     * 获取所有隐藏字段
     */
    getAllHiddenFields() {
        const result = [];
        const merged = this.getMergedFields();
        for (const field of merged) {
            if (field.type === FieldType.HIDDEN_GROUP) {
                result.push(...field.children);
            }
        }
        return result;
    }

    /**
     * 重置视图
     */
    reset() {
        this.scrollOffset = 0;
        this.selectedIndex = -1;
        this.hoveredIndex = -1;
        this.expandedGroups.clear();
        this._clickableRegions.clear();
        this._regionsDirty = true;
        this._cachedFields = null;
        this.render();
    }

    /**
     * 销毁
     */
    destroy() {
        if (this.canvas) {
            this.canvas.removeEventListener('mousemove', this._onMouseMove);
            this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
            this.canvas.removeEventListener('click', this._onClick);
            this.canvas.removeEventListener('dblclick', this._onDoubleClick);
            this.canvas.removeEventListener('wheel', this._onWheel);
        }
        this._clickableRegions.clear();
    }
}

export default ListCtrl;