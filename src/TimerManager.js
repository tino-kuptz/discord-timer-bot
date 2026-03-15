import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const EXPIRED_IGNORE_MS = 2 * 60 * 1000; // Timer > 2 min abgelaufen → ignorieren

const DATA_PATH = process.env.DATA_PATH || './data';
const TIMERS_FILE = join(DATA_PATH, 'timers.json');

// guildId -> Map<userId, { channel, timeoutId, endTime, minutesClamped, textChannelId }>
const timers = new Map();
// guildId -> NodeJS.Timeout (idle leave)
const guildIdleTimeouts = new Map();

let voiceHandlerRef = null;
let configStoreRef = null;
let soundboardServiceRef = null;

function ensureDataDir() {
  if (!existsSync(DATA_PATH)) {
    mkdirSync(DATA_PATH, { recursive: true });
  }
}

function saveTimersToFile() {
  ensureDataDir();
  const data = {};
  for (const [guildId, guildTimers] of timers) {
    data[guildId] = {};
    for (const [userId, entry] of guildTimers) {
      if (!entry?.endTime) continue;
      data[guildId][userId] = {
        voiceChannelId: entry.channel?.id,
        textChannelId: entry.textChannelId ?? null,
        endTime: entry.endTime,
        minutesClamped: entry.minutesClamped ?? 0,
      };
    }
  }
  writeFileSync(TIMERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  logger.debug({ path: TIMERS_FILE }, 'timers.json geschrieben');
}

function loadTimersFromFile() {
  if (!existsSync(TIMERS_FILE)) return {};
  try {
    const raw = readFileSync(TIMERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    logger.warn({ err: e, path: TIMERS_FILE }, 'timers.json konnte nicht geladen werden');
    return {};
  }
}

/**
 * Send message, play sound, schedule idle leave (shared by timeout and restore).
 * @param {string} userId
 * @param {string} guildId
 * @param {number} minutesClamped
 * @param {import('discord.js').TextChannel|null} replyChannel
 */
async function fireTimerCallback(userId, guildId, minutesClamped, replyChannel) {
  const minuteLabel = minutesClamped === 1 ? 'Minute' : 'Minuten';
  const timerMessage = `Der **${minutesClamped} ${minuteLabel}** Timer von <@${userId}> ist abgelaufen.`;
  if (replyChannel) {
    await replyChannel.send(timerMessage).catch(() => {});
  }
  try {
    const soundId = configStoreRef.getSound(userId, guildId);
    if (soundId) {
      const path = await soundboardServiceRef.getOrDownloadSound(soundId);
      await voiceHandlerRef.playSound(guildId, path);
      logger.debug({ userId, guildId, soundId }, 'Sound abgespielt');
    } else {
      logger.debug({ userId, guildId }, 'Kein Sound konfiguriert');
    }
  } catch (err) {
    logger.error({ err, userId, guildId }, 'Timer-Soundwiedergabe fehlgeschlagen');
    if (replyChannel) {
      await replyChannel.send('Sound konnte nicht abgespielt werden.').catch(() => {});
    }
  }
  scheduleIdleLeave(guildId);
}

function scheduleIdleLeave(guildId) {
  const prev = guildIdleTimeouts.get(guildId);
  if (prev) clearTimeout(prev);
  guildIdleTimeouts.delete(guildId);
  logger.debug({ guildId }, 'Idle-Timer gestartet (1h bis Auto-Leave)');
  const timeoutId = setTimeout(() => {
    voiceHandlerRef.leaveChannel(guildId);
    guildIdleTimeouts.delete(guildId);
    logger.info({ guildId }, 'Voice-Channel nach Idle verlassen');
  }, IDLE_MS);
  guildIdleTimeouts.set(guildId, timeoutId);
}

/**
 * Initialize with dependencies.
 * @param {object} voiceHandler
 * @param {object} configStore
 * @param {object} soundboardService
 */
export function initTimerManager(voiceHandler, configStore, soundboardService) {
  voiceHandlerRef = voiceHandler;
  configStoreRef = configStore;
  soundboardServiceRef = soundboardService;
  logger.debug('TimerManager initialisiert');
}

/**
 * Restore timers from timers.json after bot start.
 * - Noch ausstehend (endTime > now): Timer setzen, ggf. Channel joinen.
 * - Seit ≤2 Min abgelaufen: einmalig abspielen/Benachrichtigung, dann verwerfen.
 * - Seit >2 Min abgelaufen: ignorieren.
 * @param {import('discord.js').Client} client
 */
export async function restoreTimers(client) {
  const data = loadTimersFromFile();
  const now = Date.now();
  let restored = 0;
  let fired = 0;
  let ignored = 0;

  for (const [guildId, guildData] of Object.entries(data)) {
    if (!guildData || typeof guildData !== 'object') continue;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      ignored += Object.keys(guildData).length;
      continue;
    }

    for (const [userId, entry] of Object.entries(guildData)) {
      if (!entry?.endTime) continue;
      const endTime = Number(entry.endTime);
      const voiceChannelId = entry.voiceChannelId;
      const textChannelId = entry.textChannelId;
      const minutesClamped = Number(entry.minutesClamped) || 1;

      const voiceChannel = await guild.channels.fetch(voiceChannelId).catch(() => null);
      const textChannel = textChannelId ? await client.channels.fetch(textChannelId).catch(() => null) : null;

      const isVoice = voiceChannel && (typeof voiceChannel.isVoiceBased === 'function' ? voiceChannel.isVoiceBased() : [2, 13].includes(voiceChannel.type));
      if (endTime > now) {
        const remainingMs = endTime - now;
        if (!isVoice) {
          ignored++;
          continue;
        }
        voiceHandlerRef.joinChannel(voiceChannel);
        const guildTimers = timers.get(guildId) ?? new Map();
        timers.set(guildId, guildTimers);

        const timeoutId = setTimeout(async () => {
          guildTimers.delete(userId);
          if (guildTimers.size === 0) timers.delete(guildId);
          logger.info({ userId, guildId }, 'Timer abgelaufen (wiederhergestellt)');
          await fireTimerCallback(userId, guildId, minutesClamped, textChannel);
          saveTimersToFile();
        }, remainingMs);

        guildTimers.set(userId, {
          channel: voiceChannel,
          timeoutId,
          endTime,
          minutesClamped,
          textChannelId: textChannelId ?? null,
        });
        restored++;
        logger.info({ userId, guildId, remainingMs: Math.round(remainingMs / 1000) }, 'Timer wiederhergestellt');
      } else if (now - endTime <= EXPIRED_IGNORE_MS) {
        if (isVoice) {
          voiceHandlerRef.joinChannel(voiceChannel);
          await fireTimerCallback(userId, guildId, minutesClamped, textChannel);
          fired++;
        } else {
          ignored++;
        }
      } else {
        ignored++;
      }
    }
  }

  if (restored > 0 || fired > 0 || ignored > 0) {
    logger.info({ restored, fired, ignored }, 'Timer-Wiederherstellung abgeschlossen');
  }
  saveTimersToFile();
}

/**
 * Start a timer for a user in a guild. Only one timer per user per guild.
 * @param {string} userId
 * @param {string} guildId
 * @param {import('discord.js').VoiceChannel} channel
 * @param {number} minutes
 * @param {import('discord.js').TextChannel} [replyChannel]
 */
export function startTimer(userId, guildId, channel, minutes, replyChannel) {
  cancelTimer(userId, guildId);
  const guildTimers = timers.get(guildId) ?? new Map();
  timers.set(guildId, guildTimers);

  const minutesClamped = Math.max(1, Math.min(1440, minutes));
  const ms = minutesClamped * 60 * 1000;
  const endTime = Date.now() + ms;

  voiceHandlerRef.joinChannel(channel);
  logger.debug({ userId, guildId, channelId: channel.id, minutes: minutesClamped }, 'Bot Channel beigetreten, Timer läuft');

  const timeoutId = setTimeout(async () => {
    guildTimers.delete(userId);
    if (guildTimers.size === 0) {
      timers.delete(guildId);
    }
    logger.info({ userId, guildId }, 'Timer abgelaufen');
    await fireTimerCallback(userId, guildId, minutesClamped, replyChannel ?? null);
    saveTimersToFile();
  }, ms);

  guildTimers.set(userId, {
    channel,
    timeoutId,
    endTime,
    minutesClamped,
    textChannelId: replyChannel?.id ?? null,
  });
  saveTimersToFile();
}

/**
 * Get remaining minutes for a user's timer in a guild.
 * @param {string} userId
 * @param {string} guildId
 * @returns {number|null} remaining minutes (rounded up) or null if no timer
 */
export function getRemainingMinutes(userId, guildId) {
  const guildTimers = timers.get(guildId);
  if (!guildTimers) return null;
  const entry = guildTimers.get(userId);
  if (!entry?.endTime) return null;
  const remaining = entry.endTime - Date.now();
  if (remaining <= 0) return null;
  return Math.ceil(remaining / 60000);
}

/**
 * Get all active timers on a guild.
 * @param {string} guildId
 * @returns {Array<{ userId: string, minutes: number, remaining: number }>}
 */
export function getAllActiveTimers(guildId) {
  const guildTimers = timers.get(guildId);
  if (!guildTimers || guildTimers.size === 0) return [];
  const now = Date.now();
  const result = [];
  for (const [uid, entry] of guildTimers) {
    if (!entry?.endTime) continue;
    const remaining = entry.endTime - now;
    if (remaining <= 0) continue;
    result.push({
      userId: uid,
      minutes: entry.minutesClamped ?? 0,
      remaining: Math.ceil(remaining / 60000),
    });
  }
  return result;
}

/**
 * Cancel timer for a user in a guild.
 */
export function cancelTimer(userId, guildId) {
  const guildTimers = timers.get(guildId);
  if (!guildTimers) return;
  const entry = guildTimers.get(userId);
  if (entry) {
    clearTimeout(entry.timeoutId);
    guildTimers.delete(userId);
    if (guildTimers.size === 0) timers.delete(guildId);
    logger.debug({ userId, guildId }, 'Timer abgebrochen');
    saveTimersToFile();
  }
}
