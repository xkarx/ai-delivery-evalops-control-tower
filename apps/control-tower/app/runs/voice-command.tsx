"use client";

import { Mic, Send, Square } from "lucide-react";
import { useRef, useState } from "react";

type Recognition = { start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; lang: string };

export function VoiceCommand() {
  const [command, setCommand] = useState("");
  const [message, setMessage] = useState("");
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | undefined>(undefined);
  function listen() {
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) { setMessage("Voice input is not supported in this browser; type the command instead."); return; }
    const next = new SpeechRecognition(); next.lang = "en-US"; next.onresult = (event) => setCommand(event.results[0]?.[0]?.transcript ?? ""); next.onend = () => setListening(false); next.onerror = () => { setListening(false); setMessage("Voice capture failed; type the command instead."); }; recognition.current = next; setListening(true); next.start();
  }
  async function submit() {
    if (!command.trim()) return;
    setMessage("Executing command…");
    const response = await fetch("/api/operator/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command }) });
    const result = await response.json() as { reply?: string; url?: string };
    setMessage(`${result.reply ?? "Command complete."}${result.url ? ` ${result.url}` : ""}`);
  }
  return <div className="operator-command panel"><div><p className="eyebrow">Operator command</p><h2>Speak to the delivery system</h2><p>Try “run workflow”, “create ticket: Fix checkout”, “approve release”, “sync delivery”, or “status”.</p></div><div className="operator-command-row"><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Type or speak a command" aria-label="Operator command" /><button className="button secondary" type="button" onClick={listening ? () => recognition.current?.stop() : listen}>{listening ? <Square size={15} /> : <Mic size={15} />} {listening ? "Stop" : "Speak"}</button><button className="button primary" type="button" onClick={submit}><Send size={15} /> Run</button></div>{message && <small role="status">{message}</small>}</div>;
}
