import pino from 'pino';

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const envLevel = (process.env.DEBUG_LEVEL || 'info').toLowerCase();
const level = LEVELS.includes(envLevel) ? envLevel : 'info';

export const logger = pino({
  level,
  base: { name: 'discord-timer-bot' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
