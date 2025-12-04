export interface WorkSession {
    date: string; // yyyy-mm-dd
    start: string; // hh:mm:ss
    hours: number; // duracion en horas
    channel: string;
}

export interface UserData {
    username: string;
    sessions: WorkSession[];
}

export interface TimeTrackingData {
    [userId: string]: UserData;
}

export interface ActiveSession {
    start: Date;
    channel: string;
    username: string;
}


export interface ServerConfig {
    trackedChannels: string[];     // IDs de canales a trackear
    notifyChannelId: string | null; // ID del canal de notificaciones
    adminRoleIds: string[];
}


export interface BotConfig {
    [guildId: string]: ServerConfig;
}
