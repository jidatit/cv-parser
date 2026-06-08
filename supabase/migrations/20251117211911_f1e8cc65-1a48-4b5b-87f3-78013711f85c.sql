-- Create rejection_reasons table
CREATE TABLE public.rejection_reasons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rejection_reasons ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own rejection reasons" 
ON public.rejection_reasons 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own rejection reasons" 
ON public.rejection_reasons 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rejection reasons" 
ON public.rejection_reasons 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rejection reasons" 
ON public.rejection_reasons 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_rejection_reasons_updated_at
BEFORE UPDATE ON public.rejection_reasons
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default rejection reasons
INSERT INTO public.rejection_reasons (user_id, reason)
SELECT auth.uid(), reason
FROM (VALUES 
  ('Kandidat nicht interessiert'),
  ('Zu hohe Gehaltsvorstellungen'),
  ('Fehlende Qualifikationen'),
  ('Zeitliche Verfügbarkeit'),
  ('Standort nicht passend'),
  ('Andere Gründe')
) AS default_reasons(reason)
WHERE auth.uid() IS NOT NULL;