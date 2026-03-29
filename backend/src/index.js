/**
 * @fileoverview Instagram Unfollow Radar — Backend API Server
 * @description Express server providing Google Sign-In authentication and
 *   Paddle subscription management for the Chrome extension.
 */

'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const authRoutes   = require('./routes/auth');
const userRoutes   = require('./routes/user');
const webhookRoutes = require('./routes/webhooks');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.use('/api/auth',          authRoutes);
app.use('/api/user',          userRoutes);
app.use('/api/webhooks/paddle', webhookRoutes);

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── 404 / ERROR ──────────────────────────────────────────────────────────────

app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
});
