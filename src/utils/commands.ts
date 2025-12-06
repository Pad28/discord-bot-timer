import {
    Message,
    EmbedBuilder,
    GuildMember,
    TextChannel,
    VoiceChannel,
    Client
} from 'discord.js';
import { BotConfig, ServerConfig, TimeTrackingData, UserData } from '../types/data';
import { loadConfig, saveConfig, loadData, saveData } from './storage';
import { envs } from '../config/env';

// Obtener configuración del servidor
export const getServerConfig = (guildId: string, config: BotConfig): ServerConfig => {
    if (!config[guildId]) {
        config[guildId] = {
            trackedChannels: [],
            notifyChannelId: null,
            adminRoleIds: []
        };
    }
    return config[guildId];
};

// Verificar si un usuario tiene permisos de administrador
export const hasAdminPermission = (member: GuildMember | null, serverConfig: ServerConfig): boolean => {
    if (!member) return false;

    // Si no hay roles configurados, solo el administrador del servidor puede usar comandos
    if (serverConfig.adminRoleIds.length === 0) {
        return member.permissions.has('Administrator');
    }

    // Verificar si tiene alguno de los roles de administrador
    return member.roles.cache.some(role => serverConfig.adminRoleIds.includes(role.id));
};


// Comando: Configurar canales a trackear
export const handleSetChannels = async (message: Message, args: string[], config: BotConfig): Promise<void> => {
    const guildId = message.guildId;
    if (!guildId) {
        message.reply('❌ Este comando solo funciona en un servidor.');
        return;
    }

    // Cargar la configuración completa del archivo antes de modificar
    const fullConfig = loadConfig();
    const serverConfig = getServerConfig(guildId, fullConfig);
    const member = message.member ? await message.member.fetch() : null;

    if (!hasAdminPermission(member, serverConfig)) {
        message.reply('❌ No tienes permisos para usar este comando.');
        return;
    }

    if (args.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📋 Canales Configurados')
            .setDescription(serverConfig.trackedChannels.length === 0
                ? 'No hay canales configurados.'
                : serverConfig.trackedChannels.map(id => `<#${id}>`).join('\n'))
            .setColor(0x5865F2);
        message.reply({ embeds: [embed] });
        return;
    }

    // Procesar argumentos: mencionar canales o usar IDs
    const channelIds: string[] = [];
    const invalidChannels: string[] = [];

    for (const arg of args) {
        let channelId: string | null = null;

        // Si es una mención de canal
        const mentionMatch = arg.match(/^<#(\d+)>$/);
        if (mentionMatch) {
            channelId = mentionMatch[1];
        }
        // Si es un ID directo
        else if (/^\d+$/.test(arg)) {
            channelId = arg;
        }

        if (channelId) {
            try {
                const channel = await message.guild?.channels.fetch(channelId);
                if (channel && channel.isVoiceBased()) {
                    // Evitar duplicados
                    if (!channelIds.includes(channelId)) {
                        channelIds.push(channelId);
                    }
                } else if (channel) {
                    invalidChannels.push(`<#${channelId}> (no es un canal de voz)`);
                } else {
                    invalidChannels.push(channelId);
                }
            } catch (error) {
                invalidChannels.push(channelId);
            }
        } else {
            invalidChannels.push(arg);
        }
    }

    if (channelIds.length === 0) {
        let errorMsg = '❌ No se encontraron canales de voz válidos.\n\n';
        if (invalidChannels.length > 0) {
            errorMsg += `Canales inválidos: ${invalidChannels.join(', ')}\n\n`;
        }
        errorMsg += '**Formas de usar el comando:**\n';
        errorMsg += '• Menciona canales de voz: `!setchannels #canal1 #canal2`\n';
        errorMsg += '• Usa IDs de canales: `!setchannels 123456789012345678`\n';
        errorMsg += '• Para ver canales disponibles, escribe: `!listchannels`';
        message.reply(errorMsg);
        return;
    }

    if (invalidChannels.length > 0) {
        const warningMsg = `⚠️ Algunos canales no fueron agregados: ${invalidChannels.join(', ')}`;
        message.reply(warningMsg);
    }

    // Combinar canales existentes con los nuevos (evitando duplicados)
    const existingChannels = serverConfig.trackedChannels || [];
    const combinedChannels = [...new Set([...existingChannels, ...channelIds])];

    // Actualizar los canales del servidor actual
    serverConfig.trackedChannels = combinedChannels;

    // Guardar la configuración completa (con todos los servidores)
    saveConfig(fullConfig);

    const newChannelsCount = channelIds.length;
    const totalChannelsCount = combinedChannels.length;
    const wasAdded = existingChannels.length > 0 && newChannelsCount > 0;

    const embed = new EmbedBuilder()
        .setTitle('✅ Canales Configurados')
        .setDescription(
            wasAdded
                ? `Se agregaron ${newChannelsCount} canal(es) nuevo(s). Total: ${totalChannelsCount} canal(es) trackeados:\n${combinedChannels.map(id => `<#${id}>`).join('\n')}`
                : `Se configuraron ${totalChannelsCount} canal(es) para trackear:\n${combinedChannels.map(id => `<#${id}>`).join('\n')}`
        )
        .setColor(0x57F287);
    message.reply({ embeds: [embed] });
};

// Comando: Configurar roles de administrador
export const handleSetAdminRoles = async (message: Message, args: string[], config: BotConfig): Promise<void> => {
    const guildId = message.guildId;
    if (!guildId) {
        message.reply('❌ Este comando solo funciona en un servidor.');
        return;
    }

    // Cargar la configuración completa del archivo antes de modificar
    const fullConfig = loadConfig();
    const serverConfig = getServerConfig(guildId, fullConfig);
    const member = await message.member?.fetch();

    // Solo el administrador del servidor puede configurar roles
    if (!member?.permissions.has('Administrator')) {
        message.reply('❌ Solo los administradores del servidor pueden configurar roles.');
        return;
    }

    if (args.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('👥 Roles de Administrador')
            .setDescription(serverConfig.adminRoleIds.length === 0
                ? 'No hay roles configurados. Solo los administradores del servidor pueden usar comandos.'
                : serverConfig.adminRoleIds.map(id => `<@&${id}>`).join('\n'))
            .setColor(0x5865F2);
        message.reply({ embeds: [embed] });
        return;
    }

    // Procesar argumentos: mencionar roles o usar IDs
    const roleIds: string[] = [];
    for (const arg of args) {
        // Si es una mención de rol
        const mentionMatch = arg.match(/^<@&(\d+)>$/);
        if (mentionMatch) {
            const roleId = mentionMatch[1];
            // Evitar duplicados
            if (!roleIds.includes(roleId)) {
                roleIds.push(roleId);
            }
        }
        // Si es un ID directo
        else if (/^\d+$/.test(arg)) {
            const role = await message.guild?.roles.fetch(arg);
            if (role && !roleIds.includes(arg)) {
                roleIds.push(arg);
            }
        }
    }

    if (roleIds.length === 0) {
        message.reply('❌ No se encontraron roles válidos.');
        return;
    }

    // Actualizar solo los roles del servidor actual
    serverConfig.adminRoleIds = roleIds;

    // Guardar la configuración completa (con todos los servidores)
    saveConfig(fullConfig);

    const embed = new EmbedBuilder()
        .setTitle('✅ Roles Configurados')
        .setDescription(`Se configuraron ${roleIds.length} rol(es) de administrador:\n${roleIds.map(id => `<@&${id}>`).join('\n')}`)
        .setColor(0x57F287);
    message.reply({ embeds: [embed] });
};

// Comando: Consultar tiempo de un usuario
export const handleQueryTime = async (message: Message, args: string[], config: BotConfig, activeSessions: Map<string, { start: Date; channel: string; username: string }>): Promise<void> => {
    const guildId = message.guildId;
    if (!guildId) {
        message.reply('❌ Este comando solo funciona en un servidor.');
        return;
    }

    const serverConfig = getServerConfig(guildId, config);
    const member = message.member ? await message.member.fetch() : null;

    if (!hasAdminPermission(member, serverConfig)) {
        message.reply('❌ No tienes permisos para usar este comando.');
        return;
    }

    // Obtener el usuario objetivo
    let targetUserId: string | null = null;
    let targetUsername: string = '';

    if (args.length === 0) {
        // Si no hay argumentos, consultar el tiempo del usuario que ejecutó el comando
        targetUserId = message.author.id;
        targetUsername = message.author.username;
    } else {
        // Buscar por mención o ID
        const arg = args[0];
        const mentionMatch = arg.match(/^<@!?(\d+)>$/);
        if (mentionMatch) {
            targetUserId = mentionMatch[1];
        } else if (/^\d+$/.test(arg)) {
            targetUserId = arg;
        } else {
            message.reply('❌ Usuario no válido. Menciona al usuario o proporciona su ID.');
            return;
        }

        try {
            const targetUser = await message.client.users.fetch(targetUserId);
            targetUsername = targetUser.username;
        } catch {
            message.reply('❌ No se pudo encontrar el usuario.');
            return;
        }
    }

    // Cargar datos de tiempo
    const timeData = loadData();
    const userData = timeData[targetUserId];

    // Verificar si hay una sesión activa
    const sessionKey = `${guildId}-${targetUserId}`;
    const activeSession = sessionKey ? activeSessions.get(sessionKey) : null;

    // Si no hay datos guardados ni sesión activa
    if ((!userData || userData.sessions.length === 0) && !activeSession) {
        const embed = new EmbedBuilder()
            .setTitle('⏱️ Tiempo de Trabajo')
            .setDescription(`**Usuario:** ${targetUsername}\n\nNo se encontraron sesiones registradas.\n\n💡 **Nota:** Las sesiones se guardan cuando te desconectas del canal. Si estás conectado, la sesión se guardará al salir.`)
            .setColor(0x5865F2);
        message.reply({ embeds: [embed] });
        return;
    }

    // Calcular estadísticas de sesiones guardadas
    let totalHours = 0;
    let totalSessions = 0;
    const sessionsByDate = new Map<string, number>();

    if (userData && userData.sessions.length > 0) {
        totalHours = userData.sessions.reduce((sum, session) => sum + session.hours, 0);
        totalSessions = userData.sessions.length;
        userData.sessions.forEach(session => {
            const current = sessionsByDate.get(session.date) || 0;
            sessionsByDate.set(session.date, current + session.hours);
        });
    }

    // Calcular tiempo de sesión activa si existe
    let activeSessionDuration = 0;
    let activeSessionText = '';
    if (activeSession) {
        const now = new Date();
        const durationMs = now.getTime() - activeSession.start.getTime();
        activeSessionDuration = durationMs / (1000 * 60 * 60);
        const hours = Math.floor(activeSessionDuration);
        const minutes = Math.floor((activeSessionDuration - hours) * 60);
        activeSessionText = `${hours}h ${minutes}m`;
    }

    // Crear embed con la información
    const embed = new EmbedBuilder()
        .setTitle('⏱️ Tiempo de Trabajo')
        .setDescription(`**Usuario:** ${targetUsername}`)
        .setColor(0x5865F2);

    // Agregar información de sesión activa si existe
    if (activeSession) {
        const startTime = activeSession.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        embed.addFields(
            {
                name: '🟢 Sesión Activa',
                value: `Conectado desde: ${startTime}\nDuración: ${activeSessionText}\nCanal: <#${activeSession.channel}>`,
                inline: false
            }
        );
    }

    // Agregar estadísticas de sesiones guardadas
    if (totalSessions > 0) {
        embed.addFields(
            { name: '📊 Total de Horas', value: `${totalHours.toFixed(2)} horas`, inline: true },
            { name: '📅 Total de Sesiones', value: `${totalSessions}`, inline: true },
            { name: '📆 Días Activos', value: `${sessionsByDate.size}`, inline: true }
        );
    } else if (activeSession) {
        embed.addFields(
            { name: '📊 Total de Horas', value: '0.00 horas', inline: true },
            { name: '📅 Total de Sesiones', value: '0', inline: true },
            { name: '📆 Días Activos', value: '0', inline: true }
        );
    }

    // Agregar últimas 10 sesiones (solo si hay sesiones guardadas)
    if (userData && userData.sessions.length > 0) {
        const recentSessions = userData.sessions.slice(-10).reverse();
        const sessionsText = recentSessions.map(session =>
            `📅 ${session.date} | ⏰ ${session.start} | ⏱️ ${session.hours.toFixed(2)}h | 🔊 <#${session.channel}>`
        ).join('\n');
        embed.addFields({ name: '📋 Últimas Sesiones', value: sessionsText.length > 1024 ? sessionsText.substring(0, 1020) + '...' : sessionsText });
    } else if (activeSession) {
        embed.addFields({
            name: '💡 Información',
            value: 'Esta es tu primera sesión. Se guardará automáticamente cuando te desconectes del canal (mínimo 1 minuto de duración).'
        });
    }

    message.reply({ embeds: [embed] });
};

// Función helper para obtener usuario objetivo
const getTargetUser = async (message: Message, args: string[]): Promise<{ userId: string; username: string } | null> => {
    let targetUserId: string | null = null;
    let targetUsername: string = '';

    if (args.length === 0) {
        targetUserId = message.author.id;
        targetUsername = message.author.username;
    } else {
        const arg = args[0];
        const mentionMatch = arg.match(/^<@!?(\d+)>$/);
        if (mentionMatch) {
            targetUserId = mentionMatch[1];
        } else if (/^\d+$/.test(arg)) {
            targetUserId = arg;
        } else {
            return null;
        }

        try {
            const targetUser = await message.client.users.fetch(targetUserId);
            targetUsername = targetUser.username;
        } catch {
            return null;
        }
    }

    return { userId: targetUserId, username: targetUsername };
};

// Comando: Consultar horas por día
export const handleTimeByDay = async (message: Message, args: string[], config: BotConfig, activeSessions: Map<string, { start: Date; channel: string; username: string }>): Promise<void> => {
    const guildId = message.guildId;
    if (!guildId) {
        message.reply('❌ Este comando solo funciona en un servidor.');
        return;
    }

    const serverConfig = getServerConfig(guildId, config);
    const member = message.member ? await message.member.fetch() : null;

    if (!hasAdminPermission(member, serverConfig)) {
        message.reply('❌ No tienes permisos para usar este comando.');
        return;
    }

    const targetUser = await getTargetUser(message, args);
    if (!targetUser) {
        message.reply('❌ Usuario no válido. Menciona al usuario o proporciona su ID.');
        return;
    }

    const timeData = loadData();
    const userData = timeData[targetUser.userId];

    if (!userData || userData.sessions.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📅 Horas por Día')
            .setDescription(`**Usuario:** ${targetUser.username}\n\nNo se encontraron sesiones registradas.`)
            .setColor(0x5865F2);
        message.reply({ embeds: [embed] });
        return;
    }

    // Agrupar sesiones por día
    const hoursByDay = new Map<string, number>();
    userData.sessions.forEach(session => {
        const current = hoursByDay.get(session.date) || 0;
        hoursByDay.set(session.date, current + session.hours);
    });

    // Ordenar por fecha (más reciente primero)
    const sortedDays = Array.from(hoursByDay.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 30); // Últimos 30 días

    if (sortedDays.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📅 Horas por Día')
            .setDescription(`**Usuario:** ${targetUser.username}\n\nNo se encontraron sesiones registradas.`)
            .setColor(0x5865F2);
        message.reply({ embeds: [embed] });
        return;
    }

    // Formatear fechas y crear lista
    const daysList = sortedDays.map(([date, hours]) => {
        const dateObj = new Date(date + 'T00:00:00');
        const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' });
        const formattedDate = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        const hoursFormatted = hours.toFixed(2);
        return `📅 ${formattedDate} (${dayName}) - **${hoursFormatted}h**`;
    }).join('\n');

    const totalHours = sortedDays.reduce((sum, [, hours]) => sum + hours, 0);
    const avgHours = totalHours / sortedDays.length;

    const embed = new EmbedBuilder()
        .setTitle('📅 Horas por Día')
        .setDescription(`**Usuario:** ${targetUser.username}`)
        .addFields(
            { name: '📊 Total', value: `${totalHours.toFixed(2)} horas`, inline: true },
            { name: '📈 Promedio', value: `${avgHours.toFixed(2)} horas/día`, inline: true },
            { name: '📆 Días', value: `${sortedDays.length}`, inline: true },
            { name: '📋 Detalle por Día', value: daysList.length > 1024 ? daysList.substring(0, 1020) + '...' : daysList }
        )
        .setColor(0x5865F2)
        .setFooter({ text: `Mostrando últimos ${sortedDays.length} días` });

    message.reply({ embeds: [embed] });
};

// Comando: Consultar horas por semana
export const handleTimeByWeek = async (message: Message, args: string[], config: BotConfig, activeSessions: Map<string, { start: Date; channel: string; username: string }>): Promise<void> => {
    const guildId = message.guildId;
    if (!guildId) {
        message.reply('❌ Este comando solo funciona en un servidor.');
        return;
    }

    const serverConfig = getServerConfig(guildId, config);
    const member = message.member ? await message.member.fetch() : null;

    if (!hasAdminPermission(member, serverConfig)) {
        message.reply('❌ No tienes permisos para usar este comando.');
        return;
    }

    const targetUser = await getTargetUser(message, args);
    if (!targetUser) {
        message.reply('❌ Usuario no válido. Menciona al usuario o proporciona su ID.');
        return;
    }

    const timeData = loadData();
    const userData = timeData[targetUser.userId];

    if (!userData || userData.sessions.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📆 Horas por Semana')
            .setDescription(`**Usuario:** ${targetUser.username}\n\nNo se encontraron sesiones registradas.`)
            .setColor(0x5865F2);
        message.reply({ embeds: [embed] });
        return;
    }

    // Función para obtener el lunes de la semana de una fecha
    const getWeekStart = (dateStr: string): string => {
        const date = new Date(dateStr + 'T00:00:00');
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para que lunes sea 1
        const monday = new Date(date.setDate(diff));
        return monday.toISOString().split('T')[0];
    };

    // Agrupar sesiones por semana
    const hoursByWeek = new Map<string, number>();
    userData.sessions.forEach(session => {
        const weekStart = getWeekStart(session.date);
        const current = hoursByWeek.get(weekStart) || 0;
        hoursByWeek.set(weekStart, current + session.hours);
    });

    // Ordenar por fecha (más reciente primero)
    const sortedWeeks = Array.from(hoursByWeek.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 12); // Últimas 12 semanas

    if (sortedWeeks.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📆 Horas por Semana')
            .setDescription(`**Usuario:** ${targetUser.username}\n\nNo se encontraron sesiones registradas.`)
            .setColor(0x5865F2);
        message.reply({ embeds: [embed] });
        return;
    }

    // Formatear semanas y crear lista
    const weeksList = sortedWeeks.map(([weekStart, hours]) => {
        const startDate = new Date(weekStart + 'T00:00:00');
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);

        const startFormatted = startDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        const endFormatted = endDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        const hoursFormatted = hours.toFixed(2);
        return `📆 ${startFormatted} - ${endFormatted} - **${hoursFormatted}h**`;
    }).join('\n');

    const totalHours = sortedWeeks.reduce((sum, [, hours]) => sum + hours, 0);
    const avgHours = totalHours / sortedWeeks.length;

    const embed = new EmbedBuilder()
        .setTitle('📆 Horas por Semana')
        .setDescription(`**Usuario:** ${targetUser.username}`)
        .addFields(
            { name: '📊 Total', value: `${totalHours.toFixed(2)} horas`, inline: true },
            { name: '📈 Promedio', value: `${avgHours.toFixed(2)} horas/semana`, inline: true },
            { name: '📆 Semanas', value: `${sortedWeeks.length}`, inline: true },
            { name: '📋 Detalle por Semana', value: weeksList.length > 1024 ? weeksList.substring(0, 1020) + '...' : weeksList }
        )
        .setColor(0x5865F2)
        .setFooter({ text: `Mostrando últimas ${sortedWeeks.length} semanas` });

    message.reply({ embeds: [embed] });
};

