

## Doppelklick-Bearbeitung für „Werte" in den Insight Notes

### Problem
In der Kandidatenansicht (`CandidateInsights.tsx`) sind die Insight Notes selbst bereits per Doppelklick editierbar. Die direkt darunter angezeigten **Werte** (`candidate_values`, „Werte: X, Y, Z") können aktuell **nicht manuell bearbeitet** werden — sie werden nur automatisch per KI gefüllt. Wenn alle Werte und Notes leer sind, wird die „Beckett Stone Insights"-Sektion im CV bereits korrekt ausgeblendet.

### Lösung

**Datei:** `src/components/CandidateInsights.tsx`

1. **Neuer Edit-State** `editingValues` + `tempValues` (kommagetrennter String).
2. **Doppelklick auf die „Werte: …" Zeile** öffnet ein kleines Edit-Feld:
   - Input mit kommagetrennter Eingabe (z. B. „Verlässlichkeit, Teamgeist, Innovation")
   - Speichern / Abbrechen Buttons
   - Maximal 3 Werte (Slice analog zu bestehender KI-Logik)
   - Beim Speichern: `onUpdate({ candidate_values: [...] })`
   - Leere Eingabe → `candidate_values: []` (Werte werden gelöscht)
3. **Anzeige bei leerem Zustand**: Wenn keine Werte vorhanden sind, wird ein dezenter „+ Werte hinzufügen" Hinweis (kursiv, klein) angezeigt, der ebenfalls per Doppelklick den Editor öffnet — analog zum Muster der anderen Felder.
4. **Cleanup beim Speichern**: Leere Strings rausfiltern, trim(), Duplikate vermeiden.

### CV Creator – keine Änderung nötig
Die Logik in `src/components/cv-template/main-cv.tsx` (Zeile 672–738) blendet die Beckett Stone Insights Sektion bereits korrekt aus, wenn **sowohl** `insights_notes` **als auch** `candidate_values` leer sind:

```text
if (!hasInsightNotes && !hasValues) return null;
```

Wenn der User die Werte und die Notes löscht, verschwindet die Sektion automatisch im CV. **Am CV-Template wird nichts angefasst.**

### Umfang
- 1 Datei: `src/components/CandidateInsights.tsx`
- Keine Änderung am CV-Creator / Templates
- Keine Datenbank-Änderung
- Keine Layout- oder Designänderung in anderen Bereichen

### Erwartetes Ergebnis
- Doppelklick auf „Werte: …" → Inline-Editor mit kommagetrennter Eingabe
- Speichern persistiert in `candidates.candidate_values`
- Alle Werte gelöscht + Notes leer → „Beckett Stone Insights"-Block erscheint nicht mehr im generierten CV

