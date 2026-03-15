import pkg from 'discord.js';
const { Client, GatewayIntentBits, MessageFlags, REST, Routes } = pkg;
import * as CommandHandler from './CommandHandler.js';
import * as ConfigStore from './ConfigStore.js';
import * as SoundboardService from './SoundboardService.js';
import * as TimerManager from './TimerManager.js';
import * as VoiceHandler from './VoiceHandler.js';
import { logger } from './logger.js';

let client = null;

export function getClient() {
  return client;
}

/**
 * Create and start the Discord bot.
 * @param {string} token
 */
export async function start(token) {
  logger.debug('Initialisiere TimerManager');
  TimerManager.initTimerManager(VoiceHandler, ConfigStore, SoundboardService);

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  client.once('clientReady', async () => {
    logger.info({ user: client.user.tag, id: client.user.id }, 'Bot eingeloggt');
    const rest = new REST().setToken(token);
    let appId = client.application?.id;
    if (!appId) {
      await client.application?.fetch().catch(() => {});
      appId = client.application?.id ?? client.user?.id;
    }
    if (appId) {
      try {
        await rest.put(Routes.applicationCommands(appId), {
          body: CommandHandler.commands,
        });
        logger.info({ appId }, 'Slash-Commands registriert');
      } catch (e) {
        logger.error({ err: e }, 'Registrierung der Slash-Commands fehlgeschlagen');
      }
    }
    try {
      await TimerManager.restoreTimers(client);
    } catch (e) {
      logger.error({ err: e }, 'Wiederherstellung der Timer fehlgeschlagen');
    }
  });

  client.on('interactionCreate', (interaction) => {
    CommandHandler.handleInteraction(interaction).catch((err) => {
      logger.warn({ err, commandName: interaction?.commandName, guildId: interaction?.guildId }, 'Befehlsfehler');
      if (interaction.replied || interaction.deferred) {
        interaction.followUp({ content: 'Ein Fehler ist aufgetreten.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        interaction.reply({ content: 'Ein Fehler ist aufgetreten.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    });
  });

  logger.debug('Starte Login');
  await client.login(token);
}
