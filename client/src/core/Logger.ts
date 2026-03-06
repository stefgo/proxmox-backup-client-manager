export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export class Logger {
    private static logLevel: LogLevel = LogLevel.INFO;

    static setLevel(level: string) {
        switch (level.toLowerCase()) {
            case "debug":
                Logger.logLevel = LogLevel.DEBUG;
                break;
            case "info":
                Logger.logLevel = LogLevel.INFO;
                break;
            case "warn":
                Logger.logLevel = LogLevel.WARN;
                break;
            case "error":
                Logger.logLevel = LogLevel.ERROR;
                break;
            default:
                Logger.logLevel = LogLevel.INFO;
        }
    }

    private static getLevel(): LogLevel {
        return Logger.logLevel;
    }

    private static getTimestamp(): string {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, "0");
        const minutes = now.getMinutes().toString().padStart(2, "0");
        const seconds = now.getSeconds().toString().padStart(2, "0");
        return `[${hours}:${minutes}:${seconds}]`;
    }

    private static format(level: string, message: any, ...args: any[]) {
        const timestamp = Logger.getTimestamp();
        let logMessage = "";
        let extraParams = args;

        if (typeof message === "object" && message !== null) {
            // Support object-first pattern: Logger.error({ err: e }, "Message")
            const msg = args[0] || "";
            logMessage = `${timestamp} [${level}] ${msg} ${JSON.stringify(message)}`;
            extraParams = args.slice(1);
        } else {
            logMessage = `${timestamp} [${level}] ${message}`;
        }

        return { logMessage, extraParams };
    }

    static debug(message: any, ...args: any[]) {
        if (Logger.getLevel() <= LogLevel.DEBUG) {
            const { logMessage, extraParams } = Logger.format(
                "DEBUG",
                message,
                ...args,
            );
            console.debug(logMessage, ...extraParams);
        }
    }

    static info(message: any, ...args: any[]) {
        if (Logger.getLevel() <= LogLevel.INFO) {
            const { logMessage, extraParams } = Logger.format(
                "INFO",
                message,
                ...args,
            );
            console.log(logMessage, ...extraParams);
        }
    }

    static warn(message: any, ...args: any[]) {
        if (Logger.getLevel() <= LogLevel.WARN) {
            const { logMessage, extraParams } = Logger.format(
                "WARN",
                message,
                ...args,
            );
            console.warn(logMessage, ...extraParams);
        }
    }

    static error(message: any, ...args: any[]) {
        if (Logger.getLevel() <= LogLevel.ERROR) {
            const { logMessage, extraParams } = Logger.format(
                "ERROR",
                message,
                ...args,
            );
            console.error(logMessage, ...extraParams);
        }
    }
}
