# 🧠 Mein Assistent – Aufgaben, Termine & Projekte

Eine persönliche Assistenz-App für **Handy (Android/iPhone)** und **Windows-Laptop**.
Es ist eine installierbare Web-App (PWA): ein Code, läuft überall, funktioniert offline.

## Was die App kann

- **☀️ Tagesbriefing** – „Guten Morgen! Heute: 1 Termin und 3 Aufgaben. Um 14:00 hast du: *Gespräch mit Ali* (in 2 Std.)“ –
  inkl. Tipps: überfällige Aufgaben, offene Vorbereitung, Projekte ohne nächsten Schritt. Mit 🔊 *Vorlesen*.
- **✍️ Schnelleingabe in normalem Deutsch** (auch per 🎤 Spracheingabe):
  `Gespräch mit Ali morgen 14 Uhr #Bau !hoch`
  → Termin, morgen 14:00, Projekt „Bau“, wichtig, Erinnerung 15 Min. vorher.

  | Eingabe | Bedeutung |
  |---|---|
  | `heute`, `morgen`, `übermorgen`, `Montag`…`Sonntag`, `25.10.` | Datum |
  | `14 Uhr`, `um 9:30`, `16.45 Uhr` | Uhrzeit (+ automatische Erinnerung) |
  | `#Projekt` | Projekt (wird automatisch angelegt) |
  | `!hoch` / `!!` / `!niedrig` | Priorität |
  | Gespräch, Termin, Meeting, Call, Arzt … | wird als Termin markiert |
- **🔔 Erinnerungen** als System-Benachrichtigung (Windows-Infocenter / Handy) – zur Uhrzeit oder 5 Min. … 1 Tag vorher.
- **☑️ Vorbereitung** – Checkliste pro Termin („Unterlagen drucken“, „Fragen notieren“), Fortschritt wird im Briefing gemeldet.
- **📁 Projekte** – Ziel, Deadline, Fortschrittsbalken, *nächster Schritt* und Warnungen
  („Kein nächster Schritt geplant“, „Deadline in 3 Tagen, noch 5 offen“).
- **📆 Kalender-Export (.ics)** – Termine mit Erinnerung in Google-/Apple-/Outlook-Kalender übernehmen.
- **💾 Sicherung** – Export/Import als JSON, um Handy und Laptop abzugleichen.
- Hell/Dunkel-Modus automatisch, alle Daten bleiben **nur auf deinem Gerät**.

## Starten

### Variante A: Online über GitHub Pages (empfohlen – dann auf Handy *und* Laptop nutzbar)
1. Im Repository: **Settings → Pages → Source: „Deploy from a branch“**, Branch `main`, Ordner `/ (root)` → *Save*.
2. Nach ca. 1 Minute ist die App erreichbar unter
   `https://bahromtoshmatov.github.io/python-darslar/43-assistent-app/`

(Alternative ohne GitHub: den Ordner `43-assistent-app` auf <https://app.netlify.com/drop> ziehen.)

### Variante B: Lokal auf dem Laptop
```bash
cd 43-assistent-app
python -m http.server 8000
```
Dann im Browser <http://localhost:8000> öffnen.

## Als App installieren

| Gerät | So geht’s |
|---|---|
| **Windows** (Edge oder Chrome) | Seite öffnen → in der Adressleiste auf **„App installieren“ ⊕** klicken. Die App erscheint im Startmenü und kann an die Taskleiste angeheftet werden. |
| **Android** (Chrome) | Seite öffnen → Menü **⋮ → „App installieren“**. |
| **iPhone** (Safari, iOS 16.4+) | **Teilen ⬆️ → „Zum Home-Bildschirm“**, dann die App vom Home-Bildschirm öffnen und Erinnerungen erlauben. |

Danach in der App unter **Mehr → „Benachrichtigungen erlauben“** tippen.

## Gut zu wissen

- **Erinnerungen** kommen, solange die App bzw. der Browser im Hintergrund läuft.
  Damit wichtige Termine auch bei komplett geschlossener App klingeln: im Eintrag auf **„📆 Kalender“** tippen –
  dann übernimmt der Kalender des Handys bzw. Outlook die Erinnerung.
- **Abgleich zwischen Geräten**: *Mehr → Sicherung speichern* auf Gerät 1, *Sicherung laden* auf Gerät 2.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche und Dialoge |
| `style.css` | Design (Handy: Leiste unten, PC: Seitenleiste) |
| `app.js` | Logik: Speicher, Verstehen der Schnelleingabe, Briefing, Erinnerungen, Kalender-Export |
| `sw.js` | Service Worker (offline, Benachrichtigungen) |
| `manifest.webmanifest`, `icons/` | Installation als App |
