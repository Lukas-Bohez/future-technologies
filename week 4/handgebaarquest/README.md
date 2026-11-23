# Handgebaarquest · Vlaams handalfabet

Campus Quest · track D · Lukas Bohez

Spel **VOL** met drie letters uit het Vlaamse handalfabet. Elke herkende letter geeft 10 punten. Dezelfde letter moet op drie opeenvolgende camerabeelden minstens 90% halen. **Overig** is de klasse voor andere handvormen en lege beelden. Het Vlaamse handalfabet wordt naast Vlaamse Gebarentaal gebruikt, bijvoorbeeld voor namen en afkortingen. Dit fotomodel oefent drie handvormen. Een gebarentaalmodel voor woorden en zinnen heeft ook informatie nodig over onder meer beweging, plaats en gezichtsuitdrukking. [Vlaams GebarentaalCentrum](https://vgtc.be/vlaamse-gebarentaal/dwnlds/) · [Woordenboek VGT](https://www.vlaamsegebarentaal.be/faq)

## Foto’s maken en het model trainen

1. Open de [lokale fotostand](http://127.0.0.1:4174/dataset.html). Staat de server uit? Dubbelklik op **Start lokaal.cmd** of gebruik npm start met Node.js 22.13 of hoger.
2. Kies **Training** of **Aparte test**. Kies daarna **V**, **O**, **L** of **Overig** en start je webcam. Elke bevestigde foto staat meteen in dataset/training of dataset/test onder de juiste klasse. Open bij twijfel het Vlaamse handalfabet onderaan de fotostand.
3. Verzamel minstens 30 trainingsfoto’s per klasse, met wisselend licht, afstand, hoek en achtergrond. Houd gezicht en omstanders buiten beeld. Neem de vier eerder gecontroleerde uitsneden alleen mee voor **Overig**. Maak ook nieuwe beelden van een lege achtergrond, een ontspannen hand en andere lettervormen.
4. Neem ongeveer 10 afzonderlijke testfoto’s per klasse in een andere sessie. Gebruik waar mogelijk andere belichting, een andere hoek of een andere hand. Laat deze testmap buiten je training.
5. Open [Teachable Machine](https://teachablemachine.withgoogle.com/train/image). Kies **Image Project → Standard image model**. Maak de klassen **V**, **O**, **L** en **Overig**, voeg per klasse de eigen trainingsfoto’s toe en klik op **Train Model**.
6. Kies **Export Model → TensorFlow.js → Download my model**. Plaats model.json, metadata.json en alle .bin-gewichten in public/model. Open de [gewone app](http://127.0.0.1:4174/) en probeer het echte model. Voor het laden van de modelbibliotheken heeft de browser internet nodig.

## Evalueren en indienen

- [Model evalueren](http://127.0.0.1:4174/evaluatie.html) verwerkt de aparte testmap lokaal. **Origineel** geeft het resultaat op echte testfoto’s. **Donkerder** en **Lichter** zijn afgeleide stresstests op diezelfde bronfoto’s. Tel ze niet mee als nieuwe onafhankelijke voorbeelden. Download indien gewenst de CSV. De fototest beoordeelt losse beelden. Test daarnaast ook live op drie opeenvolgende frames.
- De [teststand](http://127.0.0.1:4174/?preview=1) gebruikt gesimuleerde voorspellingen. Ze laat zien of de spelregels en scoreopslag werken.
- Zet de eigen modelbestanden pas na de tests op GitHub. Houd de map dataset en eventuele herkenbare opnames buiten de openbare repository. Vernieuw de voorlopige zip met de modelbestanden.
- Importeer de repository in Netlify met **week 4/handgebaarquest** als **Base directory**. Test de HTTPS-link op je smartphone en controleer of de punten na herladen zichtbaar blijven. De video voor de docent toont iemand anders die de app op jouw smartphone gebruikt en duurt maximaal twee minuten.
- Lever de GitHub-link, de vernieuwde zip, de live link, de demo, [Praktijktest.md](Praktijktest.md) en [AI-verantwoording.md](AI-verantwoording.md) in. Bespreek de scope van track D met je docent.

De fotostand schrijft uitsluitend naar een map op je pc. Tijdens het spel verwerkt de browser de camerabeelden. De puntenfunctie ontvangt de toestelcode, de rondecode, de gevraagde letter en de zekerheid. Ze bewaart de rondecodes. Een herhaald verzoek telt eenmaal.

Afbeelding van het Vlaamse handalfabet door het [Vlaams GebarentaalCentrum](https://vgtc.be/vlaamse-gebarentaal/dwnlds/).
