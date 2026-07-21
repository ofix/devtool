import Field from "./Field.js";
import NumberField from "./NumberField.js";
import StringField from "./StringField.js";
import ReferenceField from "./ReferenceField.js";
import ObjectField from "./ObjectField.js";
import BooleanField from "./BooleanField.js";
import ArrayField from "./ArrayField.js";
import FieldType from "./FieldType.js";

class CodeParser {
  constructor(structRawList) {
    this.rawList = structRawList;
    this.tmpFlatIndex = 0;
    this.tmpUnionCnt = 0;
    this.tmpRefCnt = 0;
    // 当前正在解析的顶层结构体名称
    this.curStructName = "";
    // 解析过程中全局收集所有引用记录，一次性产出
    this.tmpAllRefRecords = [];
  }

  parse() {
    const topStructs = [];
    this.tmpAllRefRecords = []; // 每次解析重置引用缓存

    for (const rawStruct of this.rawList) {
      this.tmpFlatIndex = 0;
      this.tmpUnionCnt = 0;
      this.tmpRefCnt = 0;

      const structField = this.parseNode(rawStruct, null);
      if (!structField) continue;

      // 标记当前顶层结构体名称，解析内部引用时使用
      this.curStructName = structField.name;

      // 挂载纯数字统计
      structField.structStats = {
        totalFlatFields: this.tmpFlatIndex,
        unionFieldCount: this.tmpUnionCnt,
        referenceFieldCount: this.tmpRefCnt
      };
      topStructs.push(structField);
    }

    // 同时返回结构体树 + 预收集完成的所有引用记录，SceneManager 直接用
    return {
      structList: topStructs,
      refRecords: this.tmpAllRefRecords
    };
  }

  parseNode(node, parentStructName) {
    if (typeof node !== "object" || node === null || !node.type) return null;
    const { name, type, offset, size, typeVal, pointerLevel } = node;
    const fieldIns = this.createFieldInstance(node);
    if (!fieldIns) return null;

    fieldIns.flatOrder = this.tmpFlatIndex++;
    fieldIns.parentStructName = parentStructName;

    if (type === FieldType.REFERENCE || type === FieldType.POINTER) {
      fieldIns.pointerLevel = Number.isFinite(pointerLevel) ? pointerLevel : 1;
      this.tmpRefCnt++;
      // 解析时直接生成归属记录，存入全局临时数组，无需二次遍历
      this.tmpAllRefRecords.push({
        belongStructName: this.curStructName,
        refField: fieldIns
      });
      return fieldIns;
    }

    if (type === FieldType.Object) {
      this.parseTypeValChildren(typeVal, name, fieldIns);
    } else if (type === FieldType.UNION) {
      this.tmpUnionCnt++;
      this.parseTypeValChildren(typeVal, parentStructName, fieldIns);
    }
    return fieldIns;
  }

  parseTypeValChildren(typeVal, bindParentStruct, parentField) {
    if (Array.isArray(typeVal)) {
      const arrField = new ArrayField("", 0, 0, typeVal);
      arrField.flatOrder = this.tmpFlatIndex++;
      arrField.parentStructName = bindParentStruct;
      for (const itemNode of typeVal) {
        const child = this.parseNode(itemNode, bindParentStruct);
        if (child) arrField.addChild(child);
      }
      parentField.addChild(arrField);
      return;
    }
    if (typeof typeVal === "object" && typeVal !== null && typeVal.type) {
      const childNode = this.parseNode(typeVal, bindParentStruct);
      if (childNode) parentField.addChild(childNode);
    }
  }

  createFieldInstance(meta) {
    const { name, offset, size, type, typeVal } = meta;
    let inst = null;
    switch (type) {
      case FieldType.Object:
      case FieldType.UNION:
        inst = new ObjectField(name, offset, size, typeVal);
        break;
      case FieldType.REFERENCE:
      case FieldType.POINTER:
        inst = new ReferenceField(name, offset, size, typeVal);
        break;
      case FieldType.STRING:
        inst = new StringField(name, offset, size, typeVal);
        break;
      case FieldType.BOOLEAN:
        inst = new BooleanField(name, offset, size, typeVal);
        break;
      case FieldType.NUMBER:
        inst = new NumberField(name, offset, size, typeVal);
        break;
      default:
        inst = new Field(name, offset, size, typeVal);
        break;
    }
    return inst;
  }
}