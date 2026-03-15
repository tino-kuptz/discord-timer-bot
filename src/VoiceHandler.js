import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} from '@discordjs/voice';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { logger } from './logger.js';

const connections = new Map(); // guildId -> { connection, player }

/**
 * Join a voice channel and return the connection.
 * @param {import('discord.js').VoiceChannel} channel
 * @returns {import('@discordjs/voice').VoiceConnection}
 */
export function joinChannel(channel) {
  const guildId = channel.guild.id;
  const channelId = channel.id;
  const existing = getVoiceConnection(channel.guild.id);
  if (existing) {
    logger.debug({ guildId, channelId }, 'Bereits im Voice-Channel');
    return existing;
  }
  logger.info({ guildId, channelId }, 'Voice-Channel beitreten');
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false, // Sonst erscheint der Bot als „taub“ und gibt keinen Sound aus
    selfMute: false,
  });
  const player = createAudioPlayer();
  connection.subscribe(player);
  connections.set(guildId, { connection, player });
  return connection;
}

/**
 * Play a sound from a local file path in the guild's current voice connection.
 * @param {string} guildId
 * @param {string} filePath - absolute or relative path to audio file (mp3/ogg)
 * @returns {Promise<void>} resolves when playback finishes or errors
 */
export async function playSound(guildId, filePath) {
  const entry = connections.get(guildId);
  if (!entry) {
    logger.warn({ guildId }, 'playSound: Nicht mit Voice verbunden');
    throw new Error('Not connected to voice in this guild');
  }
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    logger.error({ guildId, absolutePath }, 'Sound-Datei nicht gefunden');
    throw new Error(`Sound-Datei nicht gefunden: ${absolutePath}`);
  }
  logger.debug({ guildId, absolutePath }, 'Spiele Sound ab');

  const { player } = entry;
  // Kein Warten auf VoiceConnectionStatus.Ready – die Verbindung ist beim Join aufgebaut;
  // entersState(Ready) kann hier trotzdem timeouten und verhindert dann die Wiedergabe.
  let resource;
  try {
    resource = createAudioResource(absolutePath);
  } catch (err) {
    logger.error({ err, absolutePath }, 'createAudioResource fehlgeschlagen (z. B. FFmpeg fehlt)');
    throw err;
  }

  player.play(resource);
  return new Promise((resolvePromise, reject) => {
    const cleanup = () => {
      player.removeListener(AudioPlayerStatus.Buffering, onBuffering);
      player.removeListener(AudioPlayerStatus.Playing, onPlaying);
      player.removeListener(AudioPlayerStatus.Idle, onIdle);
      player.removeListener('error', onError);
    };
    const onFinish = () => {
      cleanup();
      logger.debug({ guildId }, 'Sound-Wiedergabe beendet');
      resolvePromise();
    };
    const onError = (err) => {
      cleanup();
      logger.error({ err, guildId, absolutePath }, 'AudioPlayer-Fehler während Wiedergabe');
      reject(err);
    };
    const onBuffering = () => {
      logger.debug({ guildId }, 'Player: Buffering');
    };
    const onPlaying = () => {
      logger.debug({ guildId }, 'Sound wird abgespielt (Playing)');
    };
    const onIdle = () => onFinish();
    player.once(AudioPlayerStatus.Buffering, onBuffering);
    player.once(AudioPlayerStatus.Playing, onPlaying);
    player.once(AudioPlayerStatus.Idle, onIdle);
    player.on('error', onError);
  });
}

/**
 * Leave the voice channel for a guild.
 * @param {string} guildId
 */
export function leaveChannel(guildId) {
  const connection = getVoiceConnection(guildId);
  if (connection) {
    logger.info({ guildId }, 'Voice-Channel verlassen');
    connection.destroy();
    connections.delete(guildId);
  }
}

/**
 * Check if the bot is in a voice channel in this guild.
 * @param {string} guildId
 * @returns {boolean}
 */
export function isInVoice(guildId) {
  return getVoiceConnection(guildId) != null;
}
