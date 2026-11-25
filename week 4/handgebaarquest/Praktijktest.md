# Praktijktest – Handgebaarquest

Lukas Bohez · Campus Quest · Track D

## Dataset

Ik maakte zelf webcamfoto’s van de letters V, O en L en van andere handvormen. Ik varieerde de hoek, afstand en positie van mijn hand. Enkele oudere, bruikbare handuitsneden zijn hergebruikt nadat de labels en zichtbare inhoud waren gecontroleerd. Foto’s die onduidelijk waren of een verkeerde handvorm toonden, werden verplaatst of herlabeld. Het uiteindelijke TensorFlow.js-model is getraind met 30 beelden per klasse, dus 120 beelden in totaal. De ruwe foto’s zijn lokaal gebleven.

## Drie geconstateerde problemen

| Situatie | Wat ging mis? | Wat paste ik aan? | Wat werd gecontroleerd? |
| --- | --- | --- | --- |
| O dicht tegen mijn gezicht | De hand was moeilijk los van het gezicht te herkennen. De eerste handvormcontrole kende slechts 1 van 12 behouden O-beelden aan O toe. | De app toont een handkader, weert overlap met het gezicht en gebruikt de uitsnede van de hand. De controle op O werd aangepast aan de ronde handvorm. | De aangepaste handvormcontrole kende 11 van 12 bestaande O-beelden aan O toe. |
| L stond onder Overig | De trainingsset bevatte 26 eerdere L-opnames in Overig. Bij de laatste controle zaten er ook O’s tussen de L-foto’s en opnieuw L’s bij Overig. | Duidelijke beelden werden herlabeld en twijfelgevallen apart gezet. Daarna is het TensorFlow.js-model opnieuw getraind. | In de eerder behouden kleine reeks kende de aangepaste handvormcontrole 3 van 3 L-beelden aan L toe. De uiteindelijke export heeft vier klassen en gebruikt de handuitsnede. |
| Een hand werd als gezicht afgedekt | Bij de echte webcam plaatste de oude gezichtsfilter een donker vak op de hand. De hand werd daardoor geweigerd. Zonder herkende hand bleef de preview bovendien donker. | De app gebruikt nu gezichtspunten om af te dekken. Het camerabeeld en een stippelkader blijven zichtbaar terwijl je je hand positioneert. | Op de echte webcam verscheen het camerabeeld en meldde de app na de aanpassing ‘Hand in beeld’. |

De cijfers voor O en L komen van eerder bekeken foto’s en van de handvormcontrole. Ze zijn geen nauwkeurigheidscijfers voor het uiteindelijke TensorFlow.js-model op nieuwe testfoto’s.

## Test met een klasgenoot

Ik filmde met mijn smartphone terwijl een klasgenoot de app op mijn laptop probeerde. De V van mijn klasgenoot werd aanvankelijk niet meteen geregistreerd. Toen ik zelf een V maakte, lukte het wel. Met twee mensen voor de webcam kwam soms ook mijn hand met de telefoon in beeld. De gezichtsafdekking was zichtbaar. Bij een andere positie en belichting zag ik dat de app een L even als V weergaf. Later verscheen ‘VOL gespeld’. Dit was een praktijktest met enkele pogingen, dus ik kan er geen algemene nauwkeurigheid uit afleiden.

## Reflectie

Mijn klasgenoot kreeg de V minder makkelijk herkend dan ik. Op mijn trainingsfoto’s staat vooral mijn eigen hand, met dezelfde laptopcamera en vaak bij dezelfde achtergrond en belichting. Toen ik filmde, kwam ook mijn hand met de telefoon in beeld. Met twee mensen was het moeilijker om de juiste hand vrij in het kader te houden. De app dekte gezichten af, maar een L werd bij een andere positie en belichting even als V weergegeven. Uiteindelijk lukte het wel om VOL te spellen.

Ik zou opnieuw trainen met handen van verschillende mensen, bij ander licht en vanuit meerdere hoeken. Om punten halen met een foto of opname moeilijker te maken, zou ik na een letter een willekeurige korte beweging vragen en controleren of dezelfde hand die uitvoert. Daarna zou ik testen hoeveel echte gebaren en pogingen met een foto of video terecht worden aanvaard of geweigerd.
