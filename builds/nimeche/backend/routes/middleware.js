// routes/middleware.js — Shared middleware: rate limiters, CSRF, auth, election cache
const { rateLimit, ipKeyGenerator } = require('express-rate-limit')
const jwt = require('jsonwebtoken')
const { query } = require('../db')

function getJwtSecret() {
    return process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || 'replace-this-secret'
}

function getOrgId() {
    return process.env.ORG_ID || 'default'
}

// =================================================================
// --- RATE LIMITERS ---
// =================================================================
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    skip: req => req.headers.authorization?.startsWith('Bearer '),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please slow down.' }
})

const voteLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many vote attempts. Please try again later.' }
})

const voterValidationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 6,
    keyGenerator: req => {
        const matricNumber = String(req.body?.matricNumber || '').replace(/\D/g, '').slice(0, 9)
        return `${ipKeyGenerator(req.ip)}:${matricNumber || 'missing'}`
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many verification attempts. Please wait and try again.' }
})

const adminLoginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please wait and try again.' }
})

const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many admin requests. Please wait a moment.' }
})

const nominateLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many nomination submissions. Try again later.' }
})

// =================================================================
// --- REQUEST TOKEN PROTECTION ---
// =================================================================
function votedCookieName() {
    return `${getOrgId()}_voted`
}

function issueCsrfToken() {
    return jwt.sign(
        { role: 'request-token', organizationId: getOrgId() },
        getJwtSecret(),
        { expiresIn: '30m' }
    )
}

function csrfProtection(req, res, next) {
    const providedToken = req.get('X-CSRF-Token')
    if (!providedToken) {
        return res.status(403).json({ message: 'Invalid security token. Please refresh and try again.' })
    }
    try {
        const payload = jwt.verify(providedToken, getJwtSecret())
        if (payload.role !== 'request-token' || payload.organizationId !== getOrgId()) {
            throw new Error('Invalid request token')
        }
        return next()
    } catch {
        return res.status(403).json({ message: 'Invalid security token. Please refresh and try again.' })
    }
}

// =================================================================
// --- ADMIN AUTH MIDDLEWARE ---
// =================================================================
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const payload = jwt.verify(authHeader.slice(7), getJwtSecret())
            if (payload.role !== 'admin') {
                return res.status(401).json({ message: 'Unauthorized: Invalid credentials.' })
            }
            return next()
        } catch {
            return res.status(401).json({ message: 'Session expired. Please log in again.' })
        }
    }
    // Fallback: password in body (for backwards compatibility during migration)
    if (req.body.password === process.env.ADMIN_PASSWORD) {
        return next()
    }
    return res.status(401).json({ message: 'Unauthorized: Invalid credentials.' })
}

function issueVoterToken(voter) {
    return jwt.sign(
        {
            role: 'voter',
            organizationId: voter.organizationId,
            electionId: voter.electionId,
        },
        getJwtSecret(),
        { subject: voter.id, expiresIn: '12h' }
    )
}

function requireVoter(req, res, next) {
    const token = req.get('X-Voter-Token')
    if (!token) {
        return res.status(401).json({ message: 'Please verify your voter details again.' })
    }
    try {
        const payload = jwt.verify(token, getJwtSecret())
        if (
            payload.role !== 'voter' ||
            payload.organizationId !== getOrgId() ||
            typeof payload.sub !== 'string' ||
            typeof payload.electionId !== 'string'
        ) {
            throw new Error('Invalid voter session')
        }
        req.voter = {
            id: payload.sub,
            electionId: payload.electionId,
        }
        return next()
    } catch {
        return res.status(401).json({ message: 'Your voter session has expired. Please verify again.' })
    }
}

// =================================================================
// --- ELECTION STATUS CACHE ---
// =================================================================
let electionStatusCache = { value: null, updatedAt: 0 }
let portalModeCache = { value: null, updatedAt: 0 }
const CACHE_TTL_MS = 10_000

async function getElectionStatus() {
    if (electionStatusCache.value && Date.now() - electionStatusCache.updatedAt < CACHE_TTL_MS) {
        return electionStatusCache.value
    }
    const result = await query(
        `select coalesce(
            (select value from settings where organization_id = $1 and key = 'electionStatus'),
            (select status from elections where organization_id = $1 order by created_at desc limit 1),
            'closed'
        ) as status`,
        [getOrgId()]
    )
    const status = result.rows[0]?.status || 'closed'
    electionStatusCache = { value: status, updatedAt: Date.now() }
    return status
}

async function getPortalMode() {
    if (portalModeCache.value && Date.now() - portalModeCache.updatedAt < CACHE_TTL_MS) {
        return portalModeCache.value
    }
    const result = await query(
        `select coalesce(
            (select value from settings where organization_id = $1 and key = 'portalMode'),
            $2,
            'nominations'
        ) as mode`,
        [getOrgId(), ['nominations', 'voting'].includes(process.env.PORTAL_MODE) ? process.env.PORTAL_MODE : null]
    )
    const mode = ['nominations', 'voting'].includes(result.rows[0]?.mode)
        ? result.rows[0].mode
        : 'nominations'
    portalModeCache = { value: mode, updatedAt: Date.now() }
    return mode
}

function invalidateElectionCache() {
    electionStatusCache = { value: null, updatedAt: 0 }
    portalModeCache = { value: null, updatedAt: 0 }
}

module.exports = {
    getOrgId,
    globalLimiter,
    voteLimiter,
    voterValidationLimiter,
    adminLimiter,
    adminLoginLimiter,
    nominateLimiter,
    csrfProtection,
    issueCsrfToken,
    requireAdmin,
    requireVoter,
    issueVoterToken,
    getElectionStatus,
    getPortalMode,
    invalidateElectionCache,
    getJwtSecret,
    votedCookieName,
}
