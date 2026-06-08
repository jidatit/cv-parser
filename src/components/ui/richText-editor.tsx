import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered } from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Beschreibung eingeben...",
  className = "",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isUpdatingRef = useRef(false);
  const lastValueRef = useRef(value);

  // Parse so only lines starting with "•" start a new bullet; other lines continue the previous
  const parseBulletLines = (text: string): string[] => {
    if (!text || !text.trim()) return [];
    const lines = text.split("\n");
    const result: string[] = [];
    let current = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("•")) {
        if (current) {
          result.push(current.trim());
          current = "";
        }
        current = trimmed.replace(/^•\s*/, "").trim();
      } else {
        if (current) current += "\n" + line.trim();
        else if (trimmed) current = trimmed;
      }
    }
    if (current) result.push(current.trim());
    return result;
  };

  // Convert plain text with bullet points to HTML (one bullet = one <li>, continuation lines with <br/>)
  const convertToHTML = (text: string): string => {
    if (!text) return "";

    // If value is already HTML, pass it through directly
    if (/<(ul|ol|li)\b/i.test(text)) {
      return text;
    }

    const bullets = parseBulletLines(text);
    if (bullets.length === 0) return "";

    const listItems = bullets
      .map((content) => `<li>${content.replace(/\n/g, "<br/>")}</li>`)
      .join("");
    return `<ul>${listItems}</ul>`;
  };

  // Convert HTML back to plain text with bullet points
  // Convert HTML back to plain text with bullet points and explicit newlines
  const convertToPlainText = (html: string): string => {
    const temp = document.createElement("div");
    temp.innerHTML = html;

    let text = "";
    const processNode = (node: Node) => {
      if (node.nodeName === "UL" || node.nodeName === "OL") {
        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeName === "LI") {
            // Take the raw HTML of the <li>, preserve custom bullets (•, ○) and line breaks
            const liWrapper = document.createElement("div");
            liWrapper.innerHTML = (child as HTMLElement).innerHTML;

            // Convert <br> tags back to newlines
            const liHtml = liWrapper.innerHTML.replace(/<br\s*\/?>/gi, "\n");

            // Strip any remaining tags (keep Unicode characters like •, ○)
            let liText = liHtml.replace(/<[^>]+>/g, "").trim();

            // Skip completely empty or lone bullet marker lines
            if (!liText || liText === "•" || liText === "○") {
              return;
            }

            // If this line does NOT already start with a bullet, prefix a main bullet "• "
            if (!liText.startsWith("•") && !liText.startsWith("○")) {
              liText = "• " + liText;
            }

            text += liText + "\n";
          }
        });
      } else if (node.nodeName === "P") {
        const content = (node.textContent || "").trim();
        if (content) text += content + "\n";
      } else if (node.nodeName === "BR") {
        text += "\n";
      } else if (node.nodeType === Node.TEXT_NODE) {
        const content = (node.textContent || "").trim();
        if (content) text += content + "\n";
      } else {
        Array.from(node.childNodes).forEach(processNode);
      }
    };

    Array.from(temp.childNodes).forEach(processNode);
    return text.trim();
  };

  // Initialize content and handle external updates (but not during typing)
  useEffect(() => {
    if (editorRef.current && !isUpdatingRef.current) {
      // Only update if not currently focused (user is not typing)
      if (!isFocused) {
        const currentPlainText = convertToPlainText(
          editorRef.current.innerHTML,
        );
        // Only update if the content is actually different
        if (currentPlainText !== value) {
          const htmlContent = convertToHTML(value);
          editorRef.current.innerHTML = htmlContent;
        }
      }
      lastValueRef.current = value;
    }
  }, [value, isFocused]);

  const handleInput = () => {
    if (editorRef.current && !isUpdatingRef.current) {
      isUpdatingRef.current = true;
      const plainText = convertToPlainText(editorRef.current.innerHTML);
      onChange(plainText);
      isUpdatingRef.current = false;
    }
  };

  // Insert a sub-bullet marker (○ ) at the current caret position.
  // This lets the user quickly create sub bullet points that the CV parser
  // recognizes as level-2 bullets without changing other logic.
  const insertSubBullet = () => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.startContainer)) return;

    // Use execCommand so undo/redo works as expected
    document.execCommand("insertText", false, "○ ");
    handleInput();
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
      handleInput();
    }
  };

  return (
    <div
      className={`border rounded-md w-full ${
        isFocused ? "ring-2 ring-ring ring-offset-2" : ""
      } ${className}`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted/50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand("bold")}
          className="h-8 w-8 p-0"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand("italic")}
          className="h-8 w-8 p-0"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand("insertUnorderedList")}
          className="h-8 w-8 p-0"
        >
          <List className="h-4 w-4" />
        </Button>
        {/* Sub-bullet helper: inserts a "○ " marker at caret position */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={insertSubBullet}
          className="h-8 px-2 text-xs font-semibold"
          title="Sub-Bullet (○) einfügen"
        >
          ○
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand("insertOrderedList")}
          className="h-8 w-8 p-0"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor - full width so bullets and text use full width */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="min-h-[120px] max-h-[300px] w-full overflow-y-auto p-3 text-sm focus:outline-none [&_ul]:w-full [&_li]:break-words"
        data-placeholder={placeholder}
      />

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
        /* Full-width list; bullet on left, text indented so wrapped lines align */
        [contenteditable] ul,
        [contenteditable] ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
          list-style: none;
          width: 100%;
        }
        [contenteditable] li {
          position: relative;
          margin: 0.5em 0;
          padding-left: 0.75em;
          width: 100%;
          word-wrap: break-word;
        }
        [contenteditable] li::before {
          content: "•";
          position: absolute;
          left: 0;
          top: 0;
          color: hsl(var(--foreground));
        }
        [contenteditable] p {
          margin: 0.5em 0;
        }
      `}</style>
    </div>
  );
}
