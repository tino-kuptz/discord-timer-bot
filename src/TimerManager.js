import { logger } from './logger.js';

const IDLE_MS = 60 * 60 * 1000; // 1 hour

// guildId -> Map<userId, { channel, timeoutId, endTime }>
const timers = new Map();
// guildId -> NodeJS.Timeout (idle leave)
const guildIdleTimeouts = new Map();

let voiceHandlerRef = null;
let configStoreRef = null;
let soundboardServiceRef = null;

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
  }, ms);

  guildTimers.set(userId, { channel, timeoutId, endTime, minutesClamped });
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
  }
}
