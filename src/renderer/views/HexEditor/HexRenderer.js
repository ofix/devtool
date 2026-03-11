export default class HexRenderer {
    constructor(options) {
        // 配置项
        this.canvas = options.canvas;
        this.container = options.container;
        this.hexPerRow = options.hexPerRow || 16;
        this.rowHeight = options.rowHeight || 18;
        this.addrColWidth = options.addrColWidth || 106;
        this.totalBytes = options.totalBytes;
        this.hexColWidth = 24;
        this.asciiColWidth = 12;
        this.asciiStartX = this.addrColWidth + this.hexPerRow * this.hexColWidth + 10;
        this.totalHeight = Math.ceil(this.totalBytes / this.hexPerRow) * this.rowHeight;
        // 数据状态（适配新的数据结构）
        this.hexData = { get: () => '--', length: 0 };
        this.asciiData = { get: () => '.', length: 0 };
        this.colorRanges = [];
        this.selectedRange = { start: -1, end: -1 };
        this.hoverAddr = -1;
        this.editRange = { start: -1, end: -1 };
        this.isEditing = false;

        // 渲染状态
        this.visibleStartRow = 0;
        this.visibleEndRow = 0;
        this.containerHeight = 0;
        this.isDragging = false;
        this.selectionStartAddr = -1;

        // 事件回调
        this.onClick = null;
        this.onDblClick = null;
        this.onSelectionChange = null;
        this.onVisibleRangeChange = null;

        // 绑定事件
        this.bindEvents();
    }

    init() {
        if (!this.canvas || !this.container) return;
        this.updateCanvasSize();
        this.calcVisibleRange();
        this.render();
    }

    updateTotalBytes(totalBytes) {
        this.totalBytes = totalBytes;
        this.totalHeight = Math.ceil(this.totalBytes / this.hexPerRow) * this.rowHeight;
        this.calcVisibleRange();
        this.render();
    }

    updateCanvasSize() {
        if (!this.canvas || !this.container) return;

        const containerWidth = this.container.offsetWidth || 800;
        const containerHeight = this.container.offsetHeight || 600;

        if (this.canvas.width !== containerWidth || this.canvas.height !== containerHeight) {
            this.canvas.width = containerWidth;
            this.canvas.height = containerHeight;
            this.containerHeight = containerHeight;
            this.canvas.style.width = `${containerWidth}px`;
            this.canvas.style.height = `${containerHeight}px`;
            this.render();
        }
    }

    calcVisibleRange() {
        if (!this.container) return;
        const scrollTop = this.container.scrollTop || 0;
        const containerHeight = this.containerHeight || this.container.offsetHeight || 600;

        this.visibleStartRow = Math.max(0, Math.floor(scrollTop / this.rowHeight));
        const visibleRowCount = Math.max(1, Math.ceil(containerHeight / this.rowHeight) + 2);
        const totalRows = Math.max(1, Math.ceil(this.hexData.length / this.hexPerRow));
        this.visibleEndRow = Math.min(this.visibleStartRow + visibleRowCount, totalRows);

        if (this.hexData.length === 0) {
            this.visibleStartRow = 0;
            this.visibleEndRow = 1;
        }
    }

    bindEvents() {
        // 滚动事件（核心：触发可视区域变化回调）
        this.container?.addEventListener('scroll', (e) => {
            console.log("容器开始滚动了");
            this.calcVisibleRange();
            const startAddr = this.visibleStartRow * this.hexPerRow;
            const endAddr = Math.min((this.visibleEndRow * this.hexPerRow) - 1, this.hexData.length - 1);

            if (this.onVisibleRangeChange) {
                this.onVisibleRangeChange(startAddr, endAddr);
            }
            this.render();
        });

        // 其他事件（保留原有逻辑）
        this.canvas?.addEventListener('mousemove', (e) => {
            const addr = this.getAddrFromMousePos(e);
            if (addr !== this.hoverAddr) {
                this.hoverAddr = addr;
                this.render();
            }

            if (this.isDragging) {
                const rect = this.canvas.getBoundingClientRect();
                const mouseY = e.clientY - rect.top;
                if (mouseY < 10 && this.visibleStartRow > 0) {
                    this.container.scrollTop -= this.rowHeight;
                }
                else if (mouseY > this.containerHeight - 10 && this.visibleEndRow < Math.ceil(this.hexData.length / this.hexPerRow)) {
                    this.container.scrollTop += this.rowHeight;
                }
                this.updateSelection(addr);
            }
        });

        this.canvas?.addEventListener('mousedown', (e) => {
            const isLeftClick = e.button === 0 || e.which === 1;
            if (isLeftClick) {
                const addr = this.getAddrFromMousePos(e);
                if (addr === -1) return;
                this.isDragging = true;
                this.selectionStartAddr = addr;
                this.selectedRange = { start: addr, end: addr };
                this.updateSelection(addr);
                this.render();
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.onSelectionChange?.(this.selectedRange);
            }
        });

        this.canvas?.addEventListener('mouseleave', () => {
            this.hoverAddr = -1;
            this.render();
        });

        this.canvas?.addEventListener('click', (e) => {
            const addr = this.getAddrFromMousePos(e);
            this.onClick?.(addr);
        });

        this.canvas?.addEventListener('dblclick', (e) => {
            const addr = this.getAddrFromMousePos(e);
            this.onDblClick?.(addr);
        });

        window.addEventListener('resize', () => {
            this.init();
        });
    }

    getAddrFromMousePos(e) {
        if (!this.canvas || !this.container) return -1;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const row = this.visibleStartRow + Math.floor(y / this.rowHeight);
        if (row < 0 || row >= Math.ceil(this.hexData.length / this.hexPerRow)) return -1;

        let col = -1;
        if (x >= this.addrColWidth && x < this.addrColWidth + this.hexPerRow * this.hexColWidth) {
            col = Math.floor((x - this.addrColWidth) / this.hexColWidth);
        }
        else if (x >= this.asciiStartX && x < this.asciiStartX + this.hexPerRow * this.asciiColWidth) {
            col = Math.floor((x - this.asciiStartX) / this.asciiColWidth);
        }

        if (col < 0 || col >= this.hexPerRow) return -1;
        const addr = row * this.hexPerRow + col;
        return addr < this.hexData.length ? addr : -1;
    }

    updateSelection(endAddr) {
        if (this.selectionStartAddr === -1 || endAddr === -1) return;
        this.selectedRange = {
            start: Math.min(this.selectionStartAddr, endAddr),
            end: Math.max(this.selectionStartAddr, endAddr)
        };
        this.onSelectionChange?.(this.selectedRange);
        this.render();
    }

    // 适配新的数据结构
    setData(hexData, asciiData) {
        this.hexData = hexData || { get: () => '--', length: 0 };
        this.asciiData = asciiData || { get: () => '.', length: 0 };
        this.calcVisibleRange();
        this.render();
    }

    setColorRanges(ranges) {
        this.colorRanges = Array.isArray(ranges) ? ranges : (ranges ? [ranges] : []);
        this.render();
    }

    setEditMode(isEditing, editRange) {
        this.isEditing = isEditing;
        this.editRange = editRange || { start: -1, end: -1 };
        this.render();
    }

    setSelectedRange(range) {
        this.selectedRange = range || { start: -1, end: -1 };
        this.render();
    }

    // 核心渲染方法（适配新的数据读取方式）
    render() {
        if (!this.canvas) return;
        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const defaultFont = '12px monospace';
        const defaultFgColor = '#000';
        const addrFgColor = '#999';
        const selectedBgRgba = 'rgba(0, 153, 255, 0.2)';
        const selectedStrokeColor = this.toRGB(selectedBgRgba, '#FFF');
        const editBgColor = 'rgba(147, 112, 219, 0.1)';

        // 绘制背景层
        this.drawColorRangesBackground(ctx);

        if (this.isEditing && this.editRange.start !== -1 && this.editRange.end !== -1) {
            ctx.fillStyle = editBgColor;
            this.drawRangeBackground(ctx, this.editRange.start, this.editRange.end, false);
        }

        if (this.selectedRange.start !== -1 && this.selectedRange.end !== -1) {
            ctx.fillStyle = selectedBgRgba;
            this.drawRangeBackground(ctx, this.selectedRange.start, this.selectedRange.end, true);
        }

        // 渲染文本内容
        for (let row = this.visibleStartRow; row < this.visibleEndRow; row++) {
            const rowTop = (row - this.visibleStartRow) * this.rowHeight;
            const startAddr = row * this.hexPerRow;
            const endAddr = Math.min(startAddr + this.hexPerRow, this.hexData.length);

            // 地址列
            ctx.fillStyle = addrFgColor;
            ctx.font = defaultFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const addrText = `0x${startAddr.toString(16).padStart(8, '0').toUpperCase()}`;
            ctx.fillText(addrText, this.addrColWidth / 2, rowTop + this.rowHeight / 2);

            ctx.fillStyle = defaultFgColor;
            // 16进制列
            for (let col = 0; col < this.hexPerRow; col++) {
                const addr = startAddr + col;
                if (addr >= endAddr) break;

                let textColor = defaultFgColor;
                const colorRange = this.getColorRangesByAddr(addr).pop();
                if (colorRange?.textColor) textColor = colorRange.textColor;
                if (this.selectedRange.start !== -1 && addr >= this.selectedRange.start && addr <= this.selectedRange.end) {
                    textColor = '#000';
                }

                ctx.fillStyle = textColor;
                const x = this.addrColWidth + col * this.hexColWidth;
                // 适配新的数据读取方式
                const hexText = this.hexData.get(addr).toUpperCase();
                ctx.fillText(hexText, x + this.hexColWidth / 2, rowTop + this.rowHeight / 2);
            }

            // ASCII列
            ctx.fillStyle = defaultFgColor;
            for (let col = 0; col < this.hexPerRow; col++) {
                const addr = startAddr + col;
                if (addr >= endAddr) break;

                let textColor = defaultFgColor;
                const colorRange = this.getColorRangesByAddr(addr).pop();
                if (colorRange?.textColor) textColor = colorRange.textColor;
                if (this.selectedRange.start !== -1 && addr >= this.selectedRange.start && addr <= this.selectedRange.end) {
                    textColor = '#000';
                }

                ctx.fillStyle = textColor;
                const x = this.asciiStartX + col * this.asciiColWidth;
                // 适配新的数据读取方式
                const asciiText = this.asciiData.get(addr);
                ctx.fillText(asciiText, x + this.asciiColWidth / 2, rowTop + this.rowHeight / 2);
            }
        }

        // 绘制边框层
        if (this.selectedRange.start !== -1 && this.selectedRange.end !== -1) {
            ctx.strokeStyle = selectedStrokeColor;
            ctx.lineWidth = 2;
            this.drawRangeBorder(ctx, this.selectedRange.start, this.selectedRange.end);
        }

        this.drawColorRangesBorder(ctx);

        // 绘制hover状态
        if (this.hoverAddr !== -1) {
            const isInSelected = this.selectedRange.start !== -1 &&
                this.hoverAddr >= this.selectedRange.start &&
                this.hoverAddr <= this.selectedRange.end;
            const isInEdit = this.isEditing &&
                this.editRange.start !== -1 &&
                this.hoverAddr >= this.editRange.start &&
                this.hoverAddr <= this.editRange.end;
            const isInColor = this.colorRanges.some(range =>
                this.hoverAddr >= range.start && this.hoverAddr <= range.end
            );

            if (!isInSelected && !isInEdit && !isInColor) {
                this.drawSingleCellBackground(ctx, this.hoverAddr);
                this.redrawSingleCellText(ctx, this.hoverAddr, '#000');
            }
        }
    }

    // 以下方法保留原有逻辑，仅适配数据读取方式
    getColorRangesByAddr(addr) {
        return this.colorRanges.filter(range =>
            addr >= range.start && addr <= range.end
        );
    }

    /**
     * 绘制高亮区块背景（仅背景）
     */
    drawColorRangesBackground(ctx) {
        if (!this.colorRanges.length) return;

        // 遍历每个高亮区块
        for (const range of this.colorRanges) {
            if (range.start === -1 || range.end === -1) continue;

            // 排除选中/编辑区域的判断
            const isRangeInSelected = this.selectedRange.start !== -1 &&
                !(range.end < this.selectedRange.start || range.start > this.selectedRange.end);
            const isRangeInEdit = this.isEditing && this.editRange.start !== -1 &&
                !(range.end < this.editRange.start || range.start > this.editRange.end);

            if (isRangeInSelected || isRangeInEdit) continue;

            // 绘制区块整体背景（无间隔）
            ctx.fillStyle = range.color;
            this.drawColorRangeBackground(ctx, range.start, range.end);
        }
    }

    /**
     * 绘制高亮区块边框
     */
    drawColorRangesBorder(ctx) {
        if (!this.colorRanges.length) return;

        // 遍历每个高亮区块
        for (const range of this.colorRanges) {
            if (range.start === -1 || range.end === -1) continue;

            // 排除选中/编辑区域的判断
            const isRangeInSelected = this.selectedRange.start !== -1 &&
                !(range.end < this.selectedRange.start || range.start > this.selectedRange.end);
            const isRangeInEdit = this.isEditing && this.editRange.start !== -1 &&
                !(range.end < this.editRange.start || range.start > this.editRange.end);

            if (isRangeInSelected || isRangeInEdit) continue;

            // 绘制区块边框（和selectedRange样式对齐）
            const borderColor = range.borderColor || this.toRGB(range.color, '#FFF');
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 2;
            this.drawRangeBorder(ctx, range.start, range.end);
        }
    }

    /**
     * 绘制高亮区块整体背景（无单元格间隔）
     */
    drawColorRangeBackground(ctx, startAddr, endAddr) {
        const startRow = Math.max(this.visibleStartRow, Math.floor(startAddr / this.hexPerRow));
        const endRow = Math.min(this.visibleEndRow - 1, Math.floor(endAddr / this.hexPerRow));

        for (let row = startRow; row <= endRow; row++) {
            const rowTop = (row - this.visibleStartRow) * this.rowHeight;
            const rowStartAddr = row * this.hexPerRow;
            const rowEndAddr = (row + 1) * this.hexPerRow - 1;

            const drawStartAddr = Math.max(startAddr, rowStartAddr);
            const drawEndAddr = Math.min(endAddr, rowEndAddr);

            if (drawStartAddr > drawEndAddr) continue;

            const startCol = drawStartAddr - rowStartAddr;
            const endCol = drawEndAddr - rowStartAddr;

            // 绘制16进制列背景（无间隔）
            const startX = this.addrColWidth + startCol * this.hexColWidth;
            const width = (endCol - startCol + 1) * this.hexColWidth;
            ctx.fillRect(startX, rowTop, width, this.rowHeight);

            // 绘制ASCII列背景
            const asciiStartX = this.asciiStartX + startCol * this.asciiColWidth;
            const asciiWidth = (endCol - startCol + 1) * this.asciiColWidth;
            ctx.fillRect(asciiStartX, rowTop, asciiWidth, this.rowHeight);
        }
    }

    /**
     * 批量绘制指定地址范围的背景
     */
    drawRangeBackground(ctx, startAddr, endAddr, excludeHover) {
        const startRow = Math.max(this.visibleStartRow, Math.floor(startAddr / this.hexPerRow));
        const endRow = Math.min(this.visibleEndRow - 1, Math.floor(endAddr / this.hexPerRow));

        for (let row = startRow; row <= endRow; row++) {
            const rowTop = (row - this.visibleStartRow) * this.rowHeight;
            const rowStartAddr = row * this.hexPerRow;
            const rowEndAddr = (row + 1) * this.hexPerRow - 1;

            const drawStartAddr = Math.max(startAddr, rowStartAddr);
            const drawEndAddr = Math.min(endAddr, rowEndAddr);

            if (drawStartAddr > drawEndAddr) continue;

            const startCol = drawStartAddr - rowStartAddr;
            const endCol = drawEndAddr - rowStartAddr;

            // 绘制整行背景（无间隔）
            const startX = this.addrColWidth + startCol * this.hexColWidth;
            const width = (endCol - startCol + 1) * this.hexColWidth;
            ctx.fillRect(startX, rowTop, width, this.rowHeight);

            // 绘制ASCII列背景
            const asciiStartX = this.asciiStartX + startCol * this.asciiColWidth;
            const asciiWidth = (endCol - startCol + 1) * this.asciiColWidth;
            ctx.fillRect(asciiStartX, rowTop, asciiWidth, this.rowHeight);
        }
    }

    /**
     * 批量绘制指定地址范围的边框
     */
    drawRangeBorder(ctx, startAddr, endAddr) {
        const startRow = Math.max(this.visibleStartRow, Math.floor(startAddr / this.hexPerRow));
        const endRow = Math.min(this.visibleEndRow - 1, Math.floor(endAddr / this.hexPerRow));

        ctx.beginPath();

        // 处理16进制列边框
        // 首行
        const firstRowTop = (startRow - this.visibleStartRow) * this.rowHeight;
        const firstRowStartAddr = startRow * this.hexPerRow;
        const firstCol = Math.max(startAddr - firstRowStartAddr, 0);
        const firstEndCol = Math.min(endAddr - firstRowStartAddr, this.hexPerRow - 1);

        // 首行左边框
        const firstLeftX = this.addrColWidth + firstCol * this.hexColWidth;
        ctx.moveTo(firstLeftX, firstRowTop);
        ctx.lineTo(firstLeftX, firstRowTop + this.rowHeight);

        // 首行上边框
        ctx.moveTo(firstLeftX, firstRowTop);
        const firstRightX = this.addrColWidth + (firstEndCol + 1) * this.hexColWidth;
        ctx.lineTo(firstRightX, firstRowTop);

        // 中间行
        for (let row = startRow + 1; row < endRow; row++) {
            const rowTop = (row - this.visibleStartRow) * this.rowHeight;
            // 左边框
            ctx.moveTo(firstLeftX, rowTop);
            ctx.lineTo(firstLeftX, rowTop + this.rowHeight);
            // 右边框
            ctx.moveTo(firstRightX, rowTop);
            ctx.lineTo(firstRightX, rowTop + this.rowHeight);
        }

        // 末行
        const lastRowTop = (endRow - this.visibleStartRow) * this.rowHeight;
        const lastRowStartAddr = endRow * this.hexPerRow;
        const lastCol = Math.min(endAddr - lastRowStartAddr, this.hexPerRow - 1);
        const lastRightX = this.addrColWidth + (lastCol + 1) * this.hexColWidth;

        // 末行下边框
        ctx.moveTo(firstLeftX, lastRowTop + this.rowHeight);
        ctx.lineTo(lastRightX, lastRowTop + this.rowHeight);

        // 末行右边框
        ctx.moveTo(lastRightX, lastRowTop);
        ctx.lineTo(lastRightX, lastRowTop + this.rowHeight);

        // 处理ASCII列边框
        // 首行ASCII左边框
        const asciiFirstLeftX = this.asciiStartX + firstCol * this.asciiColWidth;
        ctx.moveTo(asciiFirstLeftX, firstRowTop);
        ctx.lineTo(asciiFirstLeftX, firstRowTop + this.rowHeight);

        // 首行ASCII上边框
        ctx.moveTo(asciiFirstLeftX, firstRowTop);
        const asciiFirstRightX = this.asciiStartX + (firstEndCol + 1) * this.asciiColWidth;
        ctx.lineTo(asciiFirstRightX, firstRowTop);

        // 末行ASCII下边框
        ctx.moveTo(asciiFirstLeftX, lastRowTop + this.rowHeight);
        const asciiLastRightX = this.asciiStartX + (lastCol + 1) * this.asciiColWidth;
        ctx.lineTo(asciiLastRightX, lastRowTop + this.rowHeight);

        // 末行ASCII右边框
        ctx.moveTo(asciiLastRightX, lastRowTop);
        ctx.lineTo(asciiLastRightX, lastRowTop + this.rowHeight);

        // 中间行ASCII边框
        for (let row = startRow + 1; row < endRow; row++) {
            const rowTop = (row - this.visibleStartRow) * this.rowHeight;
            // ASCII左边框
            ctx.moveTo(asciiFirstLeftX, rowTop);
            ctx.lineTo(asciiFirstLeftX, rowTop + this.rowHeight);
            // ASCII右边框
            ctx.moveTo(asciiFirstRightX, rowTop);
            ctx.lineTo(asciiFirstRightX, rowTop + this.rowHeight);
        }

        ctx.stroke();
    }

    /**
     * 绘制单个单元格的背景
     */
    drawSingleCellBackground(ctx, addr) {
        const row = Math.floor(addr / this.hexPerRow);
        if (row < this.visibleStartRow || row >= this.visibleEndRow) return;

        const rowTop = (row - this.visibleStartRow) * this.rowHeight;
        const col = addr - row * this.hexPerRow;

        const x = this.addrColWidth + col * this.hexColWidth;
        ctx.fillRect(x, rowTop, this.hexColWidth, this.rowHeight);

        const asciiX = this.asciiStartX + col * this.asciiColWidth;
        ctx.fillRect(asciiX, rowTop, this.asciiColWidth, this.rowHeight);
    }

    /**
     * 重绘单个单元格的文本
     */
    redrawSingleCellText(ctx, addr, fgColor) {
        const row = Math.floor(addr / this.hexPerRow);
        if (row < this.visibleStartRow || row >= this.visibleEndRow) return;

        const rowTop = (row - this.visibleStartRow) * this.rowHeight;
        const col = addr - row * this.hexPerRow;

        ctx.fillStyle = fgColor;
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const hexX = this.addrColWidth + col * this.hexColWidth;
        const hexText = (this.hexData[addr] || '--').toUpperCase();
        ctx.fillText(hexText, hexX + this.hexColWidth / 2, rowTop + this.rowHeight / 2);

        const asciiX = this.asciiStartX + col * this.asciiColWidth;
        const asciiText = this.asciiData[addr] || '.';
        ctx.fillText(asciiText, asciiX + this.asciiColWidth / 2, rowTop + this.rowHeight / 2);
    }

    /**
     * 将带透明度的RGBA颜色转换为指定背景色下的等效无透明RGB颜色
     */
    toRGB(rgbaColor, bgColor) {
        const rgbaMatch = rgbaColor.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/);
        if (!rgbaMatch) {
            return rgbaColor;
            // throw new Error(`RGBA颜色格式错误，示例：rgba(0,153,255,0.2) → 传入值：${rgbaColor}`);
        }

        const [, rStr, gStr, bStr, aStr] = rgbaMatch;
        const r = parseInt(rStr);
        const g = parseInt(gStr);
        const b = parseInt(bStr);
        const a = parseFloat(aStr);

        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || a < 0 || a > 1) {
            throw new Error(`RGBA数值超出范围：R/G/B需0-255，透明度需0-1 → 传入值：${rgbaColor}`);
        }

        let bgR, bgG, bgB;

        const rgbMatch = bgColor.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
        if (rgbMatch) {
            bgR = parseInt(rgbMatch[1]);
            bgG = parseInt(rgbMatch[2]);
            bgB = parseInt(rgbMatch[3]);
        }
        else if (bgColor.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)) {
            let hex = bgColor.slice(1);
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            bgR = parseInt(hex.slice(0, 2), 16);
            bgG = parseInt(hex.slice(2, 4), 16);
            bgB = parseInt(hex.slice(4, 6), 16);
        }
        else {
            throw new Error(`背景色格式不支持，仅支持rgb/rgba或十六进制 → 传入值：${bgColor}`);
        }

        if (bgR < 0 || bgR > 255 || bgG < 0 || bgG > 255 || bgB < 0 || bgB > 255) {
            throw new Error(`背景色RGB数值超出范围（0-255）→ 传入值：${bgColor}`);
        }

        const finalR = Math.round(r * a + bgR * (1 - a));
        const finalG = Math.round(g * a + bgG * (1 - a));
        const finalB = Math.round(b * a + bgB * (1 - a));

        return `rgb(${finalR}, ${finalG}, ${finalB})`;
    }

    // 销毁方法
    destroy() {
        this.container?.removeEventListener('scroll', () => { });
        this.canvas?.removeEventListener('mousemove', () => { });
        this.canvas?.removeEventListener('mousedown', () => { });
        this.canvas?.removeEventListener('click', () => { });
        this.canvas?.removeEventListener('dblclick', () => { });
        window.removeEventListener('resize', () => { });
    }
}