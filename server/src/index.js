require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

function sign(user) {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

// Invite lookup
app.get('/api/invites/:token', async (req, res) => {
  const token = req.params.token;
  const inv = await prisma.invite.findUnique({ where: { token }, include: { company: true } });
  if (!inv) return res.status(404).json({ error: 'not found' });
  res.json({ company: { id: inv.company.id, name: inv.company.name, logoUrl: inv.company.logoUrl }, maxUses: inv.maxUses, usesCount: inv.usesCount, expiresAt: inv.expiresAt });
});

// Register (accept invite optional)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, inviteToken } = req.body;
  try {
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });

    let companyId = null;
    if (inviteToken) {
      const inv = await prisma.invite.findUnique({ 
        where: { token: inviteToken },
        include: { 
          company: {
            include: {
              _count: {
                select: { users: { where: { role: 'worker' } } }
              }
            }
          }
        }
      });
      if (!inv) return res.status(400).json({ error: 'invalid invite' });
      if (inv.expiresAt && inv.expiresAt < new Date()) return res.status(400).json({ error: 'invite expired' });
      if (inv.usesCount >= inv.maxUses) return res.status(400).json({ error: 'invite used up' });
      
      const maxWorkers = (inv.company.subscriptionUnits || 0) * 10;
      const currentWorkers = inv.company._count.users;
      if (currentWorkers >= maxWorkers) return res.status(400).json({ error: 'company at capacity' });
      
      companyId = inv.companyId;
      await prisma.invite.update({ where: { id: inv.id }, data: { usesCount: { increment: 1 } } });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, password: hash, name, companyId, role: companyId ? 'worker' : 'admin' } });
    const token = sign(user);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, companyId: user.companyId } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });
  const token = sign(user);
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, companyId: user.companyId } });
});

// Middleware auth
async function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'no token' });
  const token = authHeader.split(' ')[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (err) { res.status(401).json({ error: 'invalid token' }); }
}

// Admin: create company
app.post('/api/admin/companies', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { name, logoUrl, subscriptionUnits } = req.body;
  try {
    const company = await prisma.company.create({ data: { name, logoUrl, subscriptionUnits } });
    res.json(company);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

// Manager: create invite
app.post('/api/manager/invites', auth, async (req, res) => {
  if (req.user.role !== 'manager') return res.status(403).json({ error: 'forbidden' });
  const { maxUses = 1, expiresAt } = req.body;
  const manager = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!manager || !manager.companyId) return res.status(400).json({ error: 'no company' });
  
  const company = await prisma.company.findUnique({ 
    where: { id: manager.companyId },
    include: {
      _count: {
        select: { users: { where: { role: 'worker' } } }
      }
    }
  });
  
  const maxWorkers = (company.subscriptionUnits || 0) * 10;
  const currentWorkers = company._count.users;
  const remaining = Math.max(0, maxWorkers - currentWorkers);
  if (maxUses > remaining) return res.status(400).json({ error: 'exceeds subscription remaining slots' });

  const token = Math.random().toString(36).slice(2, 10);
  const inv = await prisma.invite.create({ data: { token, companyId: company.id, maxUses, expiresAt: expiresAt ? new Date(expiresAt) : null } });
  res.json({ token, link: `${req.protocol}://${req.get('host')}/accept-invite?token=${token}`, remaining: remaining - maxUses });
});

// Manager: add location
app.post('/api/manager/locations', auth, async (req, res) => {
  if (req.user.role !== 'manager') return res.status(403).json({ error: 'forbidden' });
  const { name, lat, lon, radiusM } = req.body;
  const manager = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!manager || !manager.companyId) return res.status(400).json({ error: 'no company' });
  const loc = await prisma.location.create({ data: { name, lat: Number(lat), lon: Number(lon), radiusM: radiusM || 500, companyId: manager.companyId } });
  res.json(loc);
});

// Worker start
app.post('/api/worker/start', auth, async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const { lat, lon, locationId } = req.body;
  const worker = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!worker || !worker.companyId) return res.status(400).json({ error: 'no company' });
  
  let location = null;
  if (locationId) {
    location = await prisma.location.findUnique({ where: { id: locationId } });
  } else {
    // Fetch only locations for this company
    const locs = await prisma.location.findMany({ 
      where: { companyId: worker.companyId },
      select: { id: true, lat: true, lon: true, radiusM: true }
    });
    
    // Find closest location within acceptable range
    let best = null; 
    let bestD = Infinity;
    for (const l of locs) {
      const d = haversine(l.lat, l.lon, lat, lon);
      // Early exit if within radius - no need to check all locations
      if (d <= l.radiusM && d < bestD) { 
        bestD = d; 
        best = l; 
      }
    }
    location = best;
  }
  
  if (!location) return res.status(400).json({ error: 'no location found' });
  const d = haversine(location.lat, location.lon, lat, lon);
  if (d > location.radiusM) return res.status(400).json({ error: 'not in range', distance: d, radius: location.radiusM });
  
  const ts = await prisma.timesheet.create({ 
    data: { 
      workerId: worker.id, 
      companyId: worker.companyId, 
      locationId: location.id, 
      startTime: new Date(), 
      startLat: Number(lat), 
      startLon: Number(lon), 
      status: 'WORKING' 
    } 
  });
  res.json(ts);
});

// Worker finish
app.post('/api/worker/finish', auth, async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const { timesheetId, lat, lon } = req.body;
  const ts = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!ts) return res.status(404).json({ error: 'not found' });
  if (ts.workerId !== req.user.userId) return res.status(403).json({ error: 'forbidden' });
  const end = new Date();
  const totalSec = Math.floor((end - ts.startTime) / 1000);
  const updated = await prisma.timesheet.update({ where: { id: timesheetId }, data: { endTime: end, endLat: Number(lat || 0), endLon: Number(lon || 0), totalSec, status: 'FINISHED' } });
  res.json(updated);
});

// Live map for company active workers
app.get('/api/live/company/:companyId/active-workers', auth, async (req, res) => {
  const { companyId } = req.params;
  if (req.user.role === 'manager' || req.user.role === 'admin') {
    const times = await prisma.timesheet.findMany({ where: { companyId, status: 'WORKING' }, include: { worker: true } });
    const resp = times.map(t => ({ workerId: t.workerId, name: t.worker.name || t.worker.email, lat: t.startLat, lon: t.startLon, status: t.status, timesheetId: t.id, startTime: t.startTime }));
    return res.json(resp);
  }
  return res.status(403).json({ error: 'forbidden' });
});

// Stripe checkout example
app.post('/api/payments/create-checkout', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { units = 1 } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{ price_data: { currency: 'eur', product_data: { name: `Subscription units (${units} * 10 workers)` }, unit_amount: 5000 }, quantity: units }],
      success_url: `${req.protocol}://${req.get('host')}/payments/success`,
      cancel_url: `${req.protocol}://${req.get('host')}/payments/cancel`
    });
    res.json({ url: session.url });
  } catch (err) { console.error(err); res.status(500).json({ error: 'stripe error' }); }
});

// Haversine
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
