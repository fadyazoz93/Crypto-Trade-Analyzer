import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, Client } from '@libsql/client';

export const DEFAULT_TURSO_URL = 'libsql://okx-crypto-analyzer-fadyezzaat.aws-eu-west-1.turso.io';
export const DEFAULT_TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg0NDUxODcsImlkIjoiMDFhMDY3OWMtNjkwMS03NDJhLThhNGQtYjY0YmNjNmJhMmQ5Iiwia2lkIjoidks5OUtiM0x1aVJpa0NDQjBtQWhYVXpnVGJ4ZTEtaTBtZ3hLZFo0czhjUSIsInJpZCI6IjY1ODMxMzNlLTk0OGMtNDc4Yy1hYmI2LWU3OGFiZmY0N2I1OSJ9.Adz1kSpWy9bRCJ1lLJRMgDiSvK73ZS5sWXSsTCQlLQulejRX_N3BMk8JdaNHDUBO8NNHn-U6KOoHh0L-6eQABw';

let tursoClient: Client | null = null;
let currentClientUrl = '';
let currentClientToken = '';
let tablesInitialized = false;

/**
 * Normalizes Turso database URLs (fixes clipped prefixes like -crypto-analyzer and protocol schemes)
 */
export function normalizeTursoUrl(rawUrl?: string): string {
  if (!rawUrl || !rawUrl.trim()) return DEFAULT_TURSO_URL;
  let url = rawUrl.trim();

  // Correction for clipped host prefix: "-crypto-analyzer-fadyezzaat" -> "okx-crypto-analyzer-fadyezzaat"
  if (url.includes('-crypto-analyzer-fadyezzaat.aws-eu-west-1.turso.io')) {
    url = url.replace(/https?:\/\/(-)?crypto-analyzer-fadyezzaat/, 'libsql://okx-crypto-analyzer-fadyezzaat')
             .replace(/libsql:\/\/(-)?crypto-analyzer-fadyezzaat/, 'libsql://okx-crypto-analyzer-fadyezzaat');
  }

  // Ensure libsql:// scheme for optimal edge latency
  if (url.startsWith('http://')) {
    url = url.replace('http://', 'libsql://');
  } else if (url.startsWith('https://')) {
    url = url.replace('https://', 'libsql://');
  }

  if (!url.startsWith('libsql://') && !url.startsWith('wss://')) {
    url = `libsql://${url}`;
  }

  return url;
}

export async function recordSignalDirect(signal: {
  symbol: string;
  decision: string;
  price: number;
  reason?: string;
  trade_setup?: any;
  sop_score?: number;
}): Promise<boolean> {
  const client = getTursoClient();
  if (!client) return false;
  try {
    if (!tablesInitialized) {
      await initTursoTables(client);
    }
    await client.execute({
      sql: `INSERT INTO signals (symbol, decision, price, reason, trade_setup, sop_score) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        signal.symbol,
        signal.decision,
        signal.price,
        signal.reason || '',
        signal.trade_setup ? JSON.stringify(signal.trade_setup) : null,
        signal.sop_score || 0,
      ],
    });
    return true;
  } catch (err) {
    console.error('Failed to record signal in Turso directly:', err);
    return false;
  }
}

export function getTursoClient(customUrl?: string, customToken?: string): Client | null {
  const url = normalizeTursoUrl(customUrl || process.env.TURSO_DATABASE_URL || DEFAULT_TURSO_URL);
  const authToken = (customToken || process.env.TURSO_AUTH_TOKEN || DEFAULT_TURSO_AUTH_TOKEN).trim();

  if (!url || !authToken) {
    return null;
  }

  // Re-use existing client if credentials match
  if (tursoClient && currentClientUrl === url && currentClientToken === authToken) {
    return tursoClient;
  }

  try {
    tursoClient = createClient({
      url,
      authToken,
    });
    currentClientUrl = url;
    currentClientToken = authToken;
    tablesInitialized = false; // re-init tables for new client
  } catch (err) {
    console.error('Failed to initialize Turso client:', err);
    return null;
  }

  return tursoClient;
}

export async function initTursoTables(client: Client) {
  if (tablesInitialized) return;

  try {
    // 1. Signals history table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        decision TEXT NOT NULL,
        price REAL NOT NULL,
        reason TEXT,
        trade_setup TEXT,
        sop_score INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Dedicated Individual Trades Table (Open, Closed, Partial Scale-Out)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        type TEXT NOT NULL,
        order_type TEXT DEFAULT 'MARKET',
        status TEXT NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        stop_loss REAL,
        take_profit_1 REAL,
        take_profit_2 REAL,
        quantity REAL,
        allocated_amount REAL,
        pnl_usdt REAL DEFAULT 0,
        pnl_percent REAL DEFAULT 0,
        sop_score INTEGER,
        entry_time TEXT,
        close_time TEXT,
        trade_json TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Paper portfolio table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS paper_portfolio (
        id TEXT PRIMARY KEY,
        balance REAL NOT NULL,
        open_trades TEXT NOT NULL,
        closed_trades TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Strategy settings table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS strategy_settings (
        id TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Custom symbols table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS custom_symbols (
        id TEXT PRIMARY KEY,
        symbols_json TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    tablesInitialized = true;
    console.log('Turso tables initialized successfully on AWS EU-West-1.');
  } catch (err) {
    console.error('Error creating Turso tables:', err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query.action || req.body?.action;

  // Runtime configuration action to test/set custom Turso credentials
  if (action === 'configure' && req.method === 'POST') {
    const { url, authToken } = req.body;
    if (!url || !authToken) {
      return res.status(400).json({ success: false, message: 'URL and Auth Token are required' });
    }
    const testClient = getTursoClient(url, authToken);
    if (!testClient) {
      return res.status(400).json({ success: false, message: 'Could not create Turso client with provided credentials' });
    }
    try {
      await initTursoTables(testClient);
      const testQuery = await testClient.execute('SELECT 1 as ok, datetime() as now');
      return res.status(200).json({
        success: true,
        message: 'تم الاتصال بنجاح وتأكيد جداول قاعدة بيانات Turso',
        dbTime: testQuery.rows[0]?.now,
        url: normalizeTursoUrl(url),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `فشل الاتصال بـ Turso: ${err.message}` });
    }
  }

  const client = getTursoClient();

  if (!client) {
    return res.status(200).json({
      success: false,
      connected: false,
      message: 'Turso environment variables (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN) not set. Falling back to local state.',
    });
  }

  try {
    await initTursoTables(client);

    // GET / API Status & Check
    if ((req.method === 'GET' && !action) || action === 'status') {
      const signalsCountRes = await client.execute('SELECT COUNT(*) as count FROM signals');
      const tradesCountRes = await client.execute('SELECT COUNT(*) as count FROM trades');
      const openTradesRes = await client.execute("SELECT COUNT(*) as count FROM trades WHERE status = 'OPEN'");

      return res.status(200).json({
        connected: true,
        host: currentClientUrl.replace('libsql://', '').split('/')[0],
        totalSignalsLogged: Number(signalsCountRes.rows[0]?.count || 0),
        totalTradesLogged: Number(tradesCountRes.rows[0]?.count || 0),
        openTradesLogged: Number(openTradesRes.rows[0]?.count || 0),
        message: 'متصل بنجاح بقاعدة بيانات Turso SQLite Cloud ☁️',
      });
    }

    // Save individual trade
    if (action === 'save_trade') {
      const trade = req.body?.trade || req.body;
      if (!trade || !trade.id || !trade.symbol) {
        return res.status(400).json({ success: false, message: 'Missing trade data (id, symbol)' });
      }

      await client.execute({
        sql: `INSERT INTO trades (
                id, symbol, type, order_type, status, entry_price, exit_price,
                stop_loss, take_profit_1, take_profit_2, quantity, allocated_amount,
                pnl_usdt, pnl_percent, sop_score, entry_time, close_time, trade_json, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                exit_price = excluded.exit_price,
                stop_loss = excluded.stop_loss,
                take_profit_1 = excluded.take_profit_1,
                take_profit_2 = excluded.take_profit_2,
                quantity = excluded.quantity,
                allocated_amount = excluded.allocated_amount,
                pnl_usdt = excluded.pnl_usdt,
                pnl_percent = excluded.pnl_percent,
                close_time = excluded.close_time,
                trade_json = excluded.trade_json,
                updated_at = CURRENT_TIMESTAMP`,
        args: [
          trade.id,
          trade.symbol,
          trade.type,
          trade.orderType || 'MARKET',
          trade.status,
          trade.entryPrice,
          trade.exitPrice ?? null,
          trade.stopLoss,
          trade.takeProfit1,
          trade.takeProfit2,
          trade.quantity ?? 0,
          trade.allocatedAmount ?? 0,
          trade.pnlUsdt ?? 0,
          trade.pnlPercent ?? 0,
          trade.sopScore ?? 0,
          trade.entryTime || new Date().toISOString(),
          trade.closeTime ?? null,
          JSON.stringify(trade),
        ],
      });

      return res.status(200).json({ success: true, message: `Trade ${trade.id} saved to Turso` });
    }

    // Fetch individual trades
    if (action === 'get_trades') {
      const status = req.query.status as string;
      const limit = Number(req.query.limit || 200);

      let sql = 'SELECT * FROM trades';
      const args: any[] = [];

      if (status) {
        sql += ' WHERE status = ?';
        args.push(status);
      }

      sql += ' ORDER BY updated_at DESC LIMIT ?';
      args.push(limit);

      const rs = await client.execute({ sql, args });
      const trades = rs.rows.map((row) => {
        if (row.trade_json) {
          try {
            return JSON.parse(String(row.trade_json));
          } catch {}
        }
        return {
          id: row.id,
          symbol: row.symbol,
          type: row.type,
          orderType: row.order_type,
          status: row.status,
          entryPrice: row.entry_price,
          exitPrice: row.exit_price,
          stopLoss: row.stop_loss,
          takeProfit1: row.take_profit_1,
          takeProfit2: row.take_profit_2,
          quantity: row.quantity,
          allocatedAmount: row.allocated_amount,
          pnlUsdt: row.pnl_usdt,
          pnlPercent: row.pnl_percent,
          sopScore: row.sop_score,
          entryTime: row.entry_time,
          closeTime: row.close_time,
        };
      });

      return res.status(200).json({ success: true, trades, count: trades.length });
    }

    // Delete single trade
    if (action === 'delete_trade') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Trade ID required' });
      await client.execute({
        sql: 'DELETE FROM trades WHERE id = ?',
        args: [String(id)],
      });
      return res.status(200).json({ success: true, message: 'Trade deleted' });
    }

    // Clear all trades
    if (action === 'clear_trades') {
      await client.execute('DELETE FROM trades');
      return res.status(200).json({ success: true, message: 'All trades cleared from Turso' });
    }

    // Save a new signal
    if (action === 'save_signal') {
      const { symbol, decision, price, reason, trade_setup, sop_score } = req.body;
      await client.execute({
        sql: `INSERT INTO signals (symbol, decision, price, reason, trade_setup, sop_score) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          symbol,
          decision,
          price,
          reason || '',
          trade_setup ? JSON.stringify(trade_setup) : null,
          sop_score || 0,
        ],
      });
      return res.status(200).json({ success: true, message: 'Signal saved to Turso' });
    }

    // Fetch signal history
    if (action === 'get_signals') {
      const rs = await client.execute('SELECT * FROM signals ORDER BY created_at DESC LIMIT 100');
      const rows = rs.rows.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        decision: row.decision,
        price: row.price,
        reason: row.reason,
        trade_setup: row.trade_setup ? JSON.parse(String(row.trade_setup)) : null,
        sop_score: row.sop_score,
        created_at: row.created_at,
      }));
      return res.status(200).json({ success: true, data: rows });
    }

    // Clear signals history
    if (action === 'clear_signals') {
      await client.execute('DELETE FROM signals');
      return res.status(200).json({ success: true, message: 'All signals cleared' });
    }

    // Sync strategy settings
    if (action === 'save_settings') {
      const { settings } = req.body;
      await client.execute({
        sql: `INSERT INTO strategy_settings (id, settings_json, updated_at) VALUES ('default', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = CURRENT_TIMESTAMP`,
        args: [JSON.stringify(settings)],
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'get_settings') {
      const rs = await client.execute({
        sql: `SELECT settings_json FROM strategy_settings WHERE id = 'default'`,
        args: [],
      });
      if (rs.rows.length > 0 && rs.rows[0].settings_json) {
        return res.status(200).json({ success: true, settings: JSON.parse(String(rs.rows[0].settings_json)) });
      }
      return res.status(200).json({ success: false, message: 'No settings found' });
    }

    // Sync paper trading portfolio and bulk-upsert all trades to trades table
    if (action === 'save_portfolio') {
      const { portfolio } = req.body;
      if (!portfolio) {
        return res.status(400).json({ success: false, message: 'Missing portfolio data' });
      }

      const openTrades = Array.isArray(portfolio.openTrades) ? portfolio.openTrades : [];
      const closedTrades = Array.isArray(portfolio.closedTrades) ? portfolio.closedTrades : [];

      await client.execute({
        sql: `INSERT INTO paper_portfolio (id, balance, open_trades, closed_trades, updated_at)
              VALUES ('default', ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET balance = excluded.balance, open_trades = excluded.open_trades, closed_trades = excluded.closed_trades, updated_at = CURRENT_TIMESTAMP`,
        args: [
          portfolio.initialBalance || 10000,
          JSON.stringify({
            openTrades,
            cashBalance: portfolio.cashBalance,
            equityHistory: portfolio.equityHistory || [],
            dailyDate: portfolio.dailyDate,
            dailyStartEquity: portfolio.dailyStartEquity,
          }),
          JSON.stringify(closedTrades),
        ],
      });

      // Synchronize all individual trades to the dedicated trades table in parallel batches
      const allTrades = [...openTrades, ...closedTrades];
      for (const trade of allTrades) {
        if (!trade.id || !trade.symbol) continue;
        try {
          await client.execute({
            sql: `INSERT INTO trades (
                    id, symbol, type, order_type, status, entry_price, exit_price,
                    stop_loss, take_profit_1, take_profit_2, quantity, allocated_amount,
                    pnl_usdt, pnl_percent, sop_score, entry_time, close_time, trade_json, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    exit_price = excluded.exit_price,
                    stop_loss = excluded.stop_loss,
                    take_profit_1 = excluded.take_profit_1,
                    take_profit_2 = excluded.take_profit_2,
                    quantity = excluded.quantity,
                    allocated_amount = excluded.allocated_amount,
                    pnl_usdt = excluded.pnl_usdt,
                    pnl_percent = excluded.pnl_percent,
                    close_time = excluded.close_time,
                    trade_json = excluded.trade_json,
                    updated_at = CURRENT_TIMESTAMP`,
            args: [
              trade.id,
              trade.symbol,
              trade.type,
              trade.orderType || 'MARKET',
              trade.status,
              trade.entryPrice,
              trade.exitPrice ?? null,
              trade.stopLoss,
              trade.takeProfit1,
              trade.takeProfit2,
              trade.quantity ?? 0,
              trade.allocatedAmount ?? 0,
              trade.pnlUsdt ?? 0,
              trade.pnlPercent ?? 0,
              trade.sopScore ?? 0,
              trade.entryTime || new Date().toISOString(),
              trade.closeTime ?? null,
              JSON.stringify(trade),
            ],
          });
        } catch (trErr) {
          console.warn(`Failed to upsert trade ${trade.id} to Turso:`, trErr);
        }
      }

      return res.status(200).json({ success: true, message: 'Portfolio and trades synced with Turso Cloud' });
    }

    if (action === 'get_portfolio') {
      const rs = await client.execute({
        sql: `SELECT * FROM paper_portfolio WHERE id = 'default'`,
        args: [],
      });
      if (rs.rows.length > 0) {
        const row = rs.rows[0];
        let openData: any = {};
        try {
          openData = JSON.parse(String(row.open_trades));
        } catch {
          openData = [];
        }

        const isArray = Array.isArray(openData);
        const openTrades = isArray ? openData : openData.openTrades || [];
        const cashBalance = isArray ? Number(row.balance) : (openData.cashBalance ?? Number(row.balance));
        const equityHistory = isArray ? [] : (openData.equityHistory || []);
        const dailyDate = isArray ? undefined : openData.dailyDate;
        const dailyStartEquity = isArray ? undefined : openData.dailyStartEquity;

        let closedTrades: any[] = [];
        try {
          closedTrades = JSON.parse(String(row.closed_trades)) || [];
        } catch {
          closedTrades = [];
        }

        return res.status(200).json({
          success: true,
          portfolio: {
            initialBalance: Number(row.balance),
            cashBalance: Number(cashBalance),
            dailyDate,
            dailyStartEquity,
            openTrades,
            closedTrades,
            equityHistory,
          },
        });
      }
      return res.status(200).json({ success: false, message: 'No portfolio found' });
    }

    // Sync custom coins / symbols
    if (action === 'save_custom_symbols') {
      const { symbols } = req.body;
      await client.execute({
        sql: `INSERT INTO custom_symbols (id, symbols_json, updated_at) VALUES ('default', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET symbols_json = excluded.symbols_json, updated_at = CURRENT_TIMESTAMP`,
        args: [JSON.stringify(symbols || [])],
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'get_custom_symbols') {
      const rs = await client.execute({
        sql: `SELECT symbols_json FROM custom_symbols WHERE id = 'default'`,
        args: [],
      });
      if (rs.rows.length > 0 && rs.rows[0].symbols_json) {
        return res.status(200).json({ success: true, symbols: JSON.parse(String(rs.rows[0].symbols_json)) });
      }
      return res.status(200).json({ success: false, symbols: [] });
    }

    return res.status(400).json({ error: 'Invalid action requested' });
  } catch (err: any) {
    console.error('Turso DB error:', err);
    return res.status(500).json({ error: err.message || 'Database error' });
  }
}
