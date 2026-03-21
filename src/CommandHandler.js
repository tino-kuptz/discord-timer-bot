import discord from 'discord.js';
const { SlashCommandBuilder, MessageFlags, PermissionsBitField } = discord;
const { Connect, Speak } = PermissionsBitField.Flags;
import * as ConfigStore from './ConfigStore.js';
import * as SoundboardService from './SoundboardService.js';
import * as TimerManager from './TimerManager.js';
import * as VoiceHandler from './VoiceHandler.js';
import { logger } from './logger.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('timer')
    .setDescription('Timer starten oder verbleibende Minuten anzeigen.')
    .addIntegerOption((o) =>
      o.setName('minutes').setDescription('Minuten warten (weglassen = Restzeit anzeigen)').setRequired(false).setMinValue(1).setMaxValue(1440)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('sound')
    .setDescription('Sound für Timer-Ende wählen (vom Soundboard).')
    .addStringOption((o) =>
      o.setName('name').setDescription('Name des Sounds (wird aus Soundboard ausgewählt)').setRequired(true)
    )
    .toJSON(),
];

/**
 * Handle slash command interaction.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  logger.debug({ commandName, userId, guildId }, 'Slash-Befehl empfangen');

  if (!guildId) {
    await interaction.reply({ content: 'Dieser Befehl kann nur in einem Server verwendet werden.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (commandName === 'sound') {
    const name = interaction.options.getString('name', true);
    logger.debug({ guildId, name }, 'Sound-Befehl');
    const soundId = await SoundboardService.getSoundIdByName(guildId, name);
    if (!soundId) {
      logger.info({ guildId, name }, 'Sound nicht gefunden');
      await interaction.reply({
        content: 'Fehler beim Setzen des Sounds: Sound nicht gefunden',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await SoundboardService.getOrDownloadSound(soundId);
    } catch (e) {
      logger.warn({ err: e, soundId }, 'Sound-Download fehlgeschlagen');
      await interaction.reply({
        content: 'Fehler beim Setzen des Sounds: Sound konnte nicht heruntergeladen werden.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    ConfigStore.setSound(userId, guildId, soundId);
    logger.info({ userId, guildId, soundId, name }, 'Sound gesetzt');
    await interaction.reply({ content: 'Sound set.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (commandName === 'timer') {
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;
    const minutesOpt = interaction.options.getInteger('minutes');

    if (minutesOpt != null) {
      if (!voiceChannel) {
        logger.debug({ userId, guildId }, 'Timer abgelehnt: User nicht im Voice-Channel');
        await interaction.reply({
          content: 'Bitte zuerst einem Voice-Channel beitreten.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      const perms = voiceChannel.permissionsFor(me);
      if (!perms?.has(Connect) || !perms.has(Speak)) {
        logger.info({ guildId, channelId: voiceChannel.id }, 'Timer abgelehnt: Bot darf Channel nicht betreten oder sprechen');
        await interaction.reply({
          content: 'Ich darf diesem Voice-Channel nicht beitreten oder dort sprechen. Bitte Berechtigungen prüfen (Verbinden + Sprechen).',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      TimerManager.startTimer(userId, guildId, voiceChannel, minutesOpt, interaction.channel);
      logger.info({ userId, guildId, minutes: minutesOpt, channelId: voiceChannel.id }, 'Timer gestartet');
      await interaction.reply({
        content: `Timer gestartet: ${minutesOpt} Minute(n).`,
      });
      return;
    }

    const activeTimers = TimerManager.getAllActiveTimers(guildId);
    logger.debug({ guildId, count: activeTimers.length }, 'Aktive Timer abgefragt');
    if (activeTimers.length === 0) {
      await interaction.reply({
        content: 'Kein Timer aktiv. Gib eine Minutenzahl an, z. B. `/timer 5`.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const lines = activeTimers.map((t) => {
        const minLabel = t.minutes === 1 ? 'Minute' : 'Minuten';
        return `${t.minutes} ${minLabel} Timer von <@${t.userId}>: <t:${t.endTimeUnix}:R>`;
      });
      await interaction.reply({
        content: lines.join('\n'),
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
