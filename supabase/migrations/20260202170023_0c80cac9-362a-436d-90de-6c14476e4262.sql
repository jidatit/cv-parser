-- Create task_folders table
CREATE TABLE public.task_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_folders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_folders
CREATE POLICY "Users can view all task folders" 
ON public.task_folders 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert task folders" 
ON public.task_folders 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own task folders" 
ON public.task_folders 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own task folders" 
ON public.task_folders 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add folder_id to tasks table
ALTER TABLE public.tasks ADD COLUMN folder_id UUID REFERENCES public.task_folders(id) ON DELETE SET NULL;

-- Add trigger for updated_at
CREATE TRIGGER update_task_folders_updated_at
BEFORE UPDATE ON public.task_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();