/**
 * Utility for cleaning trailing empty elements from rich text HTML content.
 * Uses DOMParser for robust detection of visually empty content.
 */

/**
 * Checks if a node is effectively empty (no visible text content).
 * Handles: empty strings, whitespace, zero-width spaces, non-breaking spaces, <br> only
 */
const isNodeEffectivelyEmpty = (node: Node): boolean => {
  // Get text content and normalize it
  const text = (node.textContent || '')
    .replace(/\u200B/g, '') // Zero-width space
    .replace(/\uFEFF/g, '') // BOM
    .replace(/\u00A0/g, '') // Non-breaking space (&nbsp;)
    .replace(/\s+/g, '')    // All whitespace
    .trim();
  
  if (text.length > 0) return false;
  
  // Check if element only contains <br> tags or other empty elements
  if (node instanceof Element) {
    const children = Array.from(node.children);
    // If it has children other than <br>, check them recursively
    for (const child of children) {
      if (child.tagName !== 'BR' && !isNodeEffectivelyEmpty(child)) {
        return false;
      }
    }
  }
  
  return true;
};

/**
 * Removes trailing empty paragraphs, list items, and empty lists from HTML.
 * Uses DOMParser for accurate detection vs regex.
 */
export const trimTrailingEmptyRichText = (html: string | undefined | null): string => {
  if (!html || typeof html !== 'string') return '';
  
  // Quick check - if no HTML tags, return as-is
  if (!html.includes('<')) return html;
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const container = doc.body.firstElementChild;
    
    if (!container) return html;
    
    let modified = true;
    
    // Keep removing trailing empty elements until none are left
    while (modified) {
      modified = false;
      const lastChild = container.lastElementChild;
      
      if (!lastChild) break;
      
      // Handle trailing empty <p> tags
      if (lastChild.tagName === 'P' && isNodeEffectivelyEmpty(lastChild)) {
        container.removeChild(lastChild);
        modified = true;
        continue;
      }
      
      // Handle <ul>/<ol> - remove trailing empty <li> items
      if (lastChild.tagName === 'UL' || lastChild.tagName === 'OL') {
        const listItems = lastChild.querySelectorAll(':scope > li');
        let listModified = false;
        
        // Remove trailing empty list items
        for (let i = listItems.length - 1; i >= 0; i--) {
          if (isNodeEffectivelyEmpty(listItems[i])) {
            listItems[i].remove();
            listModified = true;
          } else {
            break; // Stop at first non-empty item
          }
        }
        
        // If list is now empty, remove it entirely
        if (lastChild.children.length === 0) {
          container.removeChild(lastChild);
          modified = true;
          continue;
        }
        
        if (listModified) {
          modified = true;
        }
      }
    }
    
    const result = container.innerHTML;
    return result || '';
  } catch (e) {
    // Fallback to regex-based cleanup if DOMParser fails
    return html
      .replace(/(<p[^>]*>(\s|&nbsp;|\u00A0|\u200B|\uFEFF|<br\s*\/?>)*<\/p>\s*)+$/gi, '')
      .trim();
  }
};

/**
 * Checks if HTML content has any actual visible content.
 * Useful for determining whether to show a description section at all.
 */
export const hasVisibleContent = (html: string | undefined | null): boolean => {
  if (!html) return false;
  
  // Quick check for obviously empty content
  const trimmed = html.trim();
  if (!trimmed || trimmed === '<p></p>') return false;
  
  const cleaned = trimTrailingEmptyRichText(html);
  
  // Check if after cleaning there's any content left
  if (!cleaned) return false;
  
  // Parse to check for actual text content
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${cleaned}</div>`, 'text/html');
    const container = doc.body.firstElementChild;
    
    if (!container) return false;
    
    return !isNodeEffectivelyEmpty(container);
  } catch {
    // Fallback: just check if there's text after stripping tags
    const textOnly = cleaned.replace(/<[^>]*>/g, '').trim();
    return textOnly.length > 0;
  }
};
