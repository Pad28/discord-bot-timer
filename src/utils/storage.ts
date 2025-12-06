import * as fs from 'fs';
import * as path from 'path';
import { TimeTrackingData, BotConfig } from '../types/data';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'time_data.json');
const CONFIG_FILE = path.join(DATA_DIR, 'bot_config.json');


const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

export const loadData = (): TimeTrackingData => {
    ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading time tracking data:', error);
            return {};
        }
    }
    return {};
};


export const saveData = (data: TimeTrackingData) => {
    ensureDataDir();
    try {
        const jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync(DATA_FILE, jsonData, 'utf8');
        console.log(`💾 Archivo guardado exitosamente: ${DATA_FILE} (${jsonData.length} bytes)`);
    } catch (error) {
        console.error('❌ Error saving time tracking data:', error);
        if (error instanceof Error) {
            console.error('   Mensaje:', error.message);
            console.error('   Stack:', error.stack);
        }
    }
};


export const exportToCSV = (data: TimeTrackingData): string => {
    const lines = ["Username,Date,Start,Hours,Channel"];
    Object.entries(data).forEach(([userId, userData]) => {
        userData.sessions.forEach(session => {
            lines.push(`${userData.username},${session.date},${session.start},${session.hours},${session.channel}`);
        });
    });
    return lines.join('\n');
};

// Funciones para manejar la configuración del bot
export const loadConfig = (): BotConfig => {
    ensureDataDir();
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading bot config:', error);
            return {};
        }
    }
    return {};
};

export const saveConfig = (config: BotConfig) => {
    ensureDataDir();
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving bot config:', error);
    }
};
