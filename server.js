import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET || 'queueless-clinic-secret-key-10293';

app.use(cors());
app.use(express.json());

// Serve static files from the React frontend build
app.use(express.static(path.join(__dirname, 'dist')));

// --- AUTHENTICATION HELPERS ---
function generateToken(role, pin) {
  return crypto.createHmac('sha256', SECRET).update(`${role}:${pin}`).digest('hex');
}

const doctorToken = generateToken('doctor', process.env.DOCTOR_PIN || '9999');
const receptionistToken = generateToken('receptionist', process.env.RECEPTIONIST_PIN || '1234');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Token missing.' });
  }
  const token = authHeader.split(' ')[1];
  req.token = token;
  next();
}

function requireDoctor(req, res, next) {
  authenticate(req, res, () => {
    if (req.token !== doctorToken) {
      return res.status(403).json({ error: 'Forbidden. Doctor access required.' });
    }
    next();
  });
}

function requireReceptionist(req, res, next) {
  authenticate(req, res, () => {
    if (req.token !== receptionistToken) {
      return res.status(403).json({ error: 'Forbidden. Receptionist access required.' });
    }
    next();
  });
}

function requireStaff(req, res, next) {
  authenticate(req, res, () => {
    if (req.token !== doctorToken && req.token !== receptionistToken) {
      return res.status(403).json({ error: 'Forbidden. Staff access required.' });
    }
    next();
  });
}

