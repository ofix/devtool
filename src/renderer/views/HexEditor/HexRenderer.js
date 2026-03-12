// HexRenderer.js - 丝滑滚动版
export class HexRenderer {
    constructor(options) {
        this.canvas = options.canvas;
        this.wrapper = options.wrapper;
        this.dataManager = options.dataManager;
        this.hexPerRow = options.hexPerRow || 16;
        this.rowHeight = options.rowHeight || 18;
        this.addrColWidth = options.addrColWidth || 106;

        // 字体大小相关
        this.baseFontSize = 12;
        this.currentFontSize = 12;
        this.minFontSize = 12;
        this.maxFontSize = 20;

        // 根据字体大小动态计算列宽
        this.updateDimensions();

        // 滚动状态
        this.scrollTop = 0;
        this.containerHeight = 0;
        this.visibleRows = { start: 0, end: 0 };

        // 高亮数据
        this.colorRanges = [];
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

        this.bindEvents();
    }

    // 根据字体大小更新尺寸
    updateDimensions() {
        // 字体大小影响行高和列宽
        this.rowHeight = this.currentFontSize + 6;
        this.hexColWidth = this.currentFontSize + 12;
        this.asciiColWidth = this.currentFontSize + 0;

        // 重新计算 ASCII 起始位置
        this.asciiStartX = this.addrColWidth + this.hexPerRow * this.hexColWidth + 10;

        // 更新滚动速度
        this.baseScrollSpeed = this.rowHeight * 2;
        this.maxScrollSpeed = this.rowHeight * 20;
    }

    init() {
        console.log('HexRenderer init');
        this.updateCanvasSize();

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
            
            const focusRow = Math.floor(this.currentFocusAddr / this.hexPerRow);
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
            const startAddr = this.visibleRows.start * this.hexPerRow;
            const endAddr = Math.min(
                (this.visibleRows.end * this.hexPerRow) - 1,
                this.dataManager?.totalBytes || 256
            );
            this.onVisibleRangeChange(startAddr, endAddr);
        }