// Comando: Listar canales de voz disponibles
export const handleListChannels = async (message: Message): Promise<void> => {
    const guildId = message.guildId;
    if (!guildId) {
        message.reply('❌ Este comando solo funciona en un servidor.');
        return;
    }

    const guild = message.guild;
    if (!guild) {
        message.reply('❌ No se pudo obtener información del servidor.');
        return;
    }

    // Obtener todos los canales de voz
    const voiceChannels = guild.channels.cache.filter(channel => channel.isVoiceBased());

    if (voiceChannels.size === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📋 Canales de Voz')
            .setDescription('No se encontraron canales de voz en este servidor.')
            .setColor(0x5865F2);
        message.reply({ embeds: [embed] });
        return;
    }

    const channelsList = Array.from(voiceChannels.values())
        .map((channel, index) => `${index + 1}. ${channel} \`${channel.id}\``)
        .join('\n');

    const embed = new EmbedBuilder()
        .setTitle('📋 Canales de Voz Disponibles')
        .setDescription(`Usa estos canales con el comando \`${envs.COMMAND_PREFIX}setchannels\`:\n\n${channelsList}`)
        .setFooter({ text: 'Menciona los canales o usa sus IDs' })
        .setColor(0x5865F2);

    message.reply({ embeds: [embed] });
};

