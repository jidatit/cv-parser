-- Create table for access attempt logs
CREATE TABLE public.access_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  attempted_path text NOT NULL,
  user_role text,
  required_roles text[],
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view access logs
CREATE POLICY "Admins can view access logs"
ON public.access_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Anyone authenticated can insert (to log their own denied access)
CREATE POLICY "Authenticated users can log access attempts"
ON public.access_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster queries
CREATE INDEX idx_access_logs_created_at ON public.access_logs(created_at DESC);
CREATE INDEX idx_access_logs_user_id ON public.access_logs(user_id);