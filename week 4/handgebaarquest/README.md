# Handgebaarquest · Vlaams handalfabet

Campus Quest · track D · Lukas Bohez

Spel **VOL** met drie letters uit het Vlaamse handalfabet. Elke herkende letter geeft 10 punten. Dezelfde letter moet op drie opeenvolgende camerabeelden minstens 90% halen. **Overig** is de klasse voor andere handvormen en lege beelden. Het Vlaamse handalfabet wordt naast Vlaamse Gebarentaal gebruikt, bijvoorbeeld voor namen en afkortingen. Dit fotomodel oefent drie handvormen. Een gebarentaalmodel voor woorden en zinnen heeft ook informatie nodig over onder meer beweging, plaats en gezichtsuitdrukking. [Vlaams GebarentaalCentrum](https://vgtc.be/vlaamse-gebarentaal/dwnlds/) · [Woordenboek VGT](https://www.vlaamsegebarentaal.be/faq)

## Foto’s maken en het model trainen

1. Open de [lokale trainingsstand](http://127.0.0.1:4174/dataset.html). Dubbelklik zo nodig op **Start lokaal.cmd** of gebruik npm start met Node.js 22.13 of hoger.
2. Klik op **Start automatische training** en geef toegang tot de webcam. De pagina toont per ronde de handvorm, telt vijf seconden af en neemt maximaal vijf foto’s per keer. Laat de hele hand zien, wissel per foto lichtjes van hoek of afstand en houd gezicht en omstanders buiten beeld. Voor **Overig** toon je een lege achtergrond, een ontspannen hand of een andere lettervorm.
3. De app bewaart beelden in **opruimquest/trainingdata/training/** per klasse. Bij minstens 30 voorbeelden per klasse traint de browser een TensorFlow.js-model met de Teachable Machine-bibliotheek. De bibliotheek en het MobileNet-startmodel vereisen internet. De opnames blijven lokaal. Na het stoppen kun je de sessie hervatten vanaf de opgeslagen teller.
4. Open na afloop de [gewone app](http://127.0.0.1:4174/) om de gegenereerde export te gebruiken. De modelmap verschijnt in de statusregel. Voor Netlify kopieer je model.json, metadata.json en weights.bin uit die lokale exportmap naar **public/model/**.
5. Maak ongeveer 10 afzonderlijke testfoto’s per klasse in een andere sessie. Gebruik in de fotostand **Aparte test** en varieer de achtergrond, belichting en hand. De automatische training leest uitsluitend de trainingsmap.

Je kunt ook handmatig trainen via [Teachable Machine](https://teachablemachine.withgoogle.com/train/image) met **Image Project → Standard image model**, dezelfde vier klassen en de foto’s uit **trainingdata/training/**.

## Evalueren en indienen

- [Model evalueren](http://127.0.0.1:4174/evaluatie.html) verwerkt de aparte testmap lokaal. **Origineel** geeft het resultaat op echte testfoto’s. **Donkerder** en **Lichter** zijn afgeleide stresstests op diezelfde bronfoto’s. Tel ze niet mee als nieuwe onafhankelijke voorbeelden. Download indien gewenst de CSV. De fototest beoordeelt losse beelden. Test daarnaast ook live op drie opeenvolgende frames.
- De [teststand](http://127.0.0.1:4174/?preview=1) gebruikt gesimuleerde voorspellingen. Ze laat zien of de spelregels en scoreopslag werken.
- Zet de eigen modelbestanden pas na de tests op GitHub. Houd de map dataset en eventuele herkenbare opnames buiten de openbare repository. Vernieuw de voorlopige zip met de modelbestanden.
- Importeer de repository in Netlify met **week 4/handgebaarquest** als **Base directory**. Test de HTTPS-link op je smartphone en controleer of de punten na herladen zichtbaar blijven. De video voor de docent toont iemand anders die de app op jouw smartphone gebruikt en duurt maximaal twee minuten.
- Lever de GitHub-link, de vernieuwde zip, de live link, de demo, [Praktijktest.md](Praktijktest.md) en [AI-verantwoording.md](AI-verantwoording.md) in. Bespreek de scope van track D met je docent.

De fotostand schrijft uitsluitend naar een map op je pc. Tijdens het spel verwerkt de browser de camerabeelden. De puntenfunctie ontvangt de toestelcode, de rondecode, de gevraagde letter en de zekerheid. Ze bewaart de rondecodes. Een herhaald verzoek telt eenmaal.

Afbeelding van het Vlaamse handalfabet door het [Vlaams GebarentaalCentrum](https://vgtc.be/vlaamse-gebarentaal/dwnlds/).
