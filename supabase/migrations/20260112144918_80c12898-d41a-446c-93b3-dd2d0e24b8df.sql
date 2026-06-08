UPDATE candidates 
SET avatar_url = NULL, updated_at = NOW()
WHERE name IN (
  'Zeljko Ljubojevic', 
  'Zeljka Pepic', 
  'Wister José Márquez', 
  'Veronique Vogel', 
  'Urban Gasser', 
  'Tobias Eigenmann', 
  'Sven Zimmermann', 
  'Sven Moosmann', 
  'Steven Pock', 
  'Steven Hasler'
);