import express from "express";
import path from "path";
import { sseHandler, sseBroadcast } from "./sse";

const app = express();
app.get("/healthz", (_,res)=>res.json({ ok:true }));
app.get("/sse", sseHandler);
app.get("/", (_,res)=>res.sendFile(path.join(__dirname, "static", "index.html")));

// test endpoint to simulate an alert
app.post("/alerts/test", express.json(), (req,res) => {
  sseBroadcast("alert", req.body || { msg:"hello" });
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT ?? 8082);
app.listen(PORT, ()=>console.log(`Alerts dev server on http://localhost:${PORT}`));
