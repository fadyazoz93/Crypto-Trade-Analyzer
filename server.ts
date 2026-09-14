import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import tursoHandler from "./api/turso";
import okxHandler from "./api/okx";
import telegramHandler from "./api/telegram";
import { backgroundScannerDaemon } from "./server/backgroundScanner";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 24/7 Autonomous Background Scanner Daemon API routes
  app.get("/api/daemon/status", (req, res) => {
    res.json({ success: true, ...backgroundScannerDaemon.getStatus() });
  });

  app.post("/api/daemon/toggle", (req, res) => {
    const { active, interval, mode, symbols, minSopScore } = req.body || {};
    if (typeof active === 'boolean') {
      if (active) {
        backgroundScannerDaemon.start();
      } else {
        backgroundScannerDaemon.stop();
      }
    }
    if (typeof interval === 'number' && interval >= 15) {
      backgroundScannerDaemon.setIntervalSeconds(interval);
    }
    if (typeof minSopScore === 'number') {
      backgroundScannerDaemon.setMinSopScore(minSopScore);
    }
    if (mode === 'INTRADAY' || mode === 'SCALP') {
      backgroundScannerDaemon.setTradingMode(mode);
    }
    if (Array.isArray(symbols) && symbols.length > 0) {
      backgroundScannerDaemon.setSymbols(symbols);
    }
    res.json({ success: true, message: 'Daemon settings updated', status: backgroundScannerDaemon.getStatus() });
  });

  app.post("/api/daemon/scan-now", async (req, res) => {
    try {
      const result = await backgroundScannerDaemon.runScanCycle();
      res.json({ success: true, message: 'Scan cycle triggered', result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // OKX proxy API route for market data & candles
  app.get("/api/okx", async (req, res) => {
    try {
      await okxHandler(req as any, res as any);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'OKX proxy error' });
    }
  });

  // Turso Database API routes
  app.all("/api/turso", async (req, res) => {
    try {
      await tursoHandler(req as any, res as any);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Turso DB server error' });
    }
  });

  // Telegram Bot Notifications API routes
  app.all("/api/telegram", async (req, res) => {
    try {
      await telegramHandler(req as any, res as any);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Telegram server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    // Start the 24/7 background market scanner daemon
    backgroundScannerDaemon.start();
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n=====================================================================`);
      console.error(`❌ تنبيه: المنفذ ${PORT} مستخدم بالفعل في نافذة أو تطبيق آخر!`);
      console.error(`Port ${PORT} is already in use by an existing instance.`);
      console.error(`تم إيقاف هذه النافذة تلقائياً لمنع ازدواجية وتكرار إرسال إشارات تليجرام.`);
      console.error(`=====================================================================\n`);
      process.exit(0);
    }
  });
}

startServer();
