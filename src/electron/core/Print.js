class Print {
    static level = 7;
    static prefix = '[devtool] ';
    constructor() {
        throw new Error('Print 不能被实例化');
    }

    static debug (...message) {
        if (Print.level >= 7) {
            if (message == undefined || message.length == 0) {
                console.log("");
            } else {
                console.log(Print.prefix, ...message);
            }
        }
    }
    static log (...message) {
        if (Print.level >= 7) {
            if (message == undefined || message.length == 0) {
                console.log("");
            } else {
                console.log(Print.prefix, ...message);
            }
        }
    }
    static info (...message) {
        if (Print.level >= 7) {
            if (message == undefined || message.length == 0) {
                console.log("");
            } else {
                console.log(Print.prefix, ...message);
            }
        }
    }
    static warn (...message) {
        if (Print.level >= 7) {
            if (message == undefined || message.length == 0) {
                console.warn("");
            } else {
                console.warn(Print.prefix, ...message);
            }
        }
    }
    static error (...message) {
        if (Print.level >= 7) {
            if (message == undefined || message.length == 0) {
                console.error("");
            } else {
                console.error(Print.prefix, ...message);
            }
        }
    }
}

export default Print;
