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
    console.log(`🔧 Servidores: ${client.guilds.cache.size}`);
    console.log(`📡 Event listeners registrados: voiceStateUpdate=${client.listenerCount('voiceStateUpdate')}`);
    console.log('🔍 Verificando que el listener de voiceStateUpdate esté activo...');

    // Mostrar configuración cargada
    const config = loadConfig();
    console.log(`📋 Configuración cargada: ${Object.keys(config).length} servidor(es)`);
    Object.entries(config).forEach(([guildId, serverConfig]) => {
        console.log(`  - Servidor ${guildId}: ${serverConfig.trackedChannels.length} canal(es) configurado(s)`);
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
                console.log('🔄 Configuración recargada después de setchannels');
                break;
            case 'listchannels':
            case 'listcanales':
                await handleListChannels(message);
                break;
            case 'setadminroles':
                await handleSetAdminRoles(message, args, botConfig);
                botConfig = loadConfig(); // Recargar configuración después de guardar
                console.log('🔄 Configuración recargada después de setadminroles');
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
    console.log('🔔 Evento voiceStateUpdate disparado');
    console.log(`   Usuario: ${newState.member?.user?.username || 'desconocido'}`);
    console.log(`   Canal anterior: ${oldState.channelId || 'ninguno'}`);
    console.log(`   Canal nuevo: ${newState.channelId || 'ninguno'}`);

    const guildId = newState.guild.id;
    const userId = newState.member?.id;

    console.log(`   Guild ID: ${guildId}`);
    console.log(`   User ID: ${userId || 'no disponible'}`);

    if (!userId || !newState.member) {
        console.log('⚠️ Saltando: userId o member no disponible');
        return;
    }

    const serverConfig = getServerConfig(guildId, botConfig);
    console.log(`   Canales trackeados configurados: ${serverConfig.trackedChannels.length}`);
    console.log(`   IDs de canales trackeados: ${JSON.stringify(serverConfig.trackedChannels)}`);

    // Si no hay canales configurados, no hacer nada
    if (serverConfig.trackedChannels.length === 0) {
        console.log('⚠️ Saltando: No hay canales configurados para trackear');
        return;
    }

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    const sessionKey = `${guildId}-${userId}`;

    console.log(`   Evaluando: oldChannelId=${oldChannelId}, newChannelId=${newChannelId}`);
    console.log(`   ¿Es canal trackeado (nuevo)? ${newChannelId ? serverConfig.trackedChannels.includes(newChannelId) : false}`);
    console.log(`   ¿Es canal trackeado (anterior)? ${oldChannelId ? serverConfig.trackedChannels.includes(oldChannelId) : false}`);

    // Usuario entró a un canal trackeado
    if (!oldChannelId && newChannelId && serverConfig.trackedChannels.includes(newChannelId)) {
        console.log('✅ Condición cumplida: Usuario entró a canal trackeado');
        const channel = await newState.guild.channels.fetch(newChannelId);
        if (!channel || !channel.isVoiceBased()) {
            console.log(`⚠️ Canal ${newChannelId} no es de voz o no se pudo obtener`);
            return;
        }

        const sessionStart = new Date();
        activeSessions.set(sessionKey, {
            start: sessionStart,
            channel: newChannelId,
            username: newState.member.user.username
        });

        console.log(`▶️ Inició sesión: ${newState.member.user.username} en ${channel.name} (${newChannelId})`);
        console.log(`📅 Hora de inicio: ${sessionStart.toISOString()}`);
        console.log(`🔑 SessionKey: ${sessionKey}`);
        console.log(`📊 Total sesiones activas: ${activeSessions.size}`);
    }

    // Usuario salió de un canal trackeado
    if (oldChannelId && serverConfig.trackedChannels.includes(oldChannelId) && !newChannelId) {
        console.log('✅ Condición cumplida: Usuario salió de canal trackeado');
        console.log(`🔍 Usuario salió del canal trackeado: ${oldChannelId}, sessionKey: ${sessionKey}`);
        const session = activeSessions.get(sessionKey);
        console.log(`📦 Sesión encontrada: ${!!session}, Sesiones activas: ${activeSessions.size}`);

        if (session) {
            const endTime = new Date();
            const durationMs = endTime.getTime() - session.start.getTime();
            const durationHours = durationMs / (1000 * 60 * 60);
            const durationMinutes = durationHours * 60;

            console.log(`⏱️ Duración calculada: ${durationHours.toFixed(4)} horas (${durationMinutes.toFixed(2)} minutos)`);

            // Solo guardar si la sesión duró al menos 1 minuto
            if (durationHours >= 1 / 60) {
                console.log(`💾 Guardando sesión...`);
                const timeData = loadData();
                console.log(`📂 Datos cargados: ${Object.keys(timeData).length} usuario(s)`);

                if (!timeData[userId]) {
                    timeData[userId] = {
                        username: session.username,
                        sessions: []
                    };
                    console.log(`➕ Nuevo usuario creado: ${userId}`);
                }

                const dateStr = session.start.toISOString().split('T')[0]; // yyyy-mm-dd
                const timeStr = session.start.toTimeString().split(' ')[0]; // hh:mm:ss

                const workSession: WorkSession = {
                    date: dateStr,
                    start: timeStr,
                    hours: durationHours,
                    channel: session.channel
                };

                console.log(`📝 Sesión a guardar: ${JSON.stringify(workSession)}`);
                timeData[userId].sessions.push(workSession);
                timeData[userId].username = session.username; // Actualizar username por si cambió

                saveData(timeData);
                console.log(`✅ Datos guardados. Total sesiones para ${session.username}: ${timeData[userId].sessions.length}`);

                console.log(`⏹️ Finalizó sesión: ${session.username} - ${durationHours.toFixed(2)} horas (${durationMinutes.toFixed(1)} minutos)`);
            } else {
                console.log(`⚠️ Sesión muy corta para ${session.username}: ${durationMinutes.toFixed(1)} minutos (mínimo 1 minuto)`);
            }

            activeSessions.delete(sessionKey);
            console.log(`🗑️ Sesión eliminada de activeSessions. Restantes: ${activeSessions.size}`);
        } else {
            console.log(`❌ No se encontró sesión activa para ${sessionKey}. Sesiones activas:`, Array.from(activeSessions.keys()));
        }
    }

    // Usuario cambió de canal (de un trackeado a otro o viceversa)
    if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
        const wasOldTracked = serverConfig.trackedChannels.includes(oldChannelId);
        const isNewTracked = serverConfig.trackedChannels.includes(newChannelId);

        // Si salió de un canal trackeado, finalizar sesión
        if (wasOldTracked) {
            console.log(`🔄 Usuario cambió de canal trackeado: ${oldChannelId} -> ${newChannelId}`);
            const session = activeSessions.get(sessionKey);
            if (session) {
                const endTime = new Date();
                const durationMs = endTime.getTime() - session.start.getTime();
                const durationHours = durationMs / (1000 * 60 * 60);
                const durationMinutes = durationHours * 60;

                console.log(`⏱️ Duración (cambio): ${durationHours.toFixed(4)} horas (${durationMinutes.toFixed(2)} minutos)`);

                if (durationHours >= 1 / 60) {
                    console.log(`💾 Guardando sesión (cambio de canal)...`);
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

                    console.log(`✅ Sesión guardada (cambio). Total: ${timeData[userId].sessions.length}`);
                    console.log(`⏹️ Finalizó sesión (cambio de canal): ${session.username} - ${durationHours.toFixed(2)} horas`);
                } else {
                    console.log(`⚠️ Sesión muy corta (cambio de canal) para ${session.username}: ${durationMinutes.toFixed(1)} minutos`);
                }

                activeSessions.delete(sessionKey);
            } else {
                console.log(`❌ No se encontró sesión activa para cambio de canal: ${sessionKey}`);
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

                console.log(`▶️ Inició sesión (cambio de canal): ${newState.member.user.username} en ${channel.name}`);
            }
        }
    }
});

client.login(envs.DISCORD_TOKEN);
