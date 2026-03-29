/**
 * GET /api/user/premium
 *
 * Returns the current premium status for the authenticated user
 * by checking their active Paddle subscription in the database.
 *
 * Response:
 *   { isPremium: boolean, planName?: string, renewsAt?: string }
 */

'use strict';

const express      = require('express');
const { requireAuth } = require('../middleware/auth');
const db           = require('../db');

const router = express.Router();

router.get('/premium', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT status, plan, expires_at
             FROM subscriptions
             WHERE user_id = $1
               AND status  = 'active'
             ORDER BY created_at DESC
             LIMIT 1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.json({ isPremium: false });
        }

        const sub = result.rows[0];
        const now = new Date();

        // Guard against expired but not yet cancelled subscriptions
        const isPremium = sub.status === 'active' &&
            (!sub.expires_at || new Date(sub.expires_at) > now);

        return res.json({
            isPremium,
            planName:  sub.plan       || null,
            renewsAt:  sub.expires_at ? sub.expires_at.toISOString() : null
        });
    } catch (err) {
        console.error('[User] premium check failed:', err);
        return res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