// Comando: Ayuda
export const handleHelp = (message: Message, prefix: string): void => {
    const embed = new EmbedBuilder()
        .setTitle('📚 Comandos Disponibles')
        .setDescription('Comandos para gestionar el tracking de tiempo')
        .addFields(
            {
                name: `\`${prefix}setchannels [canales...]\``,
                value: 'Configura qué canales de voz trackear. Menciona los canales o usa sus IDs.',
                inline: false
            },
            {
                name: `\`${prefix}setchannels\``,
                value: 'Muestra los canales actualmente configurados.',
                inline: false
            },
            {
                name: `\`${prefix}listchannels\``,
                value: 'Lista todos los canales de voz disponibles en el servidor.',
                inline: false
            },
            {
                name: `\`${prefix}setadminroles [roles...]\``,
                value: 'Configura qué roles pueden usar comandos y consultar tiempo. Solo administradores.',
                inline: false
            },
            {
                name: `\`${prefix}setadminroles\``,
                value: 'Muestra los roles actualmente configurados.',
                inline: false
            },
            {
                name: `\`${prefix}time [usuario]\``,
                value: 'Consulta el tiempo trabajado de un usuario. Si no se especifica, muestra tu tiempo.',
                inline: false
            },
            {
                name: `\`${prefix}timeday [usuario]\``,
                value: 'Consulta las horas trabajadas por día de un usuario. Muestra los últimos 30 días.',
                inline: false
            },
            {
                name: `\`${prefix}timeweek [usuario]\``,
                value: 'Consulta las horas trabajadas por semana de un usuario. Muestra las últimas 12 semanas.',
                inline: false
            }
        )
        .setColor(0x5865F2);
    message.reply({ embeds: [embed] });
};

