import FieldCtrl from "./FieldCtrl.js";
import FieldType from "./FieldType.js";

class ClassFieldCtrl extends FieldCtrl {
    constructor({ key, label, value = '', height = 30 }) {
        super({ key, label, type: FieldType.CLASS, value, height });
    }

    measureHeight() {
        let sum = 0;
        for (const child of this.children) {
            if (child.isVisible()) {
                sum += child.height;
            }
        }
        this.expandedHeight = this.headerHeight + sum;
        this.refreshHeight();
    }

    addFields(fields) {
        for (const field of fields) {
            this.addChild(field);
        }
        return this;
    }
    doDraw(ctx) {

    }
}

export default ClassFieldCtrl;