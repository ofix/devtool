import fs from 'fs-extra';
import path from 'path';

export default class Logger {
    constructor(name, options = {}) {
        this.name = name;
        this.level = options.level || 'info';
        this.logPath = options.logPath || './logs';

        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };

        this._ensureLogDir();
    }

    _ensureLogDir() {
        fs.ensureDirSync(this.logPath);
    }

    _log(level, message, data) {
        if (this.levels[level] < this.levels[this.level]) return;

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            logger: this.name,
            message,
            ...(data && { data })
        };

        const logStr = JSON.stringify(logEntry);
        console.log(logStr);

        const logFile = path.join(this.logPath, `${new Date().toISOString().slice(0, 10)}.log`);
        fs.appendFileSync(logFile, logStr + '\n');
    }

    debug(message, data) {
        this._log('debug', message, data);
    }

    info(message, data) {
        this._log('info', message, data);
    }

    warn(message, data) {
        this._log('warn', message, data);
    }

    error(message, data) {
        this._log('error', message, data);
    }

    child(name) {
        return new Logger(`${this.name}:${name}`, { level: this.level, logPath: this.logPath });
    }
}