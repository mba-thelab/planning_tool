const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const puppeteer = require('puppeteer');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ALLOWED_DOMAIN = '@thelab.dk';

app.set('trust proxy', 1); // required behind Railway's proxy
app.use(express.json({ limit: '10mb' }));

// ── SESSION ──
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// ── PASSPORT ──
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  BASE_URL + '/auth/google/callback',
  },
  (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value || '';
    if (!email.endsWith(ALLOWED_DOMAIN)) {
      return done(null, false);
    }
    return done(null, {
      googleId: profile.id,
      email,
      name:   profile.displayName,
      avatar: profile.photos?.[0]?.value || null,
    });
  }
));

// ── AUTH ROUTES ──
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html?error=1' }),
  (req, res) => res.redirect('/')
);

app.get('/api/me', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const user = { ...req.user };
  if (process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL) {
    user.isBootstrapAdmin = true;
  }
  res.json(user);
});

app.post('/api/logout', (req, res) => {
  req.logout(() => res.json({ ok: true }));
});

// ── AUTH GUARD — runs before static files ──
app.use((req, res, next) => {
  const publicPaths = ['/login.html', '/auth/'];
  if (publicPaths.some(p => req.path.startsWith(p))) return next();
  if (req.isAuthenticated()) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login.html');
});

// ── STATIC FILES ──
app.use(express.static(path.join(__dirname, 'public')));

// ── PUPPETEER (persistent browser) ──
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

// ── PDF ──
app.post('/api/pdf', async (req, res) => {
  const { html, filename } = req.body;
  if (!html) return res.status(400).json({ error: 'No HTML provided' });

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename || 'export'}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (page) await page.close();
  }
});

// ── EXCHANGE RATES ──
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
    const matches = [...text.matchAll(/code="(\w+)"[^/]*rate="([\d.]+)"/g)];
    const rates = {};
    matches.forEach(([, code, rate]) => { rates[code] = parseFloat(rate) / 100; });
    ratesCache = rates;
    ratesCachedAt = Date.now();
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch rates' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`The/Lab Tool running at ${BASE_URL}`);
});
