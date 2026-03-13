// HexRenderer.js - 丝滑滚动版
export class HexRenderer {
    constructor(options) {
        this.canvas = options.canvas;
        this.wrapper = options.wrapper;
        this.dataManager = options.dataManager;
        this.hexCols = options.hexCols || 16; // 16 进制每行列数

        // 预设尺寸配置（按从小到大排序）
        // 格式: [ADDR_CELL_WIDTH, HEX_CELL_WIDTH, ASCII_CELL_WIDTH, ROW_HEIGHT，FONT_SIZE]
        this.presetSizes = Object.freeze([
            // 小号 - 紧凑模式
            [100, 18, 8, 20, 12],
            // 中号 - 标准模式（默认）
            [120, 24, 16, 22, 14],
            // 大号 - 舒适模式
            [130, 28, 18, 24, 16],
            // 特大号 - 大屏模式
            [140, 32, 20, 26, 18],
            // 超大号 - 高清模式
            // [160, 36, 22, 28, 20]
        ]);
        // 当前尺寸索引（默认使用标准模式）
        this.currentSizeIndex = 1;
        // 尺寸等级名称（用于显示/调试）
        this.sizeLevels = Object.freeze(['紧凑', '标准', '舒适', '大屏', '高清']);

        // 滚动状态
        this.scrollTop = 0;
        this.containerHeight = 0;
        this.visibleRows = { start: 0, end: 0 };

        // 高亮数据
        this.colorRanges = [];
        this.colorRangeKeys = new Map();
        this.selectedRange = { start: -1, end: -1 };
        this.editRange = { start: -1, end: -1 };
        this.isEditing = false;

        // 交互状态
        this.hoverAddr = -1;
        this.isDragging = false;
        this.selectionStartAddr = -1;

        this.lastMouseY = 0;
        this.lastMouseX = 0;
        this.lastValidAddr = -1;

        // 键盘导航
        this.currentFocusAddr = -1;
        this.isShiftPressed = false;
        this.keyboardSelectionStart = -1;

        // 平滑滚动动画
        this.lastScrollUpdate = 0;
        this.scrollUpdateInterval = 16; // 每16ms更新一次渲染（约60fps）

        // 预加载缓冲区
        this.preloadBuffer = 5; // 预加载前后5行的数据

        // 事件回调
        this.onClick = null;
        this.onSelectionChange = null;
        this.onVisibleRangeChange = null; // 新增：可视区域变化回调

        // 渲染控制
        this.renderRequest = null;
        this.renderScheduled = false;
        this.lastRenderTime = 0;

        // 绑定方法
        this.boundCanvasMouseMove = this.handleCanvasMouseMove.bind(this);
        this.boundDocumentMouseMove = this.handleDocumentMouseMove.bind(this);
        this.boundDocumentMouseUp = this.handleDocumentMouseUp.bind(this);
        this.boundCanvasMouseLeave = this.handleCanvasMouseLeave.bind(this);
        this.boundResize = this.handleResize.bind(this);
        this.boundKeyDown = this.handleKeyDown.bind(this);
        this.boundKeyUp = this.handleKeyUp.bind(this);
        this.boundWheel = this.handleWheel.bind(this);
        this.boundScroll = this.handleScroll.bind(this);

        // 根据当前序号计算绘制高度
        this.updateDimensions();
        this.updateVisibleRows();
        this.bindEvents();
    }

    // 根据字体大小更新尺寸
    updateDimensions() {
        const current = this.presetSizes[this.currentSizeIndex];
        this.addrCellWidth = current[0];
        this.hexCellWidth = current[1];
        this.asciiCellWidth = current[2];
        this.rowHeight = current[3];
        this.cellFontSize = current[4];

        // 重新计算 ASCII 起始位置
        this.asciiStartX = this.addrCellWidth + this.hexCols * this.hexCellWidth + 10;
        if (this.onDimensionChanged) {
            this.onDimensionChanged({
                addrWidth: this.addrCellWidth,
                hexWidth: this.hexCellWidth * this.hexCols,
                asciiWidth: this.asciiCellWidth * this.hexCols,
                rowHeight: this.rowHeight,
                cellFontSize: this.cellFontSize,
            });
        }
    }

    onFileSizeChanged() {
        this.updateVisibleRows();
        this.requestRender();
    }

    /**
     * 放大：切换到下一个更大的预设尺寸
     * @returns {boolean} 是否放大成功（false表示已到最大）
     */
    zoomIn() {
        if (this.currentSizeIndex < this.presetSizes.length - 1) {
            this.currentSizeIndex++;
            this.updateDimensions();
            this.updateVisibleRows();
            this.requestRender();
            return true;
        }
        return false;
    }

    /**
     * 缩小：切换到下一个更小的预设尺寸
     * @returns {boolean} 是否缩小成功（false表示已到最小）
     */
    zoomOut() {
        if (this.currentSizeIndex > 0) {
            this.currentSizeIndex--;
            this.updateDimensions();
            this.updateVisibleRows();
            this.requestRender();
            return true;
        }
        return false;
    }

