class Print {
    static level = 7;
    static prefix = '[devtool] ';
    constructor() {
        throw new Error('Print 不能被实例化');
    }

    static debug (...message) {
        if (Print.level >= 7) {
            console.log(Print.prefix, ...message);
        }
    }
    static info (...message) {
        if (Print.level >= 7) {
            console.log(Print.prefix, ...message);
        }
    }
    static warn (...message) {
        if (Print.level >= 7) {
            console.warn(Print.prefix, ...message);
        }
    }
    static error (...message) {
        if (Print.level >= 7) {
            console.error(Print.prefix, ...message);
        }
    }
}

export default Print;
