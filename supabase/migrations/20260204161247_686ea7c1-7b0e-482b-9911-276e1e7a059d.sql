-- Mark stalled processing jobs as 'stalled' so users can restart
UPDATE ai_matching_jobs 
SET 
  status = 'stalled',
  message = 'Prozess wurde nach Timeout automatisch beendet. Teilweise Ergebnisse wurden gespeichert.',
  error = 'Timeout: Keine Updates seit mehr als 5 Minuten',
  updated_at = now()
WHERE status = 'processing' 
  AND updated_at < now() - interval '5 minutes';