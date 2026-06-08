-- Add description_approved column to clients table
ALTER TABLE clients 
ADD COLUMN description_approved boolean DEFAULT false;