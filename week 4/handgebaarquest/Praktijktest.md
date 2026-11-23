# Praktijktest – Handgebaarquest

## Eerste versie en datasetcontrole

Op mijn laptop kon ik in de eerste versie geen foto’s in de app bewaren. De bediening was te veel op een telefoon gericht. Ik had ook enkele beelden onder het verkeerde klasse-label gezet. In de nieuwe fotostand zie ik per klasse hoeveel bestanden echt op schijf staan. De eerste reeks bleef lokaal bewaard. Vier duidelijke handuitsneden zijn geselecteerd als training voor **Overig**. Van de oude opnames wordt niets gebruikt als aparte testfoto.

| Klasse | Trainingsfoto’s | Onafhankelijke testfoto’s | Licht, hoek, achtergrond en hand |
| --- | --- | --- | --- |
| V | … | … | … |
| O | … | … | … |
| L | … | … | … |
| Overig | … | … | … |

## Drie echte modeltests

Gebruik de lokale evaluatiepagina om de originele foto’s te beoordelen. Test ook live op je smartphone. Noteer de voorspelling, zekerheid en hertest. Vervang een voorgestelde situatie als je daarin geen fout kunt aantonen.

| Situatie | Verwachting | Waargenomen voorspelling en zekerheid | Aanpassing en hertest |
| --- | --- | --- | --- |
| V bij tegenlicht | De letter blijft herkenbaar | … | … |
| Een ander gebaar, zoals twee vingers dicht tegen elkaar | Het model geeft geen punten voor V | … | … |
| Een foto van de gevraagde letter op een scherm | Het scherm ontgrendelt geen letter | … | … |

## Reflectie (maximaal 200 woorden)

Mijn eerste fotoreeks had weinig variatie tussen de achtergronden en bevatte fout gelabelde opnames. Daardoor kon het model verbanden leren die niets met de handvorm te maken hebben. Ik heb die eerste reeks apart gehouden en wil voor de nieuwe klassen dezelfde variatie in licht, afstand en achtergrond gebruiken. Het spel vraagt letters in een vaste volgorde en controleert drie beelden. Een stilstaande foto van de juiste letter kan daardoor nog steeds werken. Ik zou een korte, willekeurige beweging vragen terwijl de handvorm zichtbaar blijft. Ik zou met echte handen en schermfoto’s testen hoeveel pogingen terecht worden aanvaard of geweigerd.

Vul deze reflectie na je tests aan met wat je daadwerkelijk hebt gemeten en aangepast.