async function requireActiveSubscription(req, res, next) {
  try {
    const settings = await db.getSettings();
    if (settings.is_expired) {
      return res.status(402).json({ 
        error: 'Trial expired. Subscription required.', 
        code: 'BILLING_LOCKED' 
      });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// --- WEBSOCKET CLIENT MANAGEMENT ---
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  
  // Send current state immediately on connect
  getFullQueueState().then(state => {
    ws.send(JSON.stringify({ type: 'INITIAL_STATE', state }));
  }).catch(err => {
    console.error('Error fetching initial WS state:', err);
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

async function getFullQueueState() {
  const date = new Date().toISOString().split('T')[0];
  const settings = await db.getSettings();
  const queue = await db.getQueue(date);
  const stats = await db.getStats(date);

  return {
    clinic_name: settings.clinic_name,
    doctor_name: settings.doctor_name,
    doctor_status: settings.doctor_status,
    current_doctor_token_id: settings.current_doctor_token_id,
    subscription_status: settings.subscription_status,
    days_remaining: settings.days_remaining,
    is_expired: settings.is_expired,
    queue,
    stats
  };
}

async function broadcastQueueState() {
  try {
    const state = await getFullQueueState();
    const payload = JSON.stringify({ type: 'UPDATE', state });
    for (const client of clients) {
      if (client.readyState === wsReadyStateOpen(client)) {
        client.send(payload);
      }
    }
  } catch (err) {
    console.error('Error broadcasting state:', err);
  }
}

function wsReadyStateOpen(wsClient) {
  // Simple helper since we import WebSocket as a type or value
  // WebSocket.OPEN is 1
  return 1;
}

// --- REST API ENDPOINTS ---

// Auth endpoint
app.post('/api/auth/login', (req, res) => {
  const { role, pin } = req.body;
  if (!role || !pin) {
    return res.status(400).json({ error: 'Role and PIN are required' });
  }

  if (role === 'doctor') {
    const expectedPin = process.env.DOCTOR_PIN || '9999';
    if (pin === expectedPin) {
      return res.json({ success: true, token: doctorToken });
    }
  } else if (role === 'receptionist') {
    const expectedPin = process.env.RECEPTIONIST_PIN || '1234';
    if (pin === expectedPin) {
      return res.json({ success: true, token: receptionistToken });
    }
  }

  return res.status(401).json({ success: false, error: 'Invalid PIN' });
});

// Fetch active queue data (public, used by patient initial load too)
app.get('/api/queue', async (req, res) => {
  try {
    const state = await getFullQueueState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patient joins queue
app.post('/api/queue/join', requireActiveSubscription, async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const id = crypto.randomUUID();
    const token = await db.addToken({
      id,
      name: name.trim(),
      phone: phone ? phone.trim() : null,
      source: 'online'
    });

    await broadcastQueueState();
    res.status(201).json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Receptionist adds walk-in patient
app.post('/api/queue/walk-in', requireReceptionist, requireActiveSubscription, async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const id = crypto.randomUUID();
    const token = await db.addToken({
      id,
      name: name.trim(),
      phone: phone ? phone.trim() : null,
      source: 'walk-in'
    });

    await broadcastQueueState();
    res.status(201).json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Doctor calls next patient
app.post('/api/queue/call-next', requireDoctor, requireActiveSubscription, async (req, res) => {
  try {
    const calledToken = await db.callNext();
    if (!calledToken) {
      return res.status(400).json({ error: 'No patients are waiting in the queue.' });
    }

    await broadcastQueueState();
    res.json({ success: true, token: calledToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Doctor completes current patient
app.post('/api/queue/complete', requireDoctor, requireActiveSubscription, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Token ID is required' });
  }

  try {
    const completedToken = await db.completeToken(id);
    if (!completedToken) {
      return res.status(404).json({ error: 'Token not found' });
    }

    await broadcastQueueState();
    res.json({ success: true, token: completedToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark patient as no-show (authorized for receptionist and doctor)
app.post('/api/queue/no-show', requireStaff, requireActiveSubscription, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Token ID is required' });
  }

  try {
    const updatedToken = await db.markNoShow(id);
    if (!updatedToken) {
      return res.status(404).json({ error: 'Token not found' });
    }

    await broadcastQueueState();
    res.json({ success: true, token: updatedToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Receptionist cancels/removes a patient token
app.post('/api/queue/remove', requireReceptionist, requireActiveSubscription, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Token ID is required' });
  }

  try {
    const cancelledToken = await db.cancelToken(id);
    if (!cancelledToken) {
      return res.status(404).json({ error: 'Token not found' });
    }

    await broadcastQueueState();
    res.json({ success: true, token: cancelledToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patient cancels/leaves their own ticket
app.post('/api/queue/leave', requireActiveSubscription, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Token ID is required' });
  }

  try {
    const cancelledToken = await db.cancelToken(id);
    if (!cancelledToken) {
      return res.status(404).json({ error: 'Token not found' });
    }

    await broadcastQueueState();
    res.json({ success: true, token: cancelledToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// For testing day rollover manually
app.post('/api/test/rollover', async (req, res) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    await db.updateSetting('current_date', yesterdayStr);

    const settings = await db.getSettings();
    await broadcastQueueState();
    res.json({ success: true, current_date: settings.current_date });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activate subscription with license key
app.post('/api/billing/activate', async (req, res) => {
  const { licenseKey } = req.body;
  const expectedKey = process.env.LICENSE_KEY || 'QL-ACTIVE-8899-CLINIC';

  if (licenseKey === expectedKey) {
    try {
      await db.updateSetting('subscription_status', 'active');
      await db.updateSetting('subscription_key', licenseKey);
      await broadcastQueueState();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(400).json({ success: false, error: 'Invalid license key' });
  }
});

// For testing: expire trial to lock features
app.post('/api/test/expire-trial', async (req, res) => {
  try {
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);
    const dateStr = thirtyOneDaysAgo.toISOString().split('T')[0];

    await db.updateSetting('trial_start_date', dateStr);
    await db.updateSetting('subscription_status', 'trial');
    await db.updateSetting('subscription_key', null);
    
    await broadcastQueueState();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// For testing: reset trial to active state (30 days remaining)
app.post('/api/test/reset-trial', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    await db.updateSetting('trial_start_date', todayStr);
    await db.updateSetting('subscription_status', 'trial');
    await db.updateSetting('subscription_key', null);
    
    await broadcastQueueState();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback to React index.html for all client-side routes (SPA routing support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// HTTP server upgrade handler for WebSockets
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Initialize database and start listening
db.initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`QueueLess Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
