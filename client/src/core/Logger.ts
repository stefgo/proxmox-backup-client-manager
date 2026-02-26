export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export class Logger {
    private static logLevel: LogLevel = LogLevel.INFO;

    static setLevel(level: string) {
        switch (level.toLowerCase()) {
            case 'debug': Logger.logLevel = LogLevel.DEBUG; break;
            case 'info': Logger.logLevel = LogLevel.INFO; break;
            case 'warn': Logger.logLevel = LogLevel.WARN; break;
            case 'error': Logger.logLevel = LogLevel.ERROR; break;
            default: Logger.logLevel = LogLevel.INFO;
        }
    }

    private static getLevel(): LogLevel {
        return Logger.logLevel;
    }

    private static getTimestamp(): string {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        return `[${hours}:${minutes}:${seconds}]`;
    }

    static debug(message: string, ...args: any[]) {
        if (Logger.getLevel() <= LogLevel.DEBUG) {
            console.debug(`${Logger.getTimestamp()} [DEBUG] ${message}`, ...args);
        }
    }

    static info(message: string, ...args: any[]) {
        if (Logger.getLevel() <= LogLevel.INFO) {
            console.log(`${Logger.getTimestamp()} [INFO] ${message}`, ...args);
        }
    }

    static warn(message: string, ...args: any[]) {
        if (Logger.getLevel() <= LogLevel.WARN) {
            console.warn(`${Logger.getTimestamp()} [WARN] ${message}`, ...args);
        }
    }

    static error(message: string, ...args: any[]) {
        if (Logger.getLevel() <= LogLevel.ERROR) {
            console.error(`${Logger.getTimestamp()} [ERROR] ${message}`, ...args);
        }
    }
}
