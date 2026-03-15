import 'dotenv/config';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import * as DiscordBot from './DiscordBot.js';
import { logger } from './logger.js';

const DATA_PATH = process.env.DATA_PATH || './data';
const soundsPath = join(DATA_PATH, 'sounds');

if (!existsSync(DATA_PATH)) {
  mkdirSync(DATA_PATH, { recursive: true });
  logger.debug({ path: DATA_PATH }, 'Datenverzeichnis angelegt');
}
if (!existsSync(soundsPath)) {
  mkdirSync(soundsPath, { recursive: true });
  logger.debug({ path: soundsPath }, 'Sounds-Verzeichnis angelegt');
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
  logger.fatal('DISCORD_TOKEN fehlt in .env');
  process.exit(1);
}

logger.info({ dataPath: DATA_PATH, level: process.env.DEBUG_LEVEL || 'info' }, 'Starte Bot');
DiscordBot.start(token).catch((err) => {
  logger.fatal({ err }, 'Bot-Start fehlgeschlagen');
  process.exit(1);
});
