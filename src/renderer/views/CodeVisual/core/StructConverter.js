import { Field } from "./Field.js";
import { StructContainer, StructFieldShape } from "./StructContainer.js";

export default class StructConverter {
  /**
   * @param {SceneManager} scene 场景管理器实例
   * @param {Map<string, object>} structDefMap 全局结构体定义池 key=structId
   */
  constructor(scene, structDefMap = new Map()) {
    this.scene = scene;
    this.structDefMap = structDefMap; // 存放所有结构体定义，用于嵌套查找
  }

  /**
   * 单个结构体定义转为可视化节点并加入场景
   * @param {object} def 结构体Schema定义
   * @returns {StructContainer} 生成的结构体容器
   */
  convert(def) {
    const { id, name, x, y, width, zIndex, fields } = def;
    // 1. 创建根结构体容器
    const structNode = new StructContainer(id);
    structNode.zIndex = zIndex ?? 2;
    // 基础包围盒（高度后续根据字段自动扩容）
    let totalHeight = 20; // 标题栏高度
    const childNodes = [];

    // 2. 循环转换所有字段
    for (const fieldDef of fields) {
      const fieldNode = this._convertField(def, fieldDef);
      childNodes.push(fieldNode);
      // 累加高度
      totalHeight = Math.max(totalHeight, fieldDef.offsetY + 24);
    }

    // 3. 挂载所有字段为子节点（建立父子双向关联）
    childNodes.forEach(field => structNode.addChild(field));

    // 4. 计算结构体整体包围盒
    structNode.bounds = {
      minX: x,
      minY: y,
      maxX: x + width,
      maxY: y + totalHeight
    };
    structNode.updateBounds();
    // 同步子节点位置（基于结构体左上角偏移）
    this._layoutStructFields(structNode, x, y);

    // 5. 加入场景管理器（自动更新rbush、nodes、visibleNodes、分类统计）
    this.scene.addNode(structNode);
    return structNode;
  }

  /**
   * 转换单个字段，区分基础类型 / 嵌套结构体类型
   */
  _convertField(parentStructDef, fieldDef) {
    const { fieldId, name, type, refStructId } = fieldDef;
    // 普通基础类型字段
    if (type !== "struct") {
      const field = new Field(fieldId, name);
      field.fieldType = type;
      field.rawDef = fieldDef;
      return field;
    }

    // 嵌套结构体字段：递归转换子结构体
    const childStructDef = this.structDefMap.get(refStructId);
    if (!childStructDef) throw new Error(`找不到嵌套结构体定义: ${refStructId}`);
    // 递归生成子结构体
    const childStruct = this.convert(childStructDef);
    // 标记为嵌套结构体字段容器
    childStruct.isNestedStructField = true;
    childStruct.parentFieldId = fieldId;
    return childStruct;
  }

  /**
   * 自动布局所有字段坐标：基于结构体左上角做偏移
   */
  _layoutStructFields(structNode, structOriginX, structOriginY) {
    structNode.children.forEach(field => {
      const fieldDef = field.rawDef;
      if (!fieldDef) return;
      const fx = structOriginX + 8; // 内边距8px
      const fy = structOriginY + fieldDef.offsetY;
      // 更新字段包围盒（固定宽高可自定义）
      const fieldW = structNode.bounds.maxX - structNode.bounds.minX - 16;
      const fieldH = 22;
      field.bounds = {
        minX: fx,
        minY: fy,
        maxX: fx + fieldW,
        maxY: fy + fieldH
      };
      field.updateBounds();
      // 更新rbush空间索引
      this.scene._updateRbushItem(field);
    });
  }

  /**
   * 批量转换多个结构体定义
   * @param {object[]} defList 结构体定义数组
   * @returns {StructContainer[]}
   */
  batchConvert(defList) {
    return defList.map(def => this.convert(def));
  }
}