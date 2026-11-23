# Opruimquest

Campus Quest, track C (beeld) · Lukas Bohez

Scan een rommelige stoelopstelling met je smartphone. Ruim de stoelen op en scan dezelfde plek opnieuw. De app kent 10 punten toe als de verwachte klasse bij elk beeld van beide scans minstens 90% haalt. Elke scan gebruikt drie beelden kort na elkaar. De app vraagt minimaal drie seconden tussen de scans.

## Eigen dataset en model

De modelmap is voorbereid. De trainingsfoto’s, modelbestanden en praktijkresultaten moeten nog worden toegevoegd of vastgelegd.

1. Fotografeer stoelopstellingen voor de klassen **Rommelig** en **Netjes**. Verzamel minstens 30 aparte trainingsfoto’s per klas. Fotografeer beide klassen op meerdere momenten, bij verschillend licht en vanuit verschillende hoeken. Gebruik per klas zoveel mogelijk dezelfde ruimtes en stoelen, zodat de klas niet samenvalt met de achtergrond.
2. Hou minstens 10 extra foto’s per klas uit de training. Maak die bij voorkeur tijdens een aparte sessie. Gebruik later ook livebeelden om te controleren hoe het model in de app reageert.
3. Open [Teachable Machine](https://teachablemachine.withgoogle.com/train/image) op je computer. Kies **Image Project → Standard image model**. Maak de klassen **Rommelig** en **Netjes**, voeg de eigen trainingsfoto’s toe en klik op **Train Model**.
4. Kies **Export Model → TensorFlow.js → Download my model**. Pak de export uit in `public/model/`. Laat de namen van `model.json`, `metadata.json` en het bijbehorende gewichtenbestand staan. Kies de downloadoptie zodat je modelbestanden bij de app zitten.
5. Vul na de praktijktests in [Praktijktest.md](Praktijktest.md) in hoe je de foto’s hebt gemaakt en welke drie fouten je hebt kunnen aantonen.

## Starten en publiceren

- Om op je computer te testen, installeer Node.js 22.13 of hoger. Open een terminal in deze map en voer `npm ci` en vervolgens `npx netlify-cli dev` uit. Open de lokale URL die Netlify Dev toont.
- Zet deze projectmap met het model in je GitHub-repository. Gebruik je de bestaande repository voor Future Technologies, stel in Netlify dan `week 4/opruimquest` in als **Base directory**. In een nieuwe repository met dit project aan de hoofdmap laat je **Base directory** leeg.
- Kies in Netlify **Add new project → Import a Git repository**. De instellingen voor de website en serverfunctie staan in `netlify.toml`. De punten worden opgeslagen in Netlify Blobs. Open na de deploy de HTTPS-link in de gewone browser op je smartphone en geef toegang tot de achtercamera. [Netlify-handleiding](https://docs.netlify.com/start/quickstarts/deploy-from-repository/)
- Controleer op je smartphone een volledige ronde. Herlaad de pagina en kijk of de punten blijven staan. Laat iemand anders daarna een ronde spelen voor de demo.

## Camera en gegevens

Train met beelden van ruimtes en objecten. Zorg dat er geen personen of persoonsgegevens zichtbaar zijn. Neem de trainingsfoto’s niet op in de repository of zip.

De app gebruikt TensorFlow.js en `@teachablemachine/image`. De voorspelling gebeurt op het toestel en de tijdelijke camerabeelden worden na elke voorspelling gewist. Bij een geslaagde ronde stuurt de app alleen de twee gemiddelde zekerheden en de willekeurige codes van het toestel en de ronde naar de server. De server bewaart de rondecodes per toestel en leidt daar de punten uit af. Een herhaling van hetzelfde verzoek telt niet dubbel.

De camera controleert de categorie van de opstelling. De speler blijft zelf verantwoordelijk om tweemaal dezelfde plek te scannen. Opeenvolgende beelden en wachttijd filteren enkele onstabiele scans, maar bewijzen niet dat het beeld live is.

## Inleveren

- GitHub-link naar deze projectmap of de aparte repository.
- Zip met de broncode en de eigen TensorFlow.js-export.
- Werkende Netlify-link via HTTPS.
- Demo van maximaal twee minuten waarin iemand anders de app gebruikt op je smartphone.
- Ingevulde datasetbeschrijving, tabel met drie echte fouten en reflectie van maximaal 200 woorden in [Praktijktest.md](Praktijktest.md).
- [AI-verantwoording.md](AI-verantwoording.md), aangevuld met je eigen wijzigingen en controles.