        this.requestRender();
    }

    handleWheel(e) {
        if (e.ctrlKey) {
            e.preventDefault();

            const delta = e.deltaY > 0 ? -1 : 1;
            const newSize = this.currentFontSize + delta;

            if (newSize >= this.minFontSize && newSize <= this.maxFontSize) {
                this.currentFontSize = newSize;
                this.updateDimensions();
                this.updateCanvasSize();
                this.updateVisibleRows();
                this.requestRender();

                console.log(`字体大小: ${this.currentFontSize}px`);
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

        const totalRows = Math.ceil(this.dataManager.totalBytes / this.hexPerRow);
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

        this.updateCanvasSize();
        this.updateVisibleRows();

        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const hasData = this.dataManager && this.dataManager.totalBytes > 0;

        if (hasData) {
            this.renderHexData(ctx);
            this.drawSelection(ctx);
            // 始终绘制焦点行高亮（如果有焦点）
            if (this.currentFocusAddr !== -1) {
                this.drawFocusHighlight(ctx);
            }
        }
    }

    drawFocusHighlight(ctx) {
        const focusRow = Math.floor(this.currentFocusAddr / this.hexPerRow);
        const focusCol = this.currentFocusAddr % this.hexPerRow;

        // 只绘制可见行内的焦点
        if (focusRow >= this.visibleRows.start && focusRow < this.visibleRows.end) {
            const rowTop = (focusRow - this.visibleRows.start) * this.rowHeight;

            ctx.save();

            // 绘制整行半透明背景
            ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
            ctx.fillRect(this.addrColWidth, rowTop, this.hexPerRow * this.hexColWidth, this.rowHeight);
            ctx.fillRect(this.asciiStartX, rowTop, this.hexPerRow * this.asciiColWidth, this.rowHeight);

            // 绘制当前字符边框
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 2;

            // 十六进制字符边框
            const hexX = this.addrColWidth + focusCol * this.hexColWidth;
            ctx.strokeRect(hexX, rowTop, this.hexColWidth, this.rowHeight);

            // ASCII字符边框
            const asciiX = this.asciiStartX + focusCol * this.asciiColWidth;
            ctx.strokeRect(asciiX, rowTop, this.asciiColWidth, this.rowHeight);

            ctx.restore();
        }
    }

    renderHexData(ctx) {
        const addrColor = '#999';
        const defaultColor = '#000';
        const font = `${this.currentFontSize}px monospace`;

        for (let row = this.visibleRows.start; row < this.visibleRows.end; row++) {
            const rowTop = (row - this.visibleRows.start) * this.rowHeight;

            let rowData = this.dataManager.getRowData(row);

            ctx.fillStyle = addrColor;
            ctx.font = font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const addrText = `0x${rowData.startAddr.toString(16).padStart(8, '0').toUpperCase()}`;
            ctx.fillText(addrText, this.addrColWidth / 2, rowTop + this.rowHeight / 2);

            for (let col = 0; col < this.hexPerRow; col++) {
                const addr = rowData.startAddr + col;
                const x = this.addrColWidth + col * this.hexColWidth;

                if (addr < this.dataManager.totalBytes && this.shouldHighlight(addr)) {
                    ctx.fillStyle = this.getHighlightColor(addr);
                    ctx.fillRect(x, rowTop, this.hexColWidth, this.rowHeight);
                }

                ctx.fillStyle = defaultColor;
                ctx.font = font;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const hexValue = rowData.hex[col] || '--';
                ctx.fillText(hexValue, x + this.hexColWidth / 2, rowTop + this.rowHeight / 2);
            }

            for (let col = 0; col < this.hexPerRow; col++) {
                const addr = rowData.startAddr + col;
                const x = this.asciiStartX + col * this.asciiColWidth;

                if (addr < this.dataManager.totalBytes && this.shouldHighlight(addr)) {
                    ctx.fillStyle = this.getHighlightColor(addr);
                    ctx.fillRect(x, rowTop, this.asciiColWidth, this.rowHeight);
                }

                ctx.fillStyle = defaultColor;
                ctx.font = font;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const asciiValue = rowData.ascii[col] || '.';
                ctx.fillText(asciiValue, x + this.asciiColWidth / 2, rowTop + this.rowHeight / 2);
            }
        }

        if (this.selectedRange.start !== -1) {
            this.drawSelection(ctx);
        }

        if (this.hoverAddr !== -1 && !this.shouldHighlight(this.hoverAddr)) {
            this.drawHover(ctx);
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

        const startRow = Math.max(this.visibleRows.start, Math.floor(this.selectedRange.start / this.hexPerRow));
        const endRow = Math.min(this.visibleRows.end - 1, Math.floor(this.selectedRange.end / this.hexPerRow));

        ctx.save();
        ctx.fillStyle = 'rgba(0,153,255,0.1)';
        ctx.strokeStyle = '#0099ff';
        ctx.lineWidth = 1;

        for (let row = startRow; row <= endRow; row++) {
            const rowTop = (row - this.visibleRows.start) * this.rowHeight;
            const rowStartAddr = row * this.hexPerRow;

            const startCol = Math.max(this.selectedRange.start - rowStartAddr, 0);
            const endCol = Math.min(this.selectedRange.end - rowStartAddr, this.hexPerRow - 1);

            const hexStartX = this.addrColWidth + startCol * this.hexColWidth;
            const hexEndX = this.addrColWidth + (endCol + 1) * this.hexColWidth;
            ctx.fillRect(hexStartX, rowTop, hexEndX - hexStartX, this.rowHeight);
            // ctx.strokeRect(hexStartX, rowTop, hexEndX - hexStartX, this.rowHeight);

            const asciiStartX = this.asciiStartX + startCol * this.asciiColWidth;
            const asciiEndX = this.asciiStartX + (endCol + 1) * this.asciiColWidth;
            ctx.fillRect(asciiStartX, rowTop, asciiEndX - asciiStartX, this.rowHeight);
            // ctx.strokeRect(asciiStartX, rowTop, asciiEndX - asciiStartX, this.rowHeight);
        }

        ctx.restore();
    }

    drawHover(ctx) {
        if (this.hoverAddr === -1) return;

        const row = Math.floor(this.hoverAddr / this.hexPerRow);
        if (row < this.visibleRows.start || row >= this.visibleRows.end) return;

        const rowTop = (row - this.visibleRows.start) * this.rowHeight;
        const col = this.hoverAddr - row * this.hexPerRow;

        ctx.save();
        ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;

        const hexX = this.addrColWidth + col * this.hexColWidth;
        ctx.fillRect(hexX, rowTop, this.hexColWidth, this.rowHeight);
        ctx.strokeRect(hexX, rowTop, this.hexColWidth, this.rowHeight);

        const asciiX = this.asciiStartX + col * this.asciiColWidth;
        ctx.fillRect(asciiX, rowTop, this.asciiColWidth, this.rowHeight);
        ctx.strokeRect(asciiX, rowTop, this.asciiColWidth, this.rowHeight);

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
                if (this.currentFocusAddr >= this.hexPerRow) {
                    newAddr = this.currentFocusAddr - this.hexPerRow;
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (this.currentFocusAddr + this.hexPerRow < totalBytes) {
                    newAddr = this.currentFocusAddr + this.hexPerRow;
                }
                break;
            case 'Home':
                e.preventDefault();
                newAddr = Math.floor(this.currentFocusAddr / this.hexPerRow) * this.hexPerRow;
                break;
            case 'End':
                e.preventDefault();
                newAddr = Math.min(
                    Math.floor(this.currentFocusAddr / this.hexPerRow) * this.hexPerRow + this.hexPerRow - 1,
                    totalBytes - 1
                );
                break;
            case 'PageUp':
                e.preventDefault();
                newAddr = Math.max(0, this.currentFocusAddr - this.hexPerRow * 10);
                break;
            case 'PageDown':
                e.preventDefault();
                newAddr = Math.min(totalBytes - 1, this.currentFocusAddr + this.hexPerRow * 10);
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

        const maxRow = Math.ceil((this.dataManager?.totalBytes || 256) / this.hexPerRow) - 1;
        targetRow = Math.max(0, Math.min(targetRow, maxRow));

        const x = clientX - rect.left;

        if (x < this.addrColWidth) {
            targetCol = 0;
        } else if (x >= this.addrColWidth && x < this.addrColWidth + this.hexPerRow * this.hexColWidth) {
            targetCol = Math.floor((x - this.addrColWidth) / this.hexColWidth);
        } else if (x >= this.asciiStartX && x < this.asciiStartX + this.hexPerRow * this.asciiColWidth) {
            targetCol = Math.floor((x - this.asciiStartX) / this.asciiColWidth);
        } else if (x >= this.addrColWidth + this.hexPerRow * this.hexColWidth) {
            targetCol = this.hexPerRow - 1;
        } else {
            targetCol = 0;
        }

        targetCol = Math.max(0, Math.min(targetCol, this.hexPerRow - 1));

        const addr = targetRow * this.hexPerRow + targetCol;

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
        if (x >= this.addrColWidth && x < this.addrColWidth + this.hexPerRow * this.hexColWidth) {
            col = Math.floor((x - this.addrColWidth) / this.hexColWidth);
        } else if (x >= this.asciiStartX && x < this.asciiStartX + this.hexPerRow * this.asciiColWidth) {
            col = Math.floor((x - this.asciiStartX) / this.asciiColWidth);
        }

        if (col < 0 || col >= this.hexPerRow) return -1;

        const addr = row * this.hexPerRow + col;

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

        const row = Math.floor(addr / this.hexPerRow);
        const startRow = Math.max(0, row - this.preloadBuffer);
        const endRow = Math.min(
            Math.ceil(this.dataManager.totalBytes / this.hexPerRow) - 1,
            row + this.preloadBuffer
        );

        const startAddr = startRow * this.hexPerRow;
        const endAddr = Math.min((endRow + 1) * this.hexPerRow - 1, this.dataManager.totalBytes - 1);

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

        const targetRow = Math.floor(addr / this.hexPerRow);
        const targetScrollTop = targetRow * this.rowHeight;
        const maxScroll = this.wrapper.scrollHeight - this.containerHeight;
        const clampedTarget = Math.max(0, Math.min(targetScrollTop, maxScroll));

        try {
            // 检查组件是否已销毁
            if (!this.wrapper || !this.canvas) {
                return;
            }

            if (addr < 0 || addr >= (this.dataManager?.totalBytes || 256)) return;

            const targetRow = Math.floor(addr / this.hexPerRow);
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
        this.colorRanges = ranges || [];

        // 如果有颜色范围，平滑滚动到第一个范围
        if (ranges && ranges.length > 0) {
            const firstRange = ranges[0];
            if (firstRange && firstRange.start !== -1) {
                this.smoothScrollTo(firstRange.start);
            }
        }

        this.requestRender();
    }

    /**
     * 滚动到指定地址（立即滚动）
     */
    scrollToAddr(addr) {
        if (addr < 0 || addr >= (this.dataManager?.totalBytes || 256)) return;

        const row = Math.floor(addr / this.hexPerRow);
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