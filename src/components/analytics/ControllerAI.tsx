import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { Sparkles, Loader2, TrendingUp, Users, BarChart3, Target, Send, Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ControllerAIProps {
  onQueryComplete?: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  {
    label: "Performance Overview",
    prompt: "Gib mir eine vollständige Performance-Übersicht aller Nutzer mit ihren wichtigsten KPIs und Verbesserungsvorschlägen.",
    icon: Users,
  },
  {
    label: "Pipeline Analyse",
    prompt: "Analysiere die aktuelle Pipeline und identifiziere Engpässe. Wo verlieren wir die meisten Kandidaten?",
    icon: BarChart3,
  },
  {
    label: "Conversion Optimierung",
    prompt: "Welche Maßnahmen können wir ergreifen, um die Conversion Rate von Kandidat zu Placement zu verbessern?",
    icon: Target,
  },
  {
    label: "Trend Analyse",
    prompt: "Analysiere die Trends der letzten 30 Tage. Was entwickelt sich positiv, was negativ?",
    icon: TrendingUp,
  },
];

const STORAGE_KEY = "analytics-ai-chat-history";

export function ControllerAI({ onQueryComplete }: ControllerAIProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load messages from localStorage on initial render
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleQuery = async (queryText: string) => {
    if (!queryText.trim() || loading) return;

    const userMessage: Message = { role: "user", content: queryText };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("analytics-ai", {
        body: { 
          query: queryText,
          conversationHistory: updatedMessages 
        },
      });

      if (error) {
        if (error.message.includes("429")) {
          toast({
            title: "Rate Limit",
            description: "Zu viele Anfragen. Bitte warten Sie einen Moment.",
            variant: "destructive",
          });
        } else if (error.message.includes("402")) {
          toast({
            title: "Guthaben aufgebraucht",
            description: "Bitte laden Sie Ihr AI Guthaben auf.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      const assistantMessage: Message = { role: "assistant", content: data.answer };
      setMessages([...updatedMessages, assistantMessage]);
      onQueryComplete?.();
    } catch (error) {
      console.error("Error querying AI:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.controllerAnalysisError"),
        variant: "destructive",
      });
      // Remove the user message if there was an error
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQuery(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <Card className="border-primary/20 flex flex-col h-[600px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Controller & Business Intelligence
            </CardTitle>
            <CardDescription>
              KI-gestütztes Controlling für Beckett Stone. Analysiert alle CRM-Aktivitäten und gibt branchenspezifische Empfehlungen.
            </CardDescription>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat}>
              Chat leeren
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Quick Prompts - only show when no messages */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <Badge
                key={prompt.label}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 transition-colors py-1.5 px-3"
                onClick={() => !loading && handleQuery(prompt.prompt)}
              >
                <prompt.icon className="h-3 w-3 mr-1.5" />
                {prompt.label}
              </Badge>
            ))}
          </div>
        )}

        {/* Chat Messages */}
        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  Stellen Sie eine Frage zum CRM oder wählen Sie einen Quick-Prompt oben.
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 border"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm">{message.content}</p>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted/50 border rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analysiere Daten...
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="flex gap-2 pt-2 border-t">
          <Textarea
            placeholder="Stellen Sie eine Controlling-Frage..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-h-[60px] max-h-[120px] resize-none"
            disabled={loading}
          />
          <Button
            onClick={() => handleQuery(input)}
            disabled={loading || !input.trim()}
            size="icon"
            className="self-end h-[60px] w-[60px]"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
