#pragma once

// ---- Volume (veiligheid voor je oren) ----
// Softwarematige versterking op de PCM-data. 100 = ongewijzigd, 15 = erg stil.
// Hard begrensd door MAX_VOLUME_PERCENT, wat je hier ook invult.
#define VOLUME_PERCENT      15
#define MAX_VOLUME_PERCENT  30
// Volume dat naar de speaker gestuurd wordt (0-127). Laag houden.
#define A2DP_VOLUME         40
// Elke track begint met zoveel ms fade-in zodat er geen plotse knal is.
#define FADE_IN_MS          3000

// ---- Gedrag ----
// Zoektijd naar speakers per ronde (seconden).
#define SCAN_SECONDS        15
// Maximale tijd per speaker (seconden). 0 = hele track afspelen.
#define PLAY_SECONDS_MAX    0
// Maximale wachttijd om te verbinden met 1 speaker (seconden).
#define CONNECT_TIMEOUT_S   12
// Alleen speakers waarvan de naam hierin voorkomt (leeg = alle gevonden audio-apparaten).
// Voorbeeld: #define NAME_FILTER {"JBL", "Soundcore"}
#define NAME_FILTER {}