    /**
     * 重置为默认尺寸（标准模式）
     */
    resetToDefault() {
        this.currentSizeIndex = 1;
        this.updateDimensions();
    }


    init() {
        this.updateCanvasSize();
        this.updateVisibleRows();
        // 初始化焦点为第一个地址
        if (this.currentFocusAddr === -1) {
            this.setFocus(0);
        }

        this.render();
    }

    setFocus(addr) {
        if (addr < 0 || addr >= (this.dataManager?.totalBytes || 256)) return;

        const oldFocus = this.currentFocusAddr;
        this.currentFocusAddr = addr;

        // 确保焦点在可视区域内
        // this.ensureFocusVisible();

        if (oldFocus !== addr) {
            this.requestRender();
        }
    }

    ensureFocusVisible() {
        try {
            if (this.currentFocusAddr === -1) return;

            // 检查 wrapper 是否存在
            if (!this.wrapper) return;

            const focusRow = Math.floor(this.currentFocusAddr / this.hexCols);
            const currentScrollTop = this.wrapper.scrollTop || 0;
            const containerHeight = this.containerHeight || 600;

            // 计算当前可视行范围
            const currentStartRow = Math.floor(currentScrollTop / this.rowHeight);
            const currentEndRow = currentStartRow + Math.ceil(containerHeight / this.rowHeight);

            // 只有当焦点真正不在可视区域内时才滚动
            if (focusRow < currentStartRow) {
                // 焦点在当前可视区域上方
                this.wrapper.scrollTop = Math.max(0, focusRow * this.rowHeight);
            } else if (focusRow >= currentEndRow) {
                // 焦点在当前可视区域下方
                this.wrapper.scrollTop = Math.max(0, (focusRow - Math.ceil(containerHeight / this.rowHeight) + 1) * this.rowHeight);
            }
        } catch (error) {
            console.warn('确保焦点可见失败:', error);
        }
    }

    handleResize() {
        this.updateCanvasSize();
        this.requestRender();
    }

    handleScroll(e) {
        const scrollTop = e.target.scrollTop;
        this.scrollTop = scrollTop;
        this.updateVisibleRows();

        // 触发可视区域变化回调，用于加载数据
        if (this.onVisibleRangeChange) {
            const startAddr = this.visibleRows.start * this.hexCols;
            const endAddr = Math.min(
                (this.visibleRows.end * this.hexCols) - 1,
                this.dataManager?.totalBytes || 256
            );
            this.onVisibleRangeChange(startAddr, endAddr);
        }

        this.requestRender();
    }



