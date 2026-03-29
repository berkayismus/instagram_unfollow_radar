/**
 * POST /api/webhooks/paddle
 *
 * Receives and processes Paddle webhook events.
 *
 * Supported event types:
 *   - subscription_created   → activates premium for the user
 *   - subscription_activated → (alias) activates premium
 *   - subscription_cancelled → cancels subscription; user stays premium until period end
 *   - subscription_payment_succeeded → refreshes expires_at
 *
 * Paddle sends events as application/x-www-form-urlencoded.
 * Signature validation uses the p_signature field and the vendor's public key
 * (handled by verifying against PADDLE_WEBHOOK_SECRET in a simplified HMAC approach).
 *
 * NOTE: For production, use Paddle's official signature verification SDK
 * or follow their documentation at https://developer.paddle.com/webhooks
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');

const router  = express.Router();

/**
 * Verify the incoming Paddle webhook signature.
 * Uses Paddle's PHP serialisation + RSA public key approach.
 * For simplicity here we validate against the configured secret;
 * replace with the full Paddle RSA verification in production.
 *
 * @param {Object} payload  - parsed URL-encoded body
 * @returns {boolean}
 */
function isValidPaddleSignature(payload) {
    if (!process.env.PADDLE_WEBHOOK_SECRET) return true; // skip in dev
    const signature = payload.p_signature;
    if (!signature) return false;

    // Build sorted key=value string (Paddle's serialisation)
    const sorted = Object.keys(payload)
        .filter(k => k !== 'p_signature')
        .sort()
        .map(k => `${k}=${payload[k]}`)
        .join('&');

    const expected = crypto
        .createHmac('sha256', process.env.PADDLE_WEBHOOK_SECRET)
        .update(sorted)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
    );
}

/**
 * Finds a user by their Paddle passthrough field (which should contain the
 * user's internal database ID, set when creating the Paddle checkout URL).
 * Falls back to looking up by email if passthrough is unavailable.
 *
 * @param {Object} body - parsed Paddle webhook body
 * @returns {Promise<number|null>} internal user id
 */
async function resolveUserId(body) {
    // Passthrough is the most reliable — set it to the user's DB id
    // when constructing the Paddle checkout URL from the backend.
    if (body.passthrough) {
        const pt = JSON.parse(body.passthrough || '{}');
        if (pt.userId) return Number(pt.userId);
    }
    // Fallback: look up by email
    if (body.email) {
        const r = await db.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [body.email]);
        return r.rows[0] ? r.rows[0].id : null;
    }
    return null;
}

router.post('/', express.urlencoded({ extended: true }), async (req, res) => {
    const body = req.body;

    if (!isValidPaddleSignature(body)) {
        console.warn('[Webhook] Invalid Paddle signature');
        return res.status(400).json({ error: 'Invalid signature' });
    }

    const eventType           = body.alert_name;
    const paddleSubscriptionId = body.subscription_id;
    const plan                = body.subscription_plan_id || body.product_name || 'premium';
    const nextBillDate        = body.next_bill_date || null;
    const cancellationDate    = body.cancellation_effective_date || null;

    console.log(`[Webhook] Received: ${eventType} sub=${paddleSubscriptionId}`);

    let userId;
    try {
        userId = await resolveUserId(body);
    } catch (err) {
        console.error('[Webhook] resolveUserId failed:', err);
        return res.status(500).json({ error: 'Could not identify user' });
    }

    if (!userId) {
        console.warn('[Webhook] Could not match event to a user', body);
        return res.status(200).json({ received: true }); // acknowledge so Paddle doesn't retry
    }

    try {
        switch (eventType) {
            case 'subscription_created':
            case 'subscription_activated':
            case 'subscription_payment_succeeded':
                await db.query(
                    `INSERT INTO subscriptions
                         (user_id, paddle_subscription_id, status, plan, expires_at)
                     VALUES ($1, $2, 'active', $3, $4)
                     ON CONFLICT (paddle_subscription_id) DO UPDATE
                         SET status     = 'active',
                             plan       = EXCLUDED.plan,
                             expires_at = EXCLUDED.expires_at,
                             updated_at = NOW()`,
                    [userId, paddleSubscriptionId, plan, nextBillDate]
                );
                break;

            case 'subscription_cancelled':
                await db.query(
                    `UPDATE subscriptions
                     SET status     = 'cancelled',
                         expires_at = $1,
                         updated_at = NOW()
                     WHERE paddle_subscription_id = $2`,
                    [cancellationDate, paddleSubscriptionId]
                );
                break;

            default:
                console.log(`[Webhook] Unhandled event type: ${eventType}`);
        }
    } catch (err) {
        console.error('[Webhook] DB operation failed:', err);
        return res.status(500).json({ error: 'Database error' });
    }

    return res.json({ received: true });
});

module.exports = router;
