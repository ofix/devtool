class KlineInfoPanel {
    constructor(ctx, config = {}) {
      this.ctx = ctx;
      this.config = {
        colors: {
          text: '#999999',
          up: '#ef5350',
          down: '#26a69a',
          limitUp: '#ff8c00',
          limitDown: '#00bcd4',
          panelBg: 'rgba(0, 0, 0, 0.85)',
          panelBorder: '#444444',
          ...config.colors
        },
        width: 220,
        ...config
      };
      
      this.position = { x: 10, y: 10 };
      this.isDragging = false;
      this.dragOffset = { x: 0, y: 0 };
      this.visible = true;
      this.selectedCandle = null;
      this.selectedIndex = -1;
      this.prevCandle = null;
      this.getLimitPercentFn = null; // 外部传入的涨跌停判断函数
    }
    
    // 设置数据
    setData(selectedIndex, selectedCandle, prevCandle, getLimitPercentFn) {
      this.selectedIndex = selectedIndex;
      this.selectedCandle = selectedCandle;
      this.prevCandle = prevCandle;
      this.getLimitPercentFn = getLimitPercentFn;
    }
    
    // 设置位置
    setPosition(x, y) {
      this.position = { x, y };
    }
    
    // 获取位置
    getPosition() {
      return this.position;
    }
    
    // 获取面板尺寸
    getSize() {
      return {
        width: this.config.width,
        height: this.getPanelHeight()
      };
    }
    
    // 计算面板高度
    getPanelHeight() {
      let height = 25; // 标题区域
      
      // 基础信息
      height += 20; // 日期
      height += 18 * 6; // 开收高低涨跌涨幅成交量
      
      // 涨跌停信息
      if (this.prevCandle && this.getLimitPercentFn) {
        const limitInfo = this.getLimitPercentFn(this.selectedCandle, this.prevCandle.close);
        if (limitInfo && limitInfo.isLimit) {
          height += 18;
        }
      }
      
      return Math.max(200, height);
    }
    
    // 检查点是否在面板内
    isPointInside(x, y) {
      const { width } = this.getSize();
      const { height } = this.getSize();
      return x >= this.position.x && x <= this.position.x + width &&
             y >= this.position.y && y <= this.position.y + height;
    }
    
    // 开始拖动
    startDrag(mouseX, mouseY) {
      this.isDragging = true;
      this.dragOffset.x = mouseX - this.position.x;
      this.dragOffset.y = mouseY - this.position.y;
    }
    
    // 拖动中
    onDrag(mouseX, mouseY, canvasWidth, canvasHeight) {
      if (!this.isDragging) return false;
      
      let newX = mouseX - this.dragOffset.x;
      let newY = mouseY - this.dragOffset.y;
      
      // 边界限制
      const { width, height } = this.getSize();
      newX = Math.max(0, Math.min(newX, canvasWidth - width));
      newY = Math.max(0, Math.min(newY, canvasHeight - height));
      
      this.position = { x: newX, y: newY };
      return true;
    }
    
    // 结束拖动
    endDrag() {
      this.isDragging = false;
    }
    
    // 格式化成交量
    formatVolume(volume) {
      if (volume >= 100000000) {
        return (volume / 100000000).toFixed(2) + '亿';
      } else if (volume >= 10000) {
        return (volume / 10000).toFixed(2) + '万';
      }
      return volume.toString();
    }
    
    // 绘制单行信息
    drawLine(label, value, changeValue, y, valueColor = null) {
      const labelX = this.position.x + 10;
      const valueX = this.position.x + 120;
      const changeX = this.position.x + 170;
      
      this.ctx.fillStyle = this.config.colors.text;
      this.ctx.fillText(label, labelX, y);
      
      if (valueColor) {
        this.ctx.fillStyle = valueColor;
      } else {
        this.ctx.fillStyle = '#ffffff';
      }
      this.ctx.fillText(value, valueX, y);
      
      if (changeValue) {
        const isPositive = changeValue.startsWith('+');
        this.ctx.fillStyle = valueColor || (isPositive ? this.config.colors.up : this.config.colors.down);
        this.ctx.fillText(changeValue, changeX, y);
      }
    }
    
    // 绘制面板
    render() {
      if (!this.visible || !this.selectedCandle) return;
      
      const { width } = this.getSize();
      const height = this.getPanelHeight();
      const { x, y } = this.position;
      
      this.ctx.save();
      
      // 绘制阴影
      this.ctx.shadowBlur = 5;
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      
      // 绘制面板背景
      this.ctx.fillStyle = this.config.colors.panelBg;
      this.ctx.fillRect(x, y, width, height);
      
      // 绘制边框
      this.ctx.shadowBlur = 0;
      this.ctx.strokeStyle = this.config.colors.panelBorder;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(x, y, width, height);
      
      // 绘制拖动区域标识（三点）
      this.ctx.fillStyle = this.config.colors.text;
      for (let i = 0; i < 3; i++) {
        this.ctx.fillRect(x + width - 20 + i * 5, y + 8, 2, 2);
      }
      
      // 绘制标题
      this.ctx.font = 'bold 13px Arial';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText('K线详情', x + 10, y + 18);
      
      // 绘制分隔线
      this.ctx.strokeStyle = this.config.colors.panelBorder;
      this.ctx.lineWidth = 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 5, y + 23);
      this.ctx.lineTo(x + width - 5, y + 23);
      this.ctx.stroke();
      
      // 设置字体
      this.ctx.font = '12px Arial';
      let lineY = y + 43;
      
      // 日期
      const dateStr = this.selectedCandle.date || `索引: ${this.selectedIndex}`;
      this.drawLine('日期', dateStr, '', lineY);
      lineY += 20;
      
      // 开盘价
      this.drawLine('开盘', this.selectedCandle.open.toFixed(2), '', lineY);
      lineY += 18;
      
      // 收盘价
      this.drawLine('收盘', this.selectedCandle.close.toFixed(2), '', lineY);
      lineY += 18;
      
      // 最高价
      this.drawLine('最高', this.selectedCandle.high.toFixed(2), '', lineY);
      lineY += 18;
      
      // 最低价
      this.drawLine('最低', this.selectedCandle.low.toFixed(2), '', lineY);
      lineY += 18;
      
      // 涨跌额
      if (this.prevCandle) {
        const change = this.selectedCandle.close - this.prevCandle.close;
        const changePercent = (change / this.prevCandle.close) * 100;
        const isUp = change >= 0;
        const changeColor = isUp ? this.config.colors.up : this.config.colors.down;
        const changeText = (change > 0 ? '+' : '') + change.toFixed(2);
        const changePercentText = (changePercent > 0 ? '+' : '') + changePercent.toFixed(2) + '%';
        
        this.drawLine('涨跌', change.toFixed(2), changeText, lineY, changeColor);
        lineY += 18;
        
        this.drawLine('涨幅', changePercent.toFixed(2) + '%', changePercentText, lineY, changeColor);
        lineY += 18;
      } else {
        this.drawLine('涨跌', '0.00', '0.00', lineY);
        lineY += 18;
        this.drawLine('涨幅', '0.00%', '0.00%', lineY);
        lineY += 18;
      }
      
      // 成交量
      this.drawLine('成交量', this.formatVolume(this.selectedCandle.volume), '', lineY);
      lineY += 18;
      
      // 涨跌停状态
      if (this.prevCandle && this.getLimitPercentFn) {
        const limitInfo = this.getLimitPercentFn(this.selectedCandle, this.prevCandle.close);
        if (limitInfo && limitInfo.isLimit) {
          const limitText = limitInfo.type === 'up' ? '涨停' : '跌停';
          const limitColor = limitInfo.type === 'up' ? this.config.colors.limitUp : this.config.colors.limitDown;
          this.drawLine('状态', limitText, '', lineY, limitColor);
        }
      }
      
      this.ctx.restore();
    }
    
    // 隐藏面板
    hide() {
      this.visible = false;
    }
    
    // 显示面板
    show() {
      this.visible = true;
    }
    
    // 切换可见性
    toggle() {
      this.visible = !this.visible;
    }
    
    // 重置状态
    reset() {
      this.selectedCandle = null;
      this.selectedIndex = -1;
      this.prevCandle = null;
    }
  }
  
  export default KlineInfoPanel;