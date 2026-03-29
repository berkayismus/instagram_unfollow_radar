/**
 * POST /api/auth/google
 *
 * Receives a Google OAuth access token from the Chrome extension,
 * verifies it with Google's userinfo endpoint, upserts the user
 * record in the database, and returns a signed JWT.
 */

'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const router = express.Router();

router.post('/google', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Missing Google access token' });
    }

    // Verify the token with Google
    let googleUser;
    try {
        const response = await fetch(
            `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${encodeURIComponent(token)}`
        );
        if (!response.ok) {
            return res.status(401).json({ error: 'Invalid Google token' });
        }
        googleUser = await response.json();
    } catch (err) {
        console.error('[Auth] Google userinfo fetch failed:', err);
        return res.status(502).json({ error: 'Google verification failed' });
    }

    const { id: googleId, email, name, picture: avatar } = googleUser;

    // Upsert user in the database
    let user;
    try {
        const result = await db.query(
            `INSERT INTO users (google_id, email, name, avatar_url)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (google_id) DO UPDATE
                 SET email      = EXCLUDED.email,
                     name       = EXCLUDED.name,
                     avatar_url = EXCLUDED.avatar_url,
                     updated_at = NOW()
             RETURNING id, google_id, email, name, avatar_url`,
            [googleId, email, name, avatar]
        );
        user = result.rows[0];
    } catch (err) {
        console.error('[Auth] DB upsert failed:', err);
        return res.status(500).json({ error: 'Database error' });
    }

    // Sign JWT
    const payload = { id: user.id, email: user.email, google_id: user.google_id };
    const jwtToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '30d'
    });

    return res.json({
        jwt: jwtToken,
        user: {
            email:  user.email,
            name:   user.name,
            avatar: user.avatar_url
        }
    });
});

module.exports = router;
