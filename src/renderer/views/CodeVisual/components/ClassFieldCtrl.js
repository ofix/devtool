import FieldCtrl from "./FieldCtrl.js";
import FieldType from "./FieldType.js";

class ClassFieldCtrl extends FieldCtrl {
    constructor({ key, label, value = '', height = 30 }) {
        super({ key, label, type: FieldType.CLASS, value, height });
    }
    addFields(fields) {
        for (const field of fields) {
            this.addChild(field);
        }
        return this;
    }
    doDraw(ctx){
        
    }
}

export default ClassFieldCtrl;