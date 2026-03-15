# Discord Timer Bot

Wird von uns, um Leserunden im Discord zu timen. Daher ist der Bot entsprechend gebrandet.

Link, um den auf den eigenen Server zu bekommen: [Anfrage](https://discord.com/oauth2/authorize?client_id=1482755309054464170&permissions=4400197142528&integration_type=0&scope=bot+applications.commands).  
Alternativ unten Infos, wie man den selber branden und in Betrieb nehmen kann.

## Verwendung

Weiter unten genauer, Kurzfassung:
* einmalig: mit `/sound <Name>` einen Sound aus dem Soundboard auswählen  
  Das ist eine pro-User Einstellung
* einem Channel beitreten
* `/timer <Minuten>` startet den Timer

Alle aktiven Timer kann man mit `/timer` sehen.  
Der Bot tritt sofort dem eigenem Channel bei und spielt nach x Minuten den Sound ab.  
Nach über einer Stunde ohne neuen Timer trennt der Bot automatisch die Verbindung zum Voice.

**Der Bot funktioniert nur auf Servern("guilds")**

## Selber hosten

Nur falls man den Bot selber betreiben möchte.

### Discord-Bot aufsetzen

1. **Bot im Discord Developer Portal anlegen**
   - Öffne das [Discord Developer Portal](https://discord.com/developers/applications) und klicke auf „New Application“. Vergebe einen Namen (z. B. „Timer Bot“).
   - Gehe zu „Bot“ und klicke auf „Add Bot“. Kopiere den **Token** und trage ihn in deine `.env`-Datei als `DISCORD_TOKEN` ein (niemals ins Repo committen).

2. **Berechtigungen & Einladungslink**
   - Unter **OAuth2 → URL Generator** wähle die Scopes `bot` und `applications.commands`.
   - Unter **Bot Permissions** wähle z. B. „Connect“, „Speak“, „Use Soundboard“, „Send Messages“, „Use Application Commands“.
   - Nutze die generierte URL, um den Bot auf einen Server einzuladen.

3. **FFmpeg (für Sound-Wiedergabe)**
   - NUR WENN NICHT DOCKER
   - Damit der Bot Sounds im Voice-Channel abspielen kann, muss **FFmpeg** installiert sein:
     - **macOS:** `brew install ffmpeg`
     - **Ubuntu/Debian:** `sudo apt install ffmpeg`
     - **Windows:** z. B. von [ffmpeg.org](https://ffmpeg.org/download.html) oder `winget install ffmpeg`
   - Ohne FFmpeg startet der Bot, aber beim Timer-Ende erscheint: „FFmpeg/avconv not found“. Dre Bot sendet dann nur eine Info per Nachricht, dass die Nachricht abgelaufen ist.

5. **Lokaler Start**
   - NUR WENN NICHT DOCKER
   - Abhängigkeiten installieren: `npm install`
   - `.env` anlegen (z. B. aus `.env.example` kopieren) und mindestens eintragen:
     - `DISCORD_TOKEN` – Bot-Token aus dem Developer Portal
     - `DATA_PATH=./data` (optional, Standard: `./data`) – Ordner für Konfiguration und zwischengespeicherte Sounds
     - `DEBUG_LEVEL` (optional, Standard: `info`) – Mindestlevel für Logging: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
   - Bot starten: `npm start` (bzw. `node src/index.js`)



### Docker

Starten des Containers:

```bash
# Wenn `docker volume` ausgeführt; alternativ bind mount mit Verzeichnis
docker run -d --name discord-timer-bot \
  -e DISCORD_TOKEN=dein_bot_token \
  -v discord-timer-bot-data:/data \
  ghcr.io/tino-kuptz/discord-timer-bot:latest
```

Als compose:

```yaml
services:
  discord-timer-bot:
    image: ghcr.io/tino-kuptz/discord-timer-bot:latest
    container_name: discord-timer-bot
    restart: unless-stopped
    environment:
      - DISCORD_TOKEN=XXXXX
      - DATA_PATH=/data
      - DEBUG_LEVEL=info
    volumes:
      - bot-data:/data

volumes:
  bot-data:
```

Daten (Config + gecachte Sounds) liegen im Volume `bot-data` bzw. unter dem gemounteten Pfad.  
Pro Guild eine JSON, in dieser alle User, in denen die hinterlegten Sounds.
