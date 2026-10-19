# ESP32 multi-speaker muziek (geparkeerd idee, code bewaard)

Run alle commando's vanuit deze map (`esp32/`). Plaats je eigen mp3's in `../music/` (niet in git).

De ESP32 zoekt zelf Bluetooth-speakers, verbindt ze één voor één en speelt de mp3's zacht af.
Een ESP32 kan maar met één speaker tegelijk verbonden zijn, dus de speakers komen na elkaar aan de beurt.

1. `winget install Gyan.FFmpeg`
2. `python tools/prepare_audio.py`: zet de mp3's uit music/ om naar `data/track1.mp3`, `data/track2.mp3`
3. ESP32 (klassiek, geen S2/S3/C3) aan USB, daarna:
   - `python -m platformio run -t uploadfs`: audio uploaden
   - `python -m platformio run -t upload`: code uploaden
   - `python -m platformio device monitor`: logs bekijken
4. Zet de speakers in koppelmodus en ontkoppel ze van je gsm.

Volume en gedrag staan in `src/config.h`. Standaard 15% met een hard maximum van 30% en 3 s fade-in.
Pas `MAX_VOLUME_PERCENT` niet aan zonder na te denken.
