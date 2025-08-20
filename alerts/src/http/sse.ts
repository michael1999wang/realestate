import { Request, Response } from "express";

type Client = { id: string; res: Response };
const clients: Client[] = [];

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  res.write(`event: ping\ndata: "ready"\n\n`);
  const id = Math.random().toString(36).slice(2);
  clients.push({ id, res });
  req.on("close", () => {
    const i = clients.findIndex(c => c.id === id);
    if (i >= 0) clients.splice(i,1);
  });
}

export function sseBroadcast(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.res.write(payload);
}
