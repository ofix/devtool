import FieldCtrl from "./FieldCtrl.js";
import FieldType from "./FieldType.js";
/**
 * 基本类型字段
 */
class StringFieldCtrl extends FieldCtrl {
    constructor({ key, label, value = '', height = 30 }) {
        super({ key, label, type: FieldType.STRING, value, height });
        this.typeWidth = 0;
        this.typeWidthDirty = true;
    }

    doDraw(ctx) {
        // 类型名
        ctx.fillStyle = "#00FF00";
        ctx.fillText(this.value, this.x, this.y);
        // 获取类型文字宽度，偏移一段距离写变量名
        if (this.typeWidthDirty) {
            this.typeWidth = this.measureText(ctx, this.value);
            this.typeWidthDirty = false;
        }

        // 变量名，黑色
        ctx.fillStyle = "#000000";
        const nameText = ` ${this.name}`;
        ctx.fillText(nameText, this.x + this.typeWidth, this.label);
    }
}

export default StringFieldCtrl;
