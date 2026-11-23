# Handgebaarquest

Campus Quest · track D, handgebaren · Lukas Bohez

Het spel vraagt afwisselend **Peace** en **Middelvinger**. Een succesvolle scan levert 10 punten op. De gevraagde klasse moet in drie beelden na elkaar minstens 90% halen. **Geen gebaar** is een trainingsklasse voor beelden die geen punten moeten opleveren. Bespreek het gekozen idee kort met je docent, zoals gevraagd bij track D.

## Foto’s maken op je laptop

1. Dubbelklik op `Start lokaal.cmd` of voer `npm start` uit met Node.js 22.13 of hoger. Laat het venster open. Open de [fotostand](http://127.0.0.1:4174/dataset.html) in Chrome of Edge.
2. Klik op **Kies opslagmap**. Kies of maak een lege map met de naam `dataset`, buiten de map `public`. De fotostand maakt drie submappen en sorteert de beelden. Als je browser geen mapkiezer ondersteunt, downloadt hij de foto’s apart met de klas in de bestandsnaam.
3. Selecteer **Peace**, **Middelvinger** of **Geen gebaar**. Klik op **Start webcam**, sta de camera toe en kies **Maak foto**. Houd je hele hand in het midden en je gezicht buiten beeld.
4. Maak per klasse minstens 30 trainingsfoto’s. Verdeel ze bijvoorbeeld over drie sessies van 10 en fotografeer in iedere sessie alle klassen. Wijzig afstand, kijkhoek, hand, licht en achtergrond. Neem voor **Geen gebaar** lege beelden, een rustende hand en andere handvormen op. Trek je horloge voor een reeks foto’s uit en draag het voor een andere reeks, even vaak per klasse.
5. Bewaar minstens vijf extra foto’s per klasse apart voor de test. Gebruik een andere sessie of een andere achtergrond. Voeg ze pas aan de trainingsset toe als je na een test bewust wilt hertrainen en je nog een nieuwe, onafhankelijke testset achterhoudt.

## Model trainen en testen

1. Open [Teachable Machine](https://teachablemachine.withgoogle.com/train/image) op je pc. Kies **Image Project → Standard image model**.
2. Maak de klassen **Peace**, **Middelvinger** en **Geen gebaar**. Voeg per klas de bijbehorende trainingsfoto’s toe en kies **Train Model**.
3. Kies **Export Model → TensorFlow.js → Download my model**. Pak `model.json`, `metadata.json` en alle `.bin`-gewichten uit in `public/model/`.
4. Open de [lokale app](http://127.0.0.1:4174/) en klik op **Start camera**. Test beide gebaren en beelden zonder gebaar. Voor het laden van de modelbibliotheken heeft de browser internet nodig.
5. De [lokale teststand](http://127.0.0.1:4174/?preview=1) werkt zonder model of camera. Die simuleert voorspellingen en bewaart haar eigen testscore. Het ingevulde testverslag moet over het echte model gaan.

## Live en inleveren

1. Zet na de echte tests de eigen modelbestanden op GitHub. Houd de ruwe foto’s en demo buiten de openbare repository. Neem alleen je eigen hand op of vraag toestemming als iemand anders herkenbaar in beeld komt.
2. Importeer de GitHub-repository in Netlify en kies `week 4/handgebaarquest` als **Base directory**. De website en puntenfunctie staan in `netlify.toml`. Netlify Blobs bewaart de punten. [Netlify-handleiding](https://docs.netlify.com/start/quickstarts/deploy-from-repository/)
3. Open de live HTTPS-link op je smartphone, toets de camera en herlaad om te zien of de punten blijven staan. Film daarna iemand anders die op jouw smartphone speelt. Je kunt de telefoon waarop het spel draait tijdens de demo filmen met de webcam van je laptop.
4. Lever de GitHub-link, een vernieuwde zip met de modelbestanden, de live link en je demo van maximaal twee minuten in. Voeg [Praktijktest.md](Praktijktest.md) en [AI-verantwoording.md](AI-verantwoording.md) toe zodra die ingevuld zijn.

## Beelden en punten

De fotostand bewaart beelden lokaal in de gekozen map of als download. De spelmodus verwerkt elk beeld in de browser. De puntenfunctie ontvangt een willekeurige toestel- en rondecode, het gevraagde gebaar en de zekerheid. Ze bewaart alleen de geslaagde rondecodes per toestel. Opnieuw verzenden van dezelfde ronde geeft geen extra punten.
