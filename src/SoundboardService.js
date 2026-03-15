import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

const DATA_PATH = process.env.DATA_PATH || './data';
const SOUNDS_DIR = join(DATA_PATH, 'sounds');
const API_BASE = 'https://discord.com/api/v10';
const CDN_SOUND = 'https://cdn.discordapp.com/soundboard-sounds';

function getAuthHeaders() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN not set');
  return {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Fetch default soundboard sounds from Discord API.
 * @returns {Promise<Array<{ sound_id: string, name: string }>>}
 */
async function fetchDefaultSounds() {
  const res = await fetch(`${API_BASE}/soundboard-default-sounds`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, 'Default-Soundboard-Sounds API fehlgeschlagen');
    return [];
  }
  const data = await res.json();
  const items = Array.isArray(data) ? data : data.items ?? [];
  logger.debug({ count: items.length }, 'Default-Sounds geladen');
  return items;
}

/**
 * Fetch guild soundboard sounds from Discord API.
 * @param {string} guildId
 * @returns {Promise<Array<{ sound_id: string, name: string }>>}
 */
async function fetchGuildSounds(guildId) {
  const res = await fetch(`${API_BASE}/guilds/${guildId}/soundboard-sounds`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    logger.debug({ guildId, status: res.status }, 'Guild-Soundboard-Sounds API fehlgeschlagen oder leer');
    return [];
  }
  const data = await res.json();
  const items = data.items ?? (Array.isArray(data) ? data : []);
  logger.debug({ guildId, count: items.length }, 'Guild-Sounds geladen');
  return items;
}

/**
 * Get all available sounds for a guild (default + guild-specific).
 * @param {string} guildId
 * @returns {Promise<Array<{ sound_id: string, name: string }>>}
 */
export async function getAvailableSounds(guildId) {
  const [defaultSounds, guildSounds] = await Promise.all([
    fetchDefaultSounds(),
    fetchGuildSounds(guildId),
  ]);
  const byId = new Map();
  for (const s of defaultSounds) {
    const id = s.sound_id ?? s.soundId;
    if (id) byId.set(id, { sound_id: String(id), name: s.name || '' });
  }
  for (const s of guildSounds) {
    const id = s.sound_id ?? s.soundId;
    if (id) byId.set(id, { sound_id: String(id), name: s.name || '' });
  }
  return [...byId.values()];
}

/**
 * Resolve sound name to sound_id (case-insensitive). Returns null if not found.
 * @param {string} guildId
 * @param {string} name
 * @returns {Promise<string|null>}
 */
export async function getSoundIdByName(guildId, name) {
  const sounds = await getAvailableSounds(guildId);
  const lower = (name || '').trim().toLowerCase();
  const found = sounds.find((s) => (s.name || '').toLowerCase() === lower);
  return found ? found.sound_id : null;
}

function ensureSoundsDir() {
  if (!existsSync(DATA_PATH)) {
    mkdirSync(DATA_PATH, { recursive: true });
  }
  if (!existsSync(SOUNDS_DIR)) {
    mkdirSync(SOUNDS_DIR, { recursive: true });
  }
}

/**
 * Get local path for a sound; download from Discord CDN if not cached.
 * @param {string} soundId
 * @returns {Promise<string>} absolute path to the sound file
 */
export async function getOrDownloadSound(soundId) {
  ensureSoundsDir();
  const ext = '.mp3';
  const path = join(SOUNDS_DIR, `${soundId}${ext}`);
  if (existsSync(path)) {
    logger.debug({ soundId }, 'Sound aus Cache');
    return path;
  }
  const url = `${CDN_SOUND}/${soundId}`;
  logger.info({ soundId, url }, 'Lade Sound von CDN');
  const res = await fetch(url);
  if (!res.ok) {
    logger.error({ soundId, status: res.status }, 'Sound-Download fehlgeschlagen');
    throw new Error(`Failed to download sound ${soundId}: ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  writeFileSync(path, Buffer.from(buffer));
  logger.debug({ soundId, path }, 'Sound gespeichert');
  return path;
}
