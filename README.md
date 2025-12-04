# Timer Bot - Bot de Tracking de Tiempo para Discord

Bot de Discord que rastrea automáticamente el tiempo que los usuarios pasan en canales de voz específicos.

## 🚀 Configuración Inicial

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
DISCORD_TOKEN=tu_token_del_bot_aqui
COMMAND_PREFIX=!
```

**Obtener el token del bot:**
1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Crea una nueva aplicación o selecciona una existente
3. Ve a la sección "Bot"
4. Copia el token y pégalo en `DISCORD_TOKEN`

**Permisos necesarios del bot:**
- Ver canales
- Enviar mensajes
- Leer historial de mensajes
- Conectar (para canales de voz)
- Hablar (opcional, pero recomendado)

### 3. Ejecutar el bot

**Modo desarrollo (con recarga automática):**
```bash
npm run dev
```

**Modo producción:**
```bash
npm run build
npm start
```

## 📖 Comandos Disponibles

### Configuración de Canales

**Configurar canales a trackear:**
```
!setchannels #canal1 #canal2 #canal3
```
o usando IDs:
```
!setchannels 123456789012345678 987654321098765432
```

**Ver canales configurados:**
```
!setchannels
```

### Configuración de Roles de Administrador

**Configurar roles que pueden usar comandos:**
```
!setadminroles @RolAdmin @RolModerador
```
o usando IDs:
```
!setadminroles 123456789012345678
```

**Ver roles configurados:**
```
!setadminroles
```

> **Nota:** Solo los administradores del servidor pueden configurar roles. Si no hay roles configurados, solo los administradores del servidor pueden usar comandos.

### Consultar Tiempo

**Consultar tu propio tiempo:**
```
!time
```

**Consultar tiempo de otro usuario:**
```
!time @usuario
```
o usando ID:
```
!time 123456789012345678
```

### Ayuda

**Ver todos los comandos:**
```
!help
```

## 🔧 Funcionamiento

### Tracking Automático

1. **Configuración inicial:** Un administrador debe configurar qué canales de voz trackear usando `!setchannels`.

2. **Inicio de sesión:** Cuando un usuario entra a un canal de voz configurado, el bot inicia automáticamente el tracking.

3. **Fin de sesión:** Cuando el usuario sale del canal, el bot calcula la duración y guarda la sesión.

4. **Cambio de canal:** Si el usuario cambia de un canal trackeado a otro, se finaliza la sesión anterior y se inicia una nueva.

5. **Duración mínima:** Solo se guardan sesiones que duran al menos 1 minuto.

### Almacenamiento de Datos

- Los datos de tiempo se guardan en `data/time_data.json`
- La configuración del bot se guarda en `data/bot_config.json`
- Los archivos se crean automáticamente si no existen

### Estructura de Datos

Cada sesión guarda:
- **Fecha:** Formato `yyyy-mm-dd`
- **Hora de inicio:** Formato `hh:mm:ss`
- **Duración:** En horas (decimal)
- **Canal:** ID del canal de voz

## 📊 Ejemplo de Uso

1. **Configurar el bot:**
   ```
   !setchannels #trabajo #reuniones
   !setadminroles @Manager @Supervisor
   ```

2. **Los usuarios entran a los canales configurados:**
   - El bot rastrea automáticamente el tiempo
   - No requiere ninguna acción del usuario

3. **Consultar tiempo trabajado:**
   ```
   !time @usuario
   ```
   
   El bot mostrará:
   - Total de horas trabajadas
   - Total de sesiones
   - Días activos
   - Últimas 10 sesiones con detalles

## 🛠️ Solución de Problemas

### El bot no responde a comandos
- Verifica que el prefijo esté correcto (por defecto `!`)
- Asegúrate de que el bot tenga permisos para leer mensajes
- Verifica que el comando se ejecute en un servidor (no en DM)

### No se está trackeando el tiempo
- Verifica que los canales estén configurados con `!setchannels`
- Asegúrate de que el bot tenga permisos para ver los canales de voz
- Verifica que el bot esté en línea y funcionando

### Error de permisos
- Solo administradores del servidor pueden configurar roles
- Solo usuarios con roles de administrador configurados (o administradores del servidor) pueden usar comandos
- Si no hay roles configurados, solo administradores del servidor pueden usar comandos

## 📝 Notas

- El bot rastrea tiempo por servidor (cada servidor tiene su propia configuración)
- Las sesiones se guardan localmente en archivos JSON
- El bot debe estar en línea para trackear tiempo
- Si el bot se reinicia, las sesiones activas se perderán (pero las guardadas se mantienen)

## 🔒 Permisos Requeridos

El bot necesita los siguientes permisos en Discord:
- ✅ Ver canales
- ✅ Enviar mensajes
- ✅ Leer historial de mensajes
- ✅ Conectar (canales de voz)
- ✅ Ver miembros (opcional, pero recomendado)

