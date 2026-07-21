import FieldCtrl from "./FieldCtrl.js";
import FieldType from "./FieldType.js";

class ReferenceFieldCtrl extends FieldCtrl {
    constructor({ key, label, value = '', height = 30 }) {
        super({ key, label, type: FieldType.REFERENCE, value, height });
        this.typeWidth = 0;
        this.typeWidthDirty = true;
    }

    doDraw(ctx, level, parentWorldX, parentWorldY) {
        let x = parentWorldX + this.x + level * 4;
        let y = parentWorldY + this.y;
        // 类型名
        ctx.fillStyle = "#0000FF";
        ctx.fillText(this.value, x, y);
        // 获取类型文字宽度，偏移一段距离写变量名
        if (this.typeWidthDirty) {
            this.typeWidth = this.measureText(ctx, this.value);
            this.typeWidthDirty = false;
        }

        // 变量名，黑色
        ctx.fillStyle = "#000000";
        const nameText = ` ${this.name}`;
        ctx.fillText(nameText, x + this.typeWidth, this.label);
    }
}

export default ReferenceFieldCtrl;