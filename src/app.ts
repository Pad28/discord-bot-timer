import {
    Client,
    GatewayIntentBits,
    VoiceState,
    Message
} from 'discord.js';

import { loadData, saveData, loadConfig, saveConfig } from './utils/storage';
import { ActiveSession, WorkSession, BotConfig } from './types/data';
import { envs } from './config/env';
import logger from './utils/logger';
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
    logger.info('✅ Bot conectado exitosamente!');
    logger.info(`📊 Usuario: ${client.user?.tag}`);
    logger.info(`🎯 Prefijo de comandos: ${envs.COMMAND_PREFIX}`);
    logger.info(`🔧 Servidores: ${client.guilds.cache.size}`);
    logger.info(`📡 Event listeners registrados: voiceStateUpdate=${client.listenerCount('voiceStateUpdate')}`);

    // Mostrar configuración cargada
    const config = loadConfig();
    logger.info(`📋 Configuración cargada: ${Object.keys(config).length} servidor(es)`);
    Object.entries(config).forEach(([guildId, serverConfig]) => {
        logger.debug(`  - Servidor ${guildId}: ${serverConfig.trackedChannels.length} canal(es) configurado(s)`);
    });
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
                botConfig = loadConfig(); // Recargar configuración después de guardar
                logger.debug('🔄 Configuración recargada después de setchannels');
                break;
            case 'listchannels':
            case 'listcanales':
                await handleListChannels(message);
                break;
            case 'setadminroles':
                await handleSetAdminRoles(message, args, botConfig);
                botConfig = loadConfig(); // Recargar configuración después de guardar
                logger.debug('🔄 Configuración recargada después de setadminroles');
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
        logger.error('Error ejecutando comando:', error);
        message.reply('❌ Ocurrió un error al ejecutar el comando.');
    }
});

