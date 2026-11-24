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

## Reflectie

Mijn foto’s komen vooral van mijn eigen hand, met dezelfde laptopcamera en grotendeels dezelfde achtergrond. Sommige reeksen zijn vlak na elkaar genomen. Daardoor kan het model het licht, de camerahoek of mijn hand leren herkennen en minder goed werken bij iemand anders. De fout gelabelde L-foto’s toonden ook hoe belangrijk een visuele controle is. De app kijkt nu naar een handuitsnede en vereist drie opeenvolgende voldoende zekere voorspellingen. Een foto of video van de juiste handvorm kan daar nog doorheen komen. Ik zou daarom na elke letter een willekeurige korte beweging vragen. Om die aanpak te beoordelen, zou ik echte gebaren en foto’s op een scherm vergelijken bij andere mensen en ander licht. Ik zou zowel onterecht toegekende punten als onterecht geweigerde echte gebaren tellen.
