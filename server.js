const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Persistent browser instance ──
let browser;
async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    browser.on('disconnected', () => { browser = null; });
  }
  return browser;
}

// PDF endpoint
app.post('/api/pdf', async (req, res) => {
  const { html, filename } = req.body;
  if (!html) return res.status(400).json({ error: 'No HTML provided' });

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Force dark backgrounds to print
    await page.emulateMediaType('screen');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename || 'export'}.pdf"`,
      'Content-Length': pdf.length
    });
    res.send(pdf);

  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (page) await page.close();
  }
});

// ── Exchange rate cache (1 hour TTL) ──
let ratesCache = null;
let ratesCachedAt = 0;
const RATES_TTL = 60 * 60 * 1000;

app.get('/api/rates', async (req, res) => {
  if (ratesCache && (Date.now() - ratesCachedAt) < RATES_TTL) {
    return res.json(ratesCache);
  }
  try {
    const response = await fetch('https://www.nationalbanken.dk/api/currencyratesxml?lang=en');
    const text = await response.text();
    // Parse XML and convert rates (Nationalbanken gives DKK per 100 units)
    const matches = [...text.matchAll(/code="(\w+)"[^/]*rate="([\d.]+)"/g)];
    const rates = {};
    matches.forEach(([,code,rate]) => {
      rates[code] = parseFloat(rate) / 100;
    });
    ratesCache = rates;
    ratesCachedAt = Date.now();
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch rates' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`The/Lab Tool running at http://localhost:${PORT}`);
});
