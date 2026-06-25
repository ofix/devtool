import { globalCache } from './MemoryCache.js';

export class TableStructRender {
  /**
   * @param {CanvasCore} canvasCore 画布核心实例
   * @param {FieldEditor} fieldEditor 字段编辑器实例
   */
  constructor(canvasCore, fieldEditor) {
    this.core = canvasCore;
    this.editor = fieldEditor;
    // 缓存当前所有单元格碰撞区域（双击编辑命中检测）
    this.cellHitAreas = [];
  }

  /**
   * 设置待渲染结构体数组
   * @param {Array} structArr 解析出来的 class/struct 数组
   */
  setData(structArr) {
    this.structList = JSON.parse(JSON.stringify(structArr));
    this.cellHitAreas = [];
  }

  /**
   * 计算单个结构体表格整体宽高（自适应宽度核心）
   * @param {Object} structItem {uid, className, fields: [{content}]}
   * @returns {{width: number, height: number, maxFieldW: number}}
   */
  calcStructTableSize(structItem) {
    const { className, fields } = structItem;
    const padding = this.core.padding;
    const lineH = this.core.lineHeight;
    const maxChar = this.core.maxCharLimit;

    // 1. 计算表头文字宽度
    const headerRaw = className.slice(0, maxChar);
    const headerW = this.core.measureText(headerRaw) + padding * 2;

    // 2. 遍历所有字段，算出单行最宽文本
    let maxFieldTextW = 0;
    for (const field of fields) {
      const cutText = field.content.slice(0, maxChar);
      const w = this.core.measureText(cutText);
      if (w > maxFieldTextW) maxFieldTextW = w;
    }
    const maxFieldW = maxFieldTextW + padding * 2;

    // 表格整体宽度取表头、字段最大值
    const tableW = Math.max(headerW, maxFieldW);
    // 高度：表头1行 + 所有字段行 + 上下内边距
    const tableH = padding * 2 + lineH * (1 + fields.length);

    return {
      width: tableW,
      height: tableH,
      maxFieldW
    };
  }

  /**
   * 绘制单个结构体表格卡片
   * @param {Object} structItem 结构体数据
   * @param {number} originX 卡片左上角X（画布世界坐标）
   * @param {number} originY 卡片左上角Y
   * @returns {{width: number, height: number}} 卡片尺寸
   */
  drawSingleStruct(structItem, originX, originY) {
    const { className, fields, uid } = structItem;
    const size = this.calcStructTableSize(structItem);
    const { width, height } = size;
    const pad = this.core.padding;
    const lineH = this.core.lineHeight;
    let currY = originY;
    // 清空当前卡片碰撞缓存
    const startHitIdx = this.cellHitAreas.length;

    // 1. 整体卡片白底外框
    this.core.drawRoundRect(originX, currY, width, height, 6, '#ffffff', '#606266');

    // 2. 表头栏（蓝色标题）
    this.core.drawRoundRect(originX, currY, width, lineH, [6, 6, 0, 0], '#ecf5ff', '#409eff');
    this.core.ctx.fillStyle = '#0052cc';
    this.core.drawText(originX + pad, currY, className, width - pad * 2);
    currY += lineH;

    // 3. 逐行渲染字段单元格，记录碰撞区域
    this.core.ctx.fillStyle = '#303133';
    for (const field of fields) {
      const cellX = originX + pad;
      const cellY = currY;
      const cellW = width - pad * 2;
      const cellH = lineH;

      // 存入碰撞区域，双击可编辑
      this.cellHitAreas.push({
        x: cellX,
        y: cellY,
        w: cellW,
        h: cellH,
        fieldItem: field,
        structUid: uid
      });

      // 绘制单行字段文本（自动截断20字符+省略号）
      this.core.drawText(cellX, cellY, field.content, cellW);
      currY += lineH;
    }

    return size;
  }

  /**
   * 批量渲染全部结构体（平铺自动换行排布）
   */
  renderAll() {
    if (!this.structList || this.structList.length === 0) return;
    this.core.startDraw();
    this.cellHitAreas = [];

    let offsetX = 30;
    let offsetY = 30;
    const maxCanvasRowWidth = this.core.canvas.width / this.core.scale - 50;

    for (const item of this.structList) {
      const size = this.drawSingleStruct(item, offsetX, offsetY);
      // 自动换行，防止横向超出画布可视区域
      if (offsetX + size.width + 40 > maxCanvasRowWidth) {
        offsetX = 30;
        offsetY += size.height + 40;
      } else {
        offsetX += size.width + 40;
      }
    }

    this.core.endDraw();
  }

  /**
   * 鼠标双击命中检测，匹配字段单元格唤起编辑器
   * @param {number} screenX 鼠标屏幕X
   * @param {number} screenY 鼠标屏幕Y
   * @returns {Object|null} 命中单元格信息
   */
  hitTestField(screenX, screenY) {
    const { x, y } = this.core.screenToWorld(screenX, screenY);
    for (const cell of this.cellHitAreas) {
      const { w, h } = cell;
      if (x >= cell.x && x <= cell.x + w && y >= cell.y && y <= cell.y + h) {
        // 唤起输入框，传入屏幕坐标固定弹窗位置
        this.editor.startEdit(cell.fieldItem, screenX, screenY);
        return cell;
      }
    }
    return null;
  }

  /**
   * 清空缓存（切换项目/切换文件时调用）
   */
  clear() {
    this.structList = [];
    this.cellHitAreas = [];
  }
}