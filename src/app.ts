import {
    Client,
    GatewayIntentBits,
    VoiceState,
    Message
} from 'discord.js';

import { loadData, saveData, loadConfig, saveConfig } from './utils/storage';
import { ActiveSession, WorkSession, BotConfig } from './types/data';
import { envs } from './config/env';
import {
    handleSetChannels,
    handleSetAdminRoles,
    handleQueryTime,
    handleTimeByDay,
    handleTimeByWeek,
    handleHelp,
    handleListChannels,
    getServerConfig
} from './utils/commands';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const activeSessions = new Map<string, ActiveSession>();
let botConfig: BotConfig = {};

// Cargar configuración al iniciar
botConfig = loadConfig();


client.once('ready', async () => {
    console.log('✅ Bot conectado exitosamente!');
    console.log(`📊 Usuario: ${client.user?.tag}`);
    console.log(`🎯 Prefijo de comandos: ${envs.COMMAND_PREFIX}`);
});

// Handler de comandos por mensajes
client.on('messageCreate', async (message: Message) => {
    // Ignorar mensajes de bots y DM
    if (message.author.bot || !message.guild) return;

    const prefix = envs.COMMAND_PREFIX;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    if (!command) return;

    try {
        switch (command) {
            case 'setchannels':
                await handleSetChannels(message, args, botConfig);
                break;
            case 'listchannels':
            case 'listcanales':
                await handleListChannels(message);
                break;
            case 'setadminroles':
                await handleSetAdminRoles(message, args, botConfig);
                break;
            case 'time':
            case 'tiempo':
                await handleQueryTime(message, args, botConfig, activeSessions);
                break;
            case 'timeday':
            case 'tiempodia':
                await handleTimeByDay(message, args, botConfig, activeSessions);
                break;
            case 'timeweek':
            case 'tiemposemana':
                await handleTimeByWeek(message, args, botConfig, activeSessions);
                break;
            case 'help':
            case 'ayuda':
                handleHelp(message, prefix);
                break;
            default:
                message.reply(`❌ Comando desconocido. Usa \`${prefix}help\` para ver los comandos disponibles.`);
        }
    } catch (error) {
        console.error('Error ejecutando comando:', error);
        message.reply('❌ Ocurrió un error al ejecutar el comando.');
    }
});

// Handler para trackear tiempo en canales de voz
client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
    const guildId = newState.guild.id;
    const userId = newState.member?.id;

    if (!userId || !newState.member) return;

    const serverConfig = getServerConfig(guildId, botConfig);

    // Si no hay canales configurados, no hacer nada
    if (serverConfig.trackedChannels.length === 0) return;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    const sessionKey = `${guildId}-${userId}`;

    // Usuario entró a un canal trackeado
    if (!oldChannelId && newChannelId && serverConfig.trackedChannels.includes(newChannelId)) {
        const channel = await newState.guild.channels.fetch(newChannelId);
        if (!channel || !channel.isVoiceBased()) return;

        activeSessions.set(sessionKey, {
            start: new Date(),
            channel: newChannelId,
            username: newState.member.user.username
        });

        // console.log(`▶️ Inició sesión: ${newState.member.user.username} en ${channel.name}`);
    }

    // Usuario salió de un canal trackeado
    if (oldChannelId && serverConfig.trackedChannels.includes(oldChannelId) && !newChannelId) {
        const session = activeSessions.get(sessionKey);
        if (session) {
            const endTime = new Date();
            const durationMs = endTime.getTime() - session.start.getTime();
            const durationHours = durationMs / (1000 * 60 * 60);

            // Solo guardar si la sesión duró al menos 1 minuto
            if (durationHours >= 1 / 60) {
                const timeData = loadData();

                if (!timeData[userId]) {
                    timeData[userId] = {
                        username: session.username,
                        sessions: []
                    };
                }

                const dateStr = session.start.toISOString().split('T')[0]; // yyyy-mm-dd
                const timeStr = session.start.toTimeString().split(' ')[0]; // hh:mm:ss

                const workSession: WorkSession = {
                    date: dateStr,
                    start: timeStr,
                    hours: durationHours,
                    channel: session.channel
                };

                timeData[userId].sessions.push(workSession);
                timeData[userId].username = session.username; // Actualizar username por si cambió
                saveData(timeData);

                // console.log(`⏹️ Finalizó sesión: ${session.username} - ${durationHours.toFixed(2)} horas`);
            }

            activeSessions.delete(sessionKey);
        }
    }

    // Usuario cambió de canal (de un trackeado a otro o viceversa)
    if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
        const wasOldTracked = serverConfig.trackedChannels.includes(oldChannelId);
        const isNewTracked = serverConfig.trackedChannels.includes(newChannelId);

        // Si salió de un canal trackeado, finalizar sesión
        if (wasOldTracked) {
            const session = activeSessions.get(sessionKey);
            if (session) {
                const endTime = new Date();
                const durationMs = endTime.getTime() - session.start.getTime();
                const durationHours = durationMs / (1000 * 60 * 60);

                if (durationHours >= 1 / 60) {
                    const timeData = loadData();

                    if (!timeData[userId]) {
                        timeData[userId] = {
                            username: session.username,
                            sessions: []
                        };
                    }

                    const dateStr = session.start.toISOString().split('T')[0];
                    const timeStr = session.start.toTimeString().split(' ')[0];

                    const workSession: WorkSession = {
                        date: dateStr,
                        start: timeStr,
                        hours: durationHours,
                        channel: session.channel
                    };

                    timeData[userId].sessions.push(workSession);
                    timeData[userId].username = session.username;
                    saveData(timeData);

                    // console.log(`⏹️ Finalizó sesión: ${session.username} - ${durationHours.toFixed(2)} horas`);
                }

                activeSessions.delete(sessionKey);
            }
        }

        // Si entró a un canal trackeado, iniciar nueva sesión
        if (isNewTracked) {
            const channel = await newState.guild.channels.fetch(newChannelId);
            if (channel && channel.isVoiceBased()) {
                activeSessions.set(sessionKey, {
                    start: new Date(),
                    channel: newChannelId,
                    username: newState.member.user.username
                });

                // console.log(`▶️ Inició sesión: ${newState.member.user.username} en ${channel.name}`);
            }
        }
    }
});

client.login(envs.DISCORD_TOKEN);
