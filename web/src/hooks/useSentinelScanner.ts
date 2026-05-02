import { useState } from "react";
import { WireMessage } from "@/app/api/agent/route"; // Based on your file

export function useSentinelScanner(activeAddress: string) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const triggerScan = async () => {
    setLoading(true);
    const initialMessage: WireMessage = { 
      role: "user", 
      content: `Scan wallet ${activeAddress} and give me an Elite Risk Assessment.` 
    };

    const response = await fetch("/api/agent", {
      method: "POST",
      body: JSON.stringify({ messages: [initialMessage], activeAddress }),
    });

    const data = await response.json();
    // The last assistant message will contain your formatted report
    const lastMessage = data.messages[data.messages.length - 1];
    setReport(lastMessage.content[0].text);
    setLoading(false);
  };

  return { triggerScan, report, loading };
}