    handleWheel(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY > 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        }
    }

    updateCanvasSize() {
        if (!this.wrapper) {
            console.error('wrapper 不存在');
            return;
        }

        const width = this.wrapper.clientWidth || 800;
        const height = this.wrapper.clientHeight || 600;

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.containerHeight = height;
        }
    }

    updateVisibleRows() {
        if (!this.dataManager || !this.dataManager.totalBytes) {
            const totalRows = 16;
            const startRow = Math.max(0, Math.floor(this.scrollTop / this.rowHeight));
            const visibleCount = Math.ceil(this.containerHeight / this.rowHeight) + 2;
            const endRow = Math.min(startRow + visibleCount, totalRows);
            this.visibleRows = { start: startRow, end: endRow };
            return;
        }
        const totalRows = Math.ceil(this.dataManager.totalBytes / this.hexCols);
        const startRow = Math.max(0, Math.floor(this.scrollTop / this.rowHeight));
        const visibleCount = Math.ceil(this.containerHeight / this.rowHeight) + 2;
        const endRow = Math.min(startRow + visibleCount, totalRows);
        this.visibleRows = { start: startRow, end: endRow };
    }

    requestRender() {
        if (this.renderScheduled) return;

        const now = performance.now();
        if (now - this.lastRenderTime > 16) {
            this.renderScheduled = true;
            this.render();
        } else {
            this.renderScheduled = true;
            setTimeout(() => {
                this.renderScheduled = false;
                this.render();
            }, 16);
        }
    }

    render() {
        if (this.renderRequest) {
            cancelAnimationFrame(this.renderRequest);
        }

        this.renderRequest = requestAnimationFrame(() => {
            this._render();
            this.renderRequest = null;
            this.renderScheduled = false;
            this.lastRenderTime = performance.now();
        });
    }

    _render() {
        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // ========== 优化1：全局Canvas渲染配置（关键！） ==========
        // 开启像素对齐，关闭模糊的插值渲染
        ctx.imageSmoothingEnabled = false;
        // 设置文字抗锯齿模式（精细渲染）
        ctx.fontSmoothingEnabled = true;
        ctx.textRendering = 'geometricPrecision'; // 几何精确渲染（针对等宽字体）
        ctx.lineWidth = 1; // 确保线条宽度为1px（避免默认粗线条）
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        const hasData = this.dataManager && this.dataManager.totalBytes > 0;

        if (hasData) {
            // 精准匹配 010 Editor 的跨平台等宽字体配置
            const font = `${this.cellFontSize}px 'WenQuanYi Micro Hei Mono', 'DejaVu Sans Mono', 'Consolas', 'Menlo', 'Monaco', 'Courier New', monospace`;
            ctx.font = font;
            ctx.textBaseline = 'middle';

            this.renderAddressBar(ctx, font);
            this.renderHexArea(ctx, font);
            this.renderAsciiArea(ctx, font);

            this.renderInteractionLayers(ctx);
            this.drawSelection(ctx);
            if (this.currentFocusAddr !== -1) {
                this.drawFocusHighlight(ctx);
            }
        }
    }

    /**
     * 优化后的地址栏渲染（像素对齐 + 精细绘制）
     */
    renderAddressBar(ctx, font) {
        ctx.fillStyle = '#999';
        ctx.textAlign = 'left';

        for (let row = this.visibleRows.start; row < this.visibleRows.end; row++) {
            const rowTop = (row - this.visibleRows.start) * this.rowHeight;
            const rowData = this.dataManager.getRowData(row);
            const addrText = `0x${rowData.startAddr.toString(16).padStart(8, '0').toUpperCase()}`;

            // ========== 优化2：坐标取整（像素对齐） ==========
            // 把小数坐标转为整数，避免跨像素渲染
            const textX = Math.floor(4); // 地址栏左侧偏移，强制取整
            const textY = Math.floor(rowTop + this.rowHeight / 2); // 垂直居中坐标取整

            ctx.fillText(addrText, textX, textY);
        }
    }

    /**
     * 优化后的HEX区域渲染（核心精细优化）
     */
    renderHexArea(ctx, font) {
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';

        for (let row = this.visibleRows.start; row < this.visibleRows.end; row++) {
            const rowTop = (row - this.visibleRows.start) * this.rowHeight;
            const rowData = this.dataManager.getRowData(row);

            for (let col = 0; col < this.hexCols; col++) {
                const addr = rowData.startAddr + col;
                // ========== 优化2：坐标取整（关键） ==========
                const x = Math.floor(this.addrCellWidth + col * this.hexCellWidth);
                const rowTopInt = Math.floor(rowTop); // 行顶部坐标取整

                // 高亮背景绘制（同样像素对齐）
                if (addr < this.dataManager.totalBytes && this.shouldHighlight(addr)) {
                    ctx.fillStyle = this.getHighlightColor(addr);
                    // 矩形坐标/尺寸全部取整，避免模糊
                    ctx.fillRect(
                        x,
                        rowTopInt,
                        Math.floor(this.hexCellWidth),
                        Math.floor(this.rowHeight)
                    );
                    ctx.fillStyle = '#000';
                }

                const hexValue = rowData.hex[col] || '--';
                // ========== 优化3：文字坐标精确居中 + 取整 ==========
                const textX = Math.floor(x + this.hexCellWidth / 2);
                const textY = Math.floor(rowTopInt + this.rowHeight / 2);

                // ========== 优化4：避免重复绘制（可选） ==========
                // 先判断文字是否在可视区域，再绘制
                if (textX > 0 && textX < this.canvas.width && textY > 0 && textY < this.canvas.height) {
                    ctx.fillText(hexValue, textX, textY);
                }
            }
        }
    }

    /**
     * 渲染ASCII数据区域（单独拆分）
     * @param {CanvasRenderingContext2D} ctx - Canvas上下文
     * @param {string} font - 字体样式
     */
    renderAsciiArea(ctx, font) {
        // ASCII区域基础样式
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';

        for (let row = this.visibleRows.start; row < this.visibleRows.end; row++) {
            const rowTop = (row - this.visibleRows.start) * this.rowHeight;
            const rowData = this.dataManager.getRowData(row);

            for (let col = 0; col < this.hexCols; col++) {
                const addr = rowData.startAddr + col;
                const x = this.asciiStartX + col * this.asciiCellWidth;

                // 高亮背景（仅在需要时切换样式）
                if (addr < this.dataManager.totalBytes && this.shouldHighlight(addr)) {
                    ctx.fillStyle = this.getHighlightColor(addr);
                    ctx.fillRect(x, rowTop, this.asciiCellWidth, this.rowHeight);
                    ctx.fillStyle = '#000'; // 恢复默认文字颜色
                }

                // 绘制ASCII值
                const asciiValue = rowData.ascii[col] || '.';
                ctx.fillText(asciiValue, x + this.asciiCellWidth / 2, rowTop + this.rowHeight / 2);
            }
        }
    }

    /**
     * 渲染交互层（选中/悬浮）
     * @param {CanvasRenderingContext2D} ctx - Canvas上下文
     */
    renderInteractionLayers(ctx) {
        // 选中区域
        if (this.selectedRange.start !== -1) {
            this.drawSelection(ctx);
        }

        // 悬浮效果（仅在非高亮时绘制）
        if (this.hoverAddr !== -1 && !this.shouldHighlight(this.hoverAddr)) {
            this.drawHover(ctx);
        }
    }

    drawFocusHighlight(ctx) {
        const focusRow = Math.floor(this.currentFocusAddr / this.hexCols);
        const focusCol = this.currentFocusAddr % this.hexCols;

        // 只绘制可见行内的焦点
        if (focusRow >= this.visibleRows.start && focusRow < this.visibleRows.end) {
            const rowTop = (focusRow - this.visibleRows.start) * this.rowHeight;

            ctx.save();

            // 绘制整行半透明背景
            ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
            ctx.fillRect(this.addrCellWidth, rowTop, this.hexCols * this.hexCellWidth, this.rowHeight);
            ctx.fillRect(this.asciiStartX, rowTop, this.hexCols * this.asciiCellWidth, this.rowHeight);

            // 绘制当前字符边框
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 2;

            // 十六进制字符边框
            const hexX = this.addrCellWidth + focusCol * this.hexCellWidth;
            ctx.strokeRect(hexX, rowTop, this.hexCellWidth, this.rowHeight);

            // ASCII字符边框
            const asciiX = this.asciiStartX + focusCol * this.asciiCellWidth;
            ctx.strokeRect(asciiX, rowTop, this.asciiCellWidth, this.rowHeight);

            ctx.restore();
        }
    }

    shouldHighlight(addr) {
        if (this.selectedRange.start !== -1 &&
            addr >= this.selectedRange.start &&
            addr <= this.selectedRange.end) {
            return true;
        }
        if (this.isEditing &&
            this.editRange.start !== -1 &&
            addr >= this.editRange.start &&
            addr <= this.editRange.end) {
            return true;
        }
        for (const range of this.colorRanges) {
            if (addr >= range.start && addr <= range.end) {
                return true;
            }
        }
        return false;
    }

    getHighlightColor(addr) {
        if (this.selectedRange.start !== -1 &&
            addr >= this.selectedRange.start &&
            addr <= this.selectedRange.end) {
            return 'rgba(0, 153, 255, 0.2)';
        }
        if (this.isEditing &&
            this.editRange.start !== -1 &&
            addr >= this.editRange.start &&
            addr <= this.editRange.end) {
            return 'rgba(147, 112, 219, 0.1)';
        }
        for (const range of this.colorRanges) {
            if (addr >= range.start && addr <= range.end) {
                return range.color;
            }
        }
        return 'transparent';
    }

    drawSelection(ctx) {
        if (this.selectedRange.start === -1) return;

        // 计算选区的核心参数
        const { start: selStart, end: selEnd } = this.selectedRange;
        const startRow = Math.max(this.visibleRows.start, Math.floor(selStart / this.hexCols));
        const endRow = Math.min(this.visibleRows.end - 1, Math.floor(selEnd / this.hexCols));

        // 提前计算固定尺寸（减少重复计算）
        const { hexCellWidth, asciiCellWidth, rowHeight, addrCellWidth, asciiStartX } = this;
        const fullHexRowWidth = this.hexCols * hexCellWidth; // 整行HEX宽度
        const fullAsciiRowWidth = this.hexCols * asciiCellWidth; // 整行ASCII宽度

        ctx.save();
        ctx.fillStyle = 'rgba(0,153,255,0.1)';
        ctx.strokeStyle = '#0099ff';
        ctx.lineWidth = 1;

        // 合并矩形，仅3次 fillRect 调用
        // 情况1：顶部不完整行（如果首行不是整行选中）
        if (startRow <= endRow) {
            const rowStartAddr = startRow * this.hexCols;
            const startCol = Math.max(selStart - rowStartAddr, 0);
            const endCol = (startRow === endRow)
                ? Math.min(selEnd - rowStartAddr, this.hexCols - 1)
                : this.hexCols - 1;

            // 仅当首行不是整行时绘制（否则合并到中间行）
            if (startCol > 0 || (startRow !== endRow && endCol < this.hexCols - 1)) {
                // HEX区域顶部不完整行
                const hexX = addrCellWidth + startCol * hexCellWidth;
                const hexW = (endCol - startCol + 1) * hexCellWidth;
                const rowTop = (startRow - this.visibleRows.start) * rowHeight;
                ctx.fillRect(hexX, rowTop, hexW, rowHeight);

                // ASCII区域顶部不完整行
                const asciiX = asciiStartX + startCol * asciiCellWidth;
                const asciiW = (endCol - startCol + 1) * asciiCellWidth;
                ctx.fillRect(asciiX, rowTop, asciiW, rowHeight);
            }

            // 情况2：中间完整行（批量合并为一个大矩形）
            const middleStartRow = startRow + 1;
            const middleEndRow = endRow - 1;
            if (middleStartRow <= middleEndRow) {
                const firstMiddleRowTop = (middleStartRow - this.visibleRows.start) * rowHeight;
                const middleHeight = (middleEndRow - middleStartRow + 1) * rowHeight;

                // HEX区域中间完整行（一个大矩形覆盖所有完整行）
                ctx.fillRect(addrCellWidth, firstMiddleRowTop, fullHexRowWidth, middleHeight);
                // ASCII区域中间完整行（一个大矩形覆盖所有完整行）
                ctx.fillRect(asciiStartX, firstMiddleRowTop, fullAsciiRowWidth, middleHeight);
            }

            // 情况3：底部不完整行（如果末行不是整行，且末行≠首行）
            if (endRow > startRow) {
                const rowStartAddr = endRow * this.hexCols;
                const startCol = Math.max(selStart - rowStartAddr, 0);
                const endCol = Math.min(selEnd - rowStartAddr, this.hexCols - 1);

                // 仅当末行不是整行时绘制
                if (endCol < this.hexCols - 1 || startCol > 0) {
                    const rowTop = (endRow - this.visibleRows.start) * rowHeight;
                    // HEX区域底部不完整行
                    const hexX = addrCellWidth + startCol * hexCellWidth;
                    const hexW = (endCol - startCol + 1) * hexCellWidth;
                    ctx.fillRect(hexX, rowTop, hexW, rowHeight);

                    // ASCII区域底部不完整行
                    const asciiX = asciiStartX + startCol * asciiCellWidth;
                    const asciiW = (endCol - startCol + 1) * asciiCellWidth;
                    ctx.fillRect(asciiX, rowTop, asciiW, rowHeight);
                }
            }

            // 特殊情况：选区只有一行（直接绘制这一行）
            if (startRow === endRow && (startCol === 0 && endCol === this.hexCols - 1)) {
                const rowTop = (startRow - this.visibleRows.start) * rowHeight;
                ctx.fillRect(addrCellWidth, rowTop, fullHexRowWidth, rowHeight);
                ctx.fillRect(asciiStartX, rowTop, fullAsciiRowWidth, rowHeight);
            }
        }

        ctx.restore();
    }

    drawHover(ctx) {
        if (this.hoverAddr === -1) return;

        const row = Math.floor(this.hoverAddr / this.hexCols);
        if (row < this.visibleRows.start || row >= this.visibleRows.end) return;

        const rowTop = (row - this.visibleRows.start) * this.rowHeight;
        const col = this.hoverAddr - row * this.hexCols;

        ctx.save();
        ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;

        const hexX = this.addrCellWidth + col * this.hexCellWidth;
        ctx.fillRect(hexX, rowTop, this.hexCellWidth, this.rowHeight);

        const asciiX = this.asciiStartX + col * this.asciiCellWidth;
        ctx.fillRect(asciiX, rowTop, this.asciiCellWidth, this.rowHeight);

        ctx.restore();
    }

    bindEvents() {
        window.addEventListener('resize', this.boundResize);
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);
        window.addEventListener('wheel', this.boundWheel, { passive: false });

        // 监听包装器的滚动事件
        this.wrapper.addEventListener('scroll', this.boundScroll);

        this.canvas.addEventListener('mousemove', this.boundCanvasMouseMove);
        this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
        this.canvas.addEventListener('mouseleave', this.boundCanvasMouseLeave);
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleCanvasContextMenu.bind(this));

        document.addEventListener('mousemove', this.boundDocumentMouseMove);
        document.addEventListener('mouseup', this.boundDocumentMouseUp);
    }

    handleKeyDown(e) {
        if (this.currentFocusAddr === -1) return;

        const key = e.key;
        const totalBytes = this.dataManager?.totalBytes || 256;
        let newAddr = this.currentFocusAddr;

        // 处理 Escape 键 - 清除选区
        if (key === 'Escape') {
            this.selectedRange = { start: -1, end: -1 };
            this.onSelectionChange?.({ start: -1, end: -1 });
            this.requestRender();
            return;
        }

        // 处理 Shift 键
        if (key === 'Shift') {
            this.isShiftPressed = true;
            if (this.keyboardSelectionStart === -1) {
                this.keyboardSelectionStart = this.currentFocusAddr;
            }
        }

        // 方向键导航
        switch (key) {
            case 'ArrowLeft':
                e.preventDefault();
                if (this.currentFocusAddr > 0) {
                    newAddr = this.currentFocusAddr - 1;
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (this.currentFocusAddr < totalBytes - 1) {
                    newAddr = this.currentFocusAddr + 1;
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (this.currentFocusAddr >= this.hexCols) {
                    newAddr = this.currentFocusAddr - this.hexCols;
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (this.currentFocusAddr + this.hexCols < totalBytes) {
                    newAddr = this.currentFocusAddr + this.hexCols;
                }
                break;
            case 'Home':
                e.preventDefault();
                newAddr = Math.floor(this.currentFocusAddr / this.hexCols) * this.hexCols;
                break;
            case 'End':
                e.preventDefault();
                newAddr = Math.min(
                    Math.floor(this.currentFocusAddr / this.hexCols) * this.hexCols + this.hexCols - 1,
                    totalBytes - 1
                );
                break;
            case 'PageUp':
                e.preventDefault();
                newAddr = Math.max(0, this.currentFocusAddr - this.hexCols * 10);
                break;
            case 'PageDown':
                e.preventDefault();
                newAddr = Math.min(totalBytes - 1, this.currentFocusAddr + this.hexCols * 10);
                break;
        }

        if (newAddr !== this.currentFocusAddr) {
            // 平滑滚动到新位置
            this.smoothScrollTo(newAddr);

            // 处理选区
            if (this.isShiftPressed && this.keyboardSelectionStart !== -1) {
                const start = Math.min(this.keyboardSelectionStart, newAddr);
                const end = Math.max(this.keyboardSelectionStart, newAddr);
                this.selectedRange = { start, end };
                this.onSelectionChange?.(this.selectedRange);
            }
        }
    }

    handleKeyUp(e) {
        if (e.key === 'Shift') {
            this.isShiftPressed = false;
            this.keyboardSelectionStart = -1;
        }
    }

    handleCanvasMouseDown(e) {
        if (e.button !== 0) return;

        const addr = this.getAddrFromMouse(e);
        if (addr === -1) return;

        this.isDragging = true;
        this.selectionStartAddr = addr;
        this.selectedRange = { start: addr, end: addr };
        this.onSelectionChange?.(this.selectedRange);

        // 同时更新焦点
        this.setFocus(addr);

        this.requestRender();

        this.lastMouseY = e.clientY;
        this.lastMouseX = e.clientX;
        this.lastValidAddr = addr;
        e.preventDefault();
    }

    handleCanvasMouseMove(e) {
        const addr = this.getAddrFromMouse(e);

        if (addr !== this.hoverAddr) {
            this.hoverAddr = addr;
            this.requestRender();
        }

        this.lastMouseY = e.clientY;
        this.lastMouseX = e.clientX;

        if (addr !== -1) {
            this.lastValidAddr = addr;
        }

        if (this.isDragging) {
            // 只在 Canvas 内更新选区
            if (addr !== -1) {
                this.updateSelection(addr);
            }

            // 移除自动滚动相关代码，让浏览器原生处理
            // 不需要再调用 startAutoScroll 或 stopAutoScroll
        }

    }

    handleDocumentMouseMove(e) {
        try {
            if (this.isDragging) {
                // 保存鼠标位置
                this.lastMouseY = e.clientY;
                this.lastMouseX = e.clientX;

                // 检查 canvas 是否存在
                if (!this.canvas) {
                    return;
                }

                // 只在鼠标超出范围时才更新选区
                const rect = this.canvas.getBoundingClientRect();
                if (e.clientY < rect.top || e.clientY > rect.bottom) {
                    const extremeAddr = this.getExtremeAddrFromPosition(e.clientX, e.clientY);
                    if (extremeAddr !== -1) {
                        this.updateSelection(extremeAddr);
                        this.setFocus(extremeAddr);

                        // 使用浏览器原生滚动
                        this.scrollToExtremePosition(e.clientY, rect);
                    }
                }
            }
        } catch (error) {
            console.warn('文档鼠标移动事件处理失败:', error);
        }
    }

    /**
 * 根据鼠标位置滚动到极端位置（使用原生滚动）
 */
    scrollToExtremePosition(clientY, rect) {
        try {
            if (!this.wrapper) return;

            const maxScroll = this.wrapper.scrollHeight - this.containerHeight;

            if (clientY < rect.top && this.wrapper.scrollTop > 0) {
                // 向上滚动 - 滚动到顶部
                this.wrapper.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            } else if (clientY > rect.bottom && this.wrapper.scrollTop < maxScroll) {
                // 向下滚动 - 滚动到底部
                this.wrapper.scrollTo({
                    top: maxScroll,
                    behavior: 'smooth'
                });
            }
        } catch (error) {
            console.warn('滚动到极端位置失败:', error);
        }
    }

    getExtremeAddrFromPosition(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();

        // 如果鼠标在可视范围内，不返回极端地址
        if (clientY >= rect.top && clientY <= rect.bottom) {
            return -1;
        }

        let targetRow;
        let targetCol;

        if (clientY < rect.top) {
            targetRow = Math.max(0, this.visibleRows.start - 1);
        } else if (clientY > rect.bottom) {
            targetRow = this.visibleRows.end;
        } else {
            const y = clientY - rect.top;
            targetRow = this.visibleRows.start + Math.floor(y / this.rowHeight);
        }

        const maxRow = Math.ceil((this.dataManager?.totalBytes || 256) / this.hexCols) - 1;
        targetRow = Math.max(0, Math.min(targetRow, maxRow));

        const x = clientX - rect.left;

        if (x < this.addrCellWidth) {
            targetCol = 0;
        } else if (x >= this.addrCellWidth && x < this.addrCellWidth + this.hexCols * this.hexCellWidth) {
            targetCol = Math.floor((x - this.addrCellWidth) / this.hexCellWidth);
        } else if (x >= this.asciiStartX && x < this.asciiStartX + this.hexCols * this.asciiCellWidth) {
            targetCol = Math.floor((x - this.asciiStartX) / this.asciiCellWidth);
        } else if (x >= this.addrCellWidth + this.hexCols * this.hexCellWidth) {
            targetCol = this.hexCols - 1;
        } else {
            targetCol = 0;
        }

        targetCol = Math.max(0, Math.min(targetCol, this.hexCols - 1));

        const addr = targetRow * this.hexCols + targetCol;

        if (this.dataManager && this.dataManager.totalBytes) {
            return addr < this.dataManager.totalBytes ? addr : -1;
        } else {
            return addr < 256 ? addr : -1;
        }
    }

    handleDocumentMouseUp(e) {
        try {
            if (this.isDragging) {
                console.log('鼠标弹起，结束拖拽');

                // 重置拖拽状态
                this.isDragging = false;

                // 处理选区更新（保持不变）
                if (this.selectionStartAddr !== -1) {
                    const endAddr = this.getAddrFromMouse(e);
                    if (endAddr !== -1) {
                        this.updateSelection(endAddr);
                        this.setFocus(endAddr);
                    } else {
                        const extremeAddr = this.getExtremeAddrFromPosition(e.clientX, e.clientY);
                        if (extremeAddr !== -1) {
                            this.updateSelection(extremeAddr);
                            this.setFocus(extremeAddr);
                        } else if (this.lastValidAddr !== -1) {
                            this.updateSelection(this.lastValidAddr);
                            this.setFocus(this.lastValidAddr);
                        }
                    }
                }

                if (this.selectedRange.start !== -1) {
                    this.onSelectionChange?.(this.selectedRange);
                }

                this.requestRender();
            }
        } catch (error) {
            console.warn('鼠标释放事件处理失败:', error);
        }
    }

    handleCanvasMouseLeave() {
        this.hoverAddr = -1;
        this.requestRender();
    }

    handleCanvasClick(e) {
        const addr = this.getAddrFromMouse(e);
        this.onClick?.(addr);
    }

    handleCanvasContextMenu(e) {
        e.preventDefault();
        if (this.selectedRange.start !== -1 && this.selectedRange.end !== -1) {
            const event = new CustomEvent('hex-contextmenu', {
                detail: {
                    range: this.selectedRange,
                    addr: this.getAddrFromMouse(e)
                }
            });
            this.canvas.dispatchEvent(event);
        }
    }

    getAddrFromMouse(e) {
        if (!e || typeof e.clientX !== 'number' || typeof e.clientY !== 'number') {
            return -1;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
            return -1;
        }

        const row = this.visibleRows.start + Math.floor(y / this.rowHeight);
        if (row < 0) return -1;

        let col = -1;
        if (x >= this.addrCellWidth && x < this.addrCellWidth + this.hexCols * this.hexCellWidth) {
            col = Math.floor((x - this.addrCellWidth) / this.hexCellWidth);
        } else if (x >= this.asciiStartX && x < this.asciiStartX + this.hexCols * this.asciiCellWidth) {
            col = Math.floor((x - this.asciiStartX) / this.asciiCellWidth);
        }

        if (col < 0 || col >= this.hexCols) return -1;

        const addr = row * this.hexCols + col;

        if (this.dataManager && this.dataManager.totalBytes) {
            return addr < this.dataManager.totalBytes ? addr : -1;
        } else {
            return addr < 256 ? addr : -1;
        }
    }

    updateSelection(endAddr) {
        if (this.selectionStartAddr === -1 || endAddr === -1) return;

        const start = Math.min(this.selectionStartAddr, endAddr);
        const end = Math.max(this.selectionStartAddr, endAddr);

        if (this.selectedRange.start !== start || this.selectedRange.end !== end) {
            this.selectedRange = { start, end };
            this.onSelectionChange?.(this.selectedRange);
            this.requestRender();
        }
    }

    /**
     * 预加载指定地址周围的数据
     */
    preloadAroundAddr(addr) {
        if (!this.dataManager || !this.dataManager.totalBytes) return;

        const row = Math.floor(addr / this.hexCols);
        const startRow = Math.max(0, row - this.preloadBuffer);
        const endRow = Math.min(
            Math.ceil(this.dataManager.totalBytes / this.hexCols) - 1,
            row + this.preloadBuffer
        );

        const startAddr = startRow * this.hexCols;
        const endAddr = Math.min((endRow + 1) * this.hexCols - 1, this.dataManager.totalBytes - 1);

        // 触发数据加载
        if (this.onVisibleRangeChange) {
            this.onVisibleRangeChange(startAddr, endAddr);
        }
    }

    /**
     * 平滑滚动到指定地址
     */
    smoothScrollTo(addr) {
        if (addr < 0 || addr >= (this.dataManager?.totalBytes || 256)) return;

        const targetRow = Math.floor(addr / this.hexCols);
        const targetScrollTop = targetRow * this.rowHeight;
        const maxScroll = this.wrapper.scrollHeight - this.containerHeight;
        const clampedTarget = Math.max(0, Math.min(targetScrollTop, maxScroll));

        try {
            // 检查组件是否已销毁
            if (!this.wrapper || !this.canvas) {
                return;
            }

            if (addr < 0 || addr >= (this.dataManager?.totalBytes || 256)) return;

            const targetRow = Math.floor(addr / this.hexCols);
            const targetScrollTop = targetRow * this.rowHeight;
            const maxScroll = this.wrapper.scrollHeight - this.containerHeight;
            const clampedTarget = Math.max(0, Math.min(targetScrollTop, maxScroll));

            // 预加载目标地址周围的数据
            this.preloadAroundAddr(addr);

            // 使用浏览器原生的平滑滚动
            this.wrapper.scrollTo({
                top: clampedTarget,
                behavior: 'smooth'
            });

            // 设置焦点（但等滚动完成后再真正设置？这里先设置，让用户看到焦点变化）
            this.setFocus(addr);

            // 由于浏览器平滑滚动是异步的，我们需要监听滚动结束来确保数据加载
            // 但不需要自定义动画循环了
        } catch (error) {
            console.warn('平滑滚动失败:', error);
        }
    }

    /**
     * 设置颜色范围并平滑滚动到第一个范围
     */
    setColorRanges(ranges) {
        for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            const key = `${range.start}_${range.end}`;
            if (!this.colorRangeKeys.has(key)) {
                this.colorRanges.push(range);
                this.colorRangeKeys.set(key, range);
            }
        }

        // 如果有颜色范围，平滑滚动到第一个范围
        if (ranges && ranges.length > 0) {
            const firstRange = ranges[0];
            if (firstRange && firstRange.start !== -1) {
                if (!this.isRangeVisible(firstRange)) {
                    this.smoothScrollTo(firstRange.start);
                }

            }
        }

        this.requestRender();
    }

    /**
     * 判断地址范围是否可见
     */
    isRangeVisible(range) {
        const startAddr = this.visibleRows.start * this.hexCols;
        const endAddr = Math.min(
            (this.visibleRows.end * this.hexCols) - 1,
            this.dataManager?.totalBytes || 256
        );

        if (range.end <= startAddr || range.start >= endAddr) {
            return false;
        }
        return true;
    }

    /**
     * 滚动到指定地址（立即滚动）
     */
    scrollToAddr(addr) {
        if (addr < 0 || addr >= (this.dataManager?.totalBytes || 256)) return;

        const row = Math.floor(addr / this.hexCols);
        const scrollTop = row * this.rowHeight;

        this.preloadAroundAddr(addr);

        const maxScroll = this.wrapper.scrollHeight - this.containerHeight;

        // 使用浏览器原生的平滑滚动
        this.wrapper.scrollTo({
            top: Math.max(0, Math.min(scrollTop, maxScroll)),
            behavior: 'smooth'
        });

        this.setFocus(addr);
    }

    setEditMode(isEditing, editRange) {
        this.isEditing = isEditing;
        this.editRange = editRange || { start: -1, end: -1 };
        this.requestRender();
    }

    setSelectedRange(range) {
        this.selectedRange = range || { start: -1, end: -1 };

        // 如果有选区，平滑滚动到选区开始位置
        if (range && range.start !== -1) {
            this.smoothScrollTo(range.start);
        }

        this.requestRender();
    }

    destroy() {
        if (this.renderRequest) {
            cancelAnimationFrame(this.renderRequest);
        }

        // 清理节流定时器
        if (this.scrollThrottleTimer) {
            clearTimeout(this.scrollThrottleTimer);
            this.scrollThrottleTimer = null;
        }

        window.removeEventListener('resize', this.boundResize);
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);
        window.removeEventListener('wheel', this.boundWheel);

        if (this.wrapper) {
            this.wrapper.removeEventListener('scroll', this.boundScroll);
        }
        if (this.canvas) {
            this.canvas.removeEventListener('mousemove', this.boundCanvasMouseMove);
            this.canvas.removeEventListener('mousedown', this.handleCanvasMouseDown);
            this.canvas.removeEventListener('mouseleave', this.boundCanvasMouseLeave);
            this.canvas.removeEventListener('click', this.handleCanvasClick);
            this.canvas.removeEventListener('contextmenu', this.handleCanvasContextMenu);
        }

        document.removeEventListener('mousemove', this.boundDocumentMouseMove);
        document.removeEventListener('mouseup', this.boundDocumentMouseUp);
        // 清理引用
        this.wrapper = null;
        this.canvas = null;
        this.dataManager = null;
    }
}