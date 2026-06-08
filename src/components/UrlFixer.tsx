import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Component that fixes malformed URLs where query params are encoded as part of the path
 * e.g., /pipeline%3Fplacement=123 should redirect to /pipeline?placement=123
 */
export function UrlFixer() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const pathname = location.pathname;
    
    // Check if the pathname contains encoded query params (%3F = ?)
    if (pathname.includes('%3F') || pathname.includes('%3f')) {
      // Decode the pathname to get the actual intended URL
      const decodedPath = decodeURIComponent(pathname);
      
      // If the decoded path contains a ?, split it into path and search
      if (decodedPath.includes('?')) {
        const [newPathname, searchPart] = decodedPath.split('?');
        const newSearch = searchPart ? `?${searchPart}` : '';
        
        // Preserve any existing search params (like __lovable_token)
        const existingSearch = location.search;
        const combinedSearch = existingSearch 
          ? `${newSearch}${existingSearch.replace('?', '&')}`
          : newSearch;
        
        console.log('[UrlFixer] Redirecting malformed URL');
        
        // Navigate to the corrected URL
        navigate({ pathname: newPathname, search: combinedSearch }, { replace: true });
      }
    }
  }, [location.pathname, location.search, navigate]);

  return null;
}
