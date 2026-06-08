-- Update default stage for new placements to Ready2Send
ALTER TABLE placements 
ALTER COLUMN stage SET DEFAULT 'Ready2Send';