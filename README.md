# Discord Timer Bot

Ein Bot, mit dem man Timer aufsetzen kann.  
Quick and dirty.

Link, um den auf den eigenen Server zu bekommen: [Anfrage](https://discord.com/oauth2/authorize?client_id=1482755309054464170&permissions=4400197142528&integration_type=0&scope=bot+applications.commands)

## Discord-Bot aufsetzen

1. **Bot im Discord Developer Portal anlegen**
   - Öffne das [Discord Developer Portal](https://discord.com/developers/applications) und klicke auf „New Application“. Vergebe einen Namen (z. B. „Timer Bot“).
   - Gehe zu „Bot“ und klicke auf „Add Bot“. Kopiere den **Token** und trage ihn in deine `.env`-Datei als `DISCORD_TOKEN` ein (niemals ins Repo committen).

2. **Berechtigungen & Einladungslink**
   - Unter **OAuth2 → URL Generator** wähle die Scopes `bot` und `applications.commands`.
   - Unter **Bot Permissions** wähle z. B. „Connect“, „Speak“, „Use Soundboard“, „Send Messages“, „Use Application Commands“.
   - Nutze die generierte URL, um den Bot auf einen Server einzuladen.

3. **FFmpeg (für Sound-Wiedergabe)**
   - Damit der Bot Sounds im Voice-Channel abspielen kann, muss **FFmpeg** installiert sein:
     - **macOS:** `brew install ffmpeg`
     - **Ubuntu/Debian:** `sudo apt install ffmpeg`
     - **Windows:** z. B. von [ffmpeg.org](https://ffmpeg.org/download.html) oder `winget install ffmpeg`
   - Ohne FFmpeg startet der Bot, aber beim Timer-Ende erscheint: „FFmpeg/avconv not found“. Dre Bot sendet dann nur eine Info per Nachricht, dass die Nachricht abgelaufen ist.

4. **Lokaler Start**
   - Abhängigkeiten installieren: `npm install`
   - `.env` anlegen (z. B. aus `.env.example` kopieren) und mindestens eintragen:
     - `DISCORD_TOKEN` – Bot-Token aus dem Developer Portal
     - `DATA_PATH=./data` (optional, Standard: `./data`) – Ordner für Konfiguration und zwischengespeicherte Sounds
     - `DEBUG_LEVEL` (optional, Standard: `info`) – Mindestlevel für Logging: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
   - Bot starten: `npm start` (bzw. `node src/index.js`)

7. **Hinweis Voice**
   - Du musst in einem Voice-Channel sein, damit der Bot joinen und den Timer dort abspielen kann. Sonst erscheint die Meldung: „Bitte zuerst einem Voice-Channel beitreten.“


## Funktionsweise

Du musst den Bot zu deinem Server hinzufügen.  
Wenn du `/timer <Minuten>` eingibst, wird der Bot:
* deinem Voice-Channel beitreten (falls noch nicht geschehen)
* `<Minuten>` Minuten warten
* einen Sound abspielen
* nach einer Stunde ohne weiteren Befehl den Channel automatisch wieder verlassen

### Abzuspielender Sound

Du kannst den Sound, den der Bot abspielen soll, mit `/sound <Name>` konfigurieren. Es wird ein Sound aus dem Soundboard genutzt.  
Falls der Sound abgespielt werden kann, sagt der Bot Bescheid; ansonsten gibt er Bescheid, dass das nicht geht.

## Konfiguration

Die Konfiguration ist benutzer- und serverbasiert.  
Der Bot wird:
* den Sound für einen bestimmten Nutzer auf einem bestimmten Server speichern
* die Konfiguration nach einem Neustart behalten
* Timer pro Nutzer und pro Server setzen (es ist immer nur ein Timer pro Nutzer und pro Server möglich)

