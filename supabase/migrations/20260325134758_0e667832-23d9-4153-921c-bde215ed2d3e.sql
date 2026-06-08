DROP POLICY "Team members can view all clients" ON public.clients;

CREATE POLICY "Users can view their own or team clients"
ON public.clients FOR SELECT
USING (
  auth.uid() = user_id 
  OR is_team_member(auth.uid())
);