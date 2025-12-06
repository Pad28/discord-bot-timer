import winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import { envs } from '../config/env';

const LOGS_DIR = path.join(process.cwd(), 'logs');

// Asegurar que el directorio de logs existe
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Formato personalizado para los logs
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Formato para consola (más legible)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, ...metadata }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
        }
        return msg;
    })
);

// Crear el logger
const logger = winston.createLogger({
    level: 'debug', // Nivel más bajo para archivos (captura todo)
    format: logFormat,
    defaultMeta: { service: 'timer-bot' },
    transports: [
        // Archivo para todos los logs (incluyendo debug)
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Archivo solo para errores
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Archivo para sesiones (logs específicos de inicio/fin de sesión)
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'sessions.log'),
            level: 'info',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.printf(({ timestamp, message, ...metadata }) => {
                    return `${timestamp} ${message} ${JSON.stringify(metadata)}`;
                })
            )
        }),
    ],
});

// En consola solo mostrar info, warn y error (no debug)
if (envs.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        level: 'info', // Solo info, warn y error en consola
        format: consoleFormat,
    }));
} else {
    // En producción, solo errores en consola
    logger.add(new winston.transports.Console({
        level: 'warn', // Solo warn y error en producción
        format: consoleFormat,
    }));
}

export default logger;

