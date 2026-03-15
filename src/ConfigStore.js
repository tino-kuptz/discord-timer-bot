import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

const DATA_PATH = process.env.DATA_PATH || './data';

function guildPath(guildId) {
  return join(DATA_PATH, `${guildId}.json`);
}

function ensureDataDir() {
  if (!existsSync(DATA_PATH)) {
    mkdirSync(DATA_PATH, { recursive: true });
  }
}

function loadGuild(guildId) {
  ensureDataDir();
  const path = guildPath(guildId);
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveGuild(guildId, data) {
  ensureDataDir();
  writeFileSync(guildPath(guildId), JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Get stored soundId for a user in a guild.
 * @param {string} userId
 * @param {string} guildId
 * @returns {string|null} soundId or null if not set
 */
export function getSound(userId, guildId) {
  const data = loadGuild(guildId);
  const user = data[userId];
  return user?.soundId ?? null;
}

/**
 * Set soundId for a user in a guild.
 * @param {string} userId
 * @param {string} guildId
 * @param {string} soundId
 */
export function setSound(userId, guildId, soundId) {
  const data = loadGuild(guildId);
  if (!data[userId]) {
    data[userId] = {};
  }
  data[userId].soundId = soundId;
  saveGuild(guildId, data);
  logger.debug({ userId, guildId, soundId }, 'Config gespeichert');
}
