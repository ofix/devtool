import FieldCtrl from "./FieldCtrl.js";
import FieldType from "./FieldType.js";

class ArrayFieldCtrl extends FieldCtrl {
    constructor({ key, label, value = '', height = 30 }) {
        super({ key, label, type: FieldType.ARRAY, value, height });
    }
    doDraw(ctx){
        
    }
}

export default ArrayFieldCtrl;