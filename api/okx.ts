import type { VercelRequest, VercelResponse } from '@vercel/node';

const OKX_BASE_URLS = [
  'https://www.okx.com',
  'https://aws.okx.com',
  'https://okx.com',
];

export default async function okxHandler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const endpoint = (req.query.endpoint as string) || 'market/tickers';
  const queryParams = new URLSearchParams();

  Object.entries(req.query).forEach(([key, value]) => {
    if (key !== 'endpoint' && typeof value === 'string') {
      queryParams.append(key, value);
    }
  });

  const queryString = queryParams.toString();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const path = `/api/v5/${cleanEndpoint}${queryString ? `?${queryString}` : ''}`;

  let lastError: any = null;

  for (const baseUrl of OKX_BASE_URLS) {
    try {
      const targetUrl = `${baseUrl}${path}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OKX-Market-Analyzer/1.0',
        },
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return res.status(200).json(data);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  return res.status(502).json({
    error: 'Failed to proxy OKX request across all mirrors',
    details: lastError?.message || 'Unknown error',
  });
}
