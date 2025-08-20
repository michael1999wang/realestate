import { Alert } from "@/app/api/route-types";

export function connectAlerts(onMsg: (a: Alert) => void) {
  const url = process.env.NEXT_PUBLIC_ALERTS_SSE!;
  const es = new EventSource(url);
  es.addEventListener("alert", (e: MessageEvent) => onMsg(JSON.parse(e.data)));
  return () => es.close();
}
