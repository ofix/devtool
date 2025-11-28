class Print {
    static level = 7;
    constructor() {
        throw new Error('Print 不能被实例化');
    }

    static debug(message) {
        if (Print.level >= 7) {
            console.log(message);
        }
    }
    static info(message) {
        if (Print.level >= 7) {
            console.log(message);
        }
    }
    static warn(message) {
        if (Print.level >= 7) {
            console.warn(message);
        }
    }
    static error(message) {
        if (Print.level >= 7) {
            console.error(message);
        }
    }
}

export default Print;