// Handler para trackear tiempo en canales de voz
client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
    logger.debug('🔔 Evento voiceStateUpdate disparado', {
        usuario: newState.member?.user?.username || 'desconocido',
        canalAnterior: oldState.channelId || 'ninguno',
        canalNuevo: newState.channelId || 'ninguno'
    });

    const guildId = newState.guild.id;
    const userId = newState.member?.id;

    logger.debug(`   Guild ID: ${guildId}, User ID: ${userId || 'no disponible'}`);

    if (!userId || !newState.member) {
        logger.debug('⚠️ Saltando: userId o member no disponible');
        return;
    }

    const serverConfig = getServerConfig(guildId, botConfig);
    logger.debug(`   Canales trackeados configurados: ${serverConfig.trackedChannels.length}`, {
        canales: serverConfig.trackedChannels
    });

    // Si no hay canales configurados, no hacer nada
    if (serverConfig.trackedChannels.length === 0) {
        logger.debug('⚠️ Saltando: No hay canales configurados para trackear');
        return;
    }

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    const sessionKey = `${guildId}-${userId}`;

    logger.debug(`   Evaluando: oldChannelId=${oldChannelId}, newChannelId=${newChannelId}`, {
        esCanalTrackeadoNuevo: newChannelId ? serverConfig.trackedChannels.includes(newChannelId) : false,
        esCanalTrackeadoAnterior: oldChannelId ? serverConfig.trackedChannels.includes(oldChannelId) : false
    });

    // Usuario entró a un canal trackeado
    if (!oldChannelId && newChannelId && serverConfig.trackedChannels.includes(newChannelId)) {
        logger.debug('✅ Condición cumplida: Usuario entró a canal trackeado');
        const channel = await newState.guild.channels.fetch(newChannelId);
        if (!channel || !channel.isVoiceBased()) {
            logger.warn(`⚠️ Canal ${newChannelId} no es de voz o no se pudo obtener`);
            return;
        }

        const sessionStart = new Date();
        activeSessions.set(sessionKey, {
            start: sessionStart,
            channel: newChannelId,
            username: newState.member.user.username
        });

        logger.info(`▶️ Inició sesión: ${newState.member.user.username} en ${channel.name} (${newChannelId})`, {
            username: newState.member.user.username,
            channelId: newChannelId,
            channelName: channel.name,
            sessionKey,
            horaInicio: sessionStart.toISOString(),
            sesionesActivas: activeSessions.size
        });
    }

    // Usuario salió de un canal trackeado
    if (oldChannelId && serverConfig.trackedChannels.includes(oldChannelId) && !newChannelId) {
        logger.debug('✅ Condición cumplida: Usuario salió de canal trackeado', {
            canalId: oldChannelId,
            sessionKey
        });
        const session = activeSessions.get(sessionKey);
        logger.debug(`📦 Sesión encontrada: ${!!session}, Sesiones activas: ${activeSessions.size}`);

        if (session) {
            const endTime = new Date();
            const durationMs = endTime.getTime() - session.start.getTime();
            const durationHours = durationMs / (1000 * 60 * 60);
            const durationMinutes = durationHours * 60;

            logger.debug(`⏱️ Duración calculada: ${durationHours.toFixed(4)} horas (${durationMinutes.toFixed(2)} minutos)`);

            // Solo guardar si la sesión duró al menos 1 minuto
            if (durationHours >= 1 / 60) {
                logger.debug(`💾 Guardando sesión...`);
                const timeData = loadData();
                logger.debug(`📂 Datos cargados: ${Object.keys(timeData).length} usuario(s)`);

                if (!timeData[userId]) {
                    timeData[userId] = {
                        username: session.username,
                        sessions: []
                    };
                    logger.debug(`➕ Nuevo usuario creado: ${userId}`);
                }

                const dateStr = session.start.toISOString().split('T')[0]; // yyyy-mm-dd
                const timeStr = session.start.toTimeString().split(' ')[0]; // hh:mm:ss

                const workSession: WorkSession = {
                    date: dateStr,
                    start: timeStr,
                    hours: durationHours,
                    channel: session.channel
                };

                logger.debug(`📝 Sesión a guardar: ${JSON.stringify(workSession)}`);
                timeData[userId].sessions.push(workSession);
                timeData[userId].username = session.username; // Actualizar username por si cambió

                saveData(timeData);
                logger.debug(`✅ Datos guardados. Total sesiones para ${session.username}: ${timeData[userId].sessions.length}`);

                logger.info(`⏹️ Finalizó sesión: ${session.username} - ${durationHours.toFixed(2)} horas (${durationMinutes.toFixed(1)} minutos)`, {
                    username: session.username,
                    durationHours: durationHours.toFixed(2),
                    durationMinutes: durationMinutes.toFixed(1),
                    channelId: session.channel,
                    totalSesiones: timeData[userId].sessions.length
                });
            } else {
                logger.debug(`⚠️ Sesión muy corta para ${session.username}: ${durationMinutes.toFixed(1)} minutos (mínimo 1 minuto)`);
            }

            activeSessions.delete(sessionKey);
            logger.debug(`🗑️ Sesión eliminada de activeSessions. Restantes: ${activeSessions.size}`);
        } else {
            logger.warn(`❌ No se encontró sesión activa para ${sessionKey}. Sesiones activas: ${Array.from(activeSessions.keys()).join(', ')}`);
        }
    }

    // Usuario cambió de canal (de un trackeado a otro o viceversa)
    if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
        const wasOldTracked = serverConfig.trackedChannels.includes(oldChannelId);
        const isNewTracked = serverConfig.trackedChannels.includes(newChannelId);

        // Si salió de un canal trackeado, finalizar sesión
        if (wasOldTracked) {
            logger.debug(`🔄 Usuario cambió de canal trackeado: ${oldChannelId} -> ${newChannelId}`);
            const session = activeSessions.get(sessionKey);
            if (session) {
                const endTime = new Date();
                const durationMs = endTime.getTime() - session.start.getTime();
                const durationHours = durationMs / (1000 * 60 * 60);
                const durationMinutes = durationHours * 60;

                logger.debug(`⏱️ Duración (cambio): ${durationHours.toFixed(4)} horas (${durationMinutes.toFixed(2)} minutos)`);

                if (durationHours >= 1 / 60) {
                    logger.debug(`💾 Guardando sesión (cambio de canal)...`);
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

                    logger.debug(`✅ Sesión guardada (cambio). Total: ${timeData[userId].sessions.length}`);
                    logger.info(`⏹️ Finalizó sesión (cambio de canal): ${session.username} - ${durationHours.toFixed(2)} horas`, {
                        username: session.username,
                        durationHours: durationHours.toFixed(2),
                        channelId: session.channel,
                        totalSesiones: timeData[userId].sessions.length
                    });
                } else {
                    logger.debug(`⚠️ Sesión muy corta (cambio de canal) para ${session.username}: ${durationMinutes.toFixed(1)} minutos`);
                }

                activeSessions.delete(sessionKey);
            } else {
                logger.warn(`❌ No se encontró sesión activa para cambio de canal: ${sessionKey}`);
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

                logger.info(`▶️ Inició sesión (cambio de canal): ${newState.member.user.username} en ${channel.name}`, {
                    username: newState.member.user.username,
                    channelId: newChannelId,
                    channelName: channel.name,
                    sessionKey
                });
            }
        }
    }
});

client.login(envs.DISCORD_TOKEN);
