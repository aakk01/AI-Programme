import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Send, Sparkles, X } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SUGGESTIONS = [
  "Reduce superstructure by 15%",
  "Switch to two-stage procurement",
  "Add a sectional handover at Level 10",
];

export const AiChatDrawer = ({ open, onClose, projectId, onApplied }) => {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!open || !projectId) return;
    api
      .get(`/projects/${projectId}/chat`)
      .then((r) => setMessages(r.data))
      .catch(() => {});
  }, [open, projectId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (instruction) => {
    const q = (instruction ?? text).trim();
    if (!q) return;
    setText("");
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/refine`, {
        instruction: q,
      });
      setMessages((m) => [...m, data]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (msg) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/apply-changes`, {
        changes: msg.changes,
      });
      onApplied(data);
      setMessages((m) =>
        m.map((x) => (x.id === msg.id ? { ...x, applied: true } : x)),
      );
      toast.success("Changes applied and programme rescheduled");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  if (!open) return null;

  return (
    <aside
      data-testid="ai-chat-drawer"
      className="flex w-[380px] shrink-0 flex-col border-l border-border bg-background"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2 font-mono-data text-[11px] uppercase tracking-[0.2em]">
          <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--bar))]" /> Refine
        </span>
        <Button
          data-testid="close-chat-drawer"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-sm"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {messages.length === 0 && !busy && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Describe a change in plain English. You'll get a diff to review
              before anything is applied.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                data-testid={`suggestion-${s.slice(0, 8)}`}
                onClick={() => send(s)}
                className="block w-full border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-[hsl(var(--surface))]"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            <div className="ml-auto max-w-[92%] border border-border bg-[hsl(var(--surface))] px-3 py-2 text-xs">
              {m.instruction}
            </div>
            <div className="border border-border p-3">
              <p className="text-xs leading-relaxed">{m.explanation}</p>
              <div className="mt-2 max-h-56 space-y-1 overflow-auto">
                {(m.changes || []).map((c, i) => (
                  <div
                    key={i}
                    className="font-mono-data text-[10.5px] leading-relaxed text-muted-foreground"
                  >
                    <span
                      className={
                        c.op === "delete"
                          ? "text-[hsl(var(--bar-critical))]"
                          : c.op === "add"
                            ? "text-[hsl(var(--bar))]"
                            : "text-[hsl(var(--bar-milestone))]"
                      }
                    >
                      {String(c.op).toUpperCase()}
                    </span>{" "}
                    {c.activity_id || c.activity?.activity_id}{" "}
                    {c.fields ? JSON.stringify(c.fields) : ""}
                  </div>
                ))}
              </div>
              {!m.applied && (m.changes || []).length > 0 && (
                <Button
                  data-testid={`apply-changes-${m.id}`}
                  size="sm"
                  className="mt-3 h-7 rounded-sm text-xs"
                  onClick={() => apply(m)}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" /> Approve & apply
                </Button>
              )}
              {m.applied && (
                <p className="mt-3 font-mono-data text-[10px] uppercase tracking-wider text-[hsl(var(--bar))]">
                  Applied
                </p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <p className="font-mono-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Planner thinking…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3">
        <Textarea
          data-testid="chat-input"
          rows={3}
          className="rounded-sm text-xs"
          placeholder="e.g. Reduce fit-out by 10 days and add a sectional completion at L05"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button
          data-testid="chat-send"
          className="mt-2 w-full rounded-sm"
          size="sm"
          disabled={busy}
          onClick={() => send()}
        >
          <Send className="mr-2 h-3.5 w-3.5" /> Send
        </Button>
      </div>
    </aside>
  );
};
