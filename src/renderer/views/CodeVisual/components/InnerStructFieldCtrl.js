import FieldCtrl from "./FieldCtrl.js";
import FieldType from "./FieldType.js";

class InnerStructFieldCtrl extends FieldCtrl {
    constructor({ key, label, value = '', height = 30 }) {
        super({ key, label, type: FieldType.CLASS, value, height });
        this.collapsed = false;
    }
    doDraw(ctx, level) {
        // 绘制自身，支持折叠
        // 绘制标题栏，然后直接返回
        this.drawStructName(ctx,this.label);
        if(this.collapsd){
            return;
        }
        // 绘制所有嵌套的结构体字段
        for (let i = 0; i < this.children.length; i++) {
            let child = this.children[i];
            if (child.isVisible()) {
                child.doDraw(ctx, level++);
            }
        }
    }

    drawStructName(ctx){
        ctx.text
    }
}

export default InnerStructFieldCtrl;