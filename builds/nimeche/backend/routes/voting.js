// routes/voting.js — Roster-verified voting endpoints
const express = require('express')
const router = express.Router()
const { query, transaction } = require('../db')
const {
    getOrgId,
    voteLimiter,
    voterValidationLimiter,
    csrfProtection,
    issueCsrfToken,
    getElectionStatus,
    getPortalMode,
    requireVoter,
    issueVoterToken,
} = require('./middleware')

function isValidFingerprint(fingerprint) {
    return typeof fingerprint === 'string' && fingerprint.length >= 8 && fingerprint.length <= 64
}

function normalizeMatricNumber(value) {
    return typeof value === 'string' ? value.replace(/[\s/-]/g, '') : ''
}

function normalizeName(value) {
    if (typeof value !== 'string') return ''
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
}

async function getCurrentElectionId(orgId) {
    const electionRes = await query(
        `select id from elections where organization_id = $1 order by created_at desc limit 1`,
        [orgId]
    )
    return electionRes.rows[0]?.id || null
}

async function getDbVotedCategoryIds(orgId, electionId, voterId, categoryIds = []) {
    if (!voterId || !electionId) return []

    const params = [orgId, electionId, voterId]
    let categoryFilter = ''
    if (categoryIds.length > 0) {
        params.push(categoryIds)
        categoryFilter = `and position_id = any($4::text[])`
    }

    const result = await query(
        `select position_id
         from votes
         where organization_id = $1
           and election_id = $2
           and eligible_voter_id = $3
           ${categoryFilter}
         order by created_at asc`,
        params
    )
    return result.rows.map(row => row.position_id)
}

// Provide CSRF token
router.get('/csrf-token', (req, res) => {
    res.json({ csrfToken: issueCsrfToken(req, res) })
})

// Submit votes — immediate, no email verification
router.post('/submit-votes', voteLimiter, csrfProtection, requireVoter, async (req, res) => {
    const { fingerprint, department, choices } = req.body
    const orgId = getOrgId()

    // --- Input validation ---
    if (!isValidFingerprint(fingerprint)) {
        return res.status(400).json({ message: 'Invalid device fingerprint.' })
    }
    if (!Array.isArray(choices) || choices.length === 0 || choices.length > 60) {
        return res.status(400).json({ message: 'Invalid choices.' })
    }
    const normalizedChoices = []
    const seenCategoryIds = new Set()
    for (const c of choices) {
        if (!c.categoryId || typeof c.categoryId !== 'string' || c.categoryId.length > 100) {
            return res.status(400).json({ message: 'Invalid category in choices.' })
        }
        if (
            (!c.candidateId || typeof c.candidateId !== 'string' || c.candidateId.length > 80) &&
            (!c.nomineeName || typeof c.nomineeName !== 'string' || c.nomineeName.length > 200)
        ) {
            return res.status(400).json({ message: 'Invalid candidate in choices.' })
        }
        if (seenCategoryIds.has(c.categoryId)) continue
        seenCategoryIds.add(c.categoryId)
        normalizedChoices.push({
            categoryId: c.categoryId,
            candidateId: c.candidateId || null,
            nomineeName: c.nomineeName ? c.nomineeName.trim() : null,
        })
    }

    const status = await getElectionStatus()
    if (status !== 'open') {
        return res.status(403).json({ message: 'Voting is currently closed.' })
    }
    const portalMode = await getPortalMode()
    if (portalMode !== 'voting') {
        return res.status(403).json({ message: 'The portal is not currently accepting votes.' })
    }

    try {
        const electionId = await getCurrentElectionId(orgId)
        if (!electionId) return res.status(400).json({ message: 'No active election configured.' })
        if (req.voter.electionId !== electionId) {
            return res.status(401).json({ message: 'Please verify your voter details again.' })
        }

        const voterRes = await query(
            `select id from eligible_voters
             where id = $1 and organization_id = $2 and election_id = $3 and is_active = true`,
            [req.voter.id, orgId, electionId]
        )
        if (voterRes.rowCount === 0) {
            return res.status(401).json({ message: 'Please verify your voter details again.' })
        }

        const departmentRes = await query(
            `select id from departments where organization_id = $1 and id = $2`,
            [orgId, department]
        )
        if (departmentRes.rowCount === 0) {
            return res.status(400).json({ message: 'Invalid department.' })
        }

        const selectedCategoryIds = normalizedChoices.map(choice => choice.categoryId)
        const dbVotedIds = await getDbVotedCategoryIds(orgId, electionId, req.voter.id, selectedCategoryIds)
        const alreadyVotedIds = new Set(dbVotedIds)

        const recorded = await transaction(async client => {
            const inserted = []
            for (const { categoryId, candidateId: selectedCandidateId, nomineeName } of normalizedChoices) {
                if (alreadyVotedIds.has(categoryId)) continue

                const candidateParams = [orgId, electionId, categoryId]
                let candidateFilter = ''
                if (selectedCandidateId) {
                    candidateParams.push(selectedCandidateId)
                    candidateFilter = 'and id = $4'
                } else {
                    candidateParams.push(nomineeName)
                    candidateFilter = 'and name = $4'
                }

                const candidateRes = await client.query(
                    `select id from candidates
                     where organization_id = $1
                       and election_id = $2
                       and position_id = $3
                       and status = 'approved'
                       ${candidateFilter}
                     limit 1`,
                    candidateParams
                )
                const approvedCandidateId = candidateRes.rows[0]?.id
                if (!approvedCandidateId) continue

                const voteRes = await client.query(
                    `insert into votes (organization_id, election_id, eligible_voter_id, voter_fingerprint, department_id, position_id, candidate_id)
                     values ($1, $2, $3, $4, $5, $6, $7)
                     on conflict (election_id, eligible_voter_id, position_id) where eligible_voter_id is not null do nothing
                     returning position_id`,
                    [orgId, electionId, req.voter.id, fingerprint, department, categoryId, approvedCandidateId]
                )
                if (voteRes.rowCount > 0) inserted.push(categoryId)
            }
            return inserted
        })

        const latestDbVotedIds = await getDbVotedCategoryIds(orgId, electionId, req.voter.id)
        const allVotedIds = [...new Set([...latestDbVotedIds, ...recorded])].filter(Boolean)

        res.status(201).json({
            success: true,
            recorded,
            skipped: selectedCategoryIds.filter(categoryId => !recorded.includes(categoryId)),
            votedCategoryIds: allVotedIds,
        })
    } catch (error) {
        console.error('Error submitting votes:', error)
        res.status(500).json({ message: 'A server error occurred.' })
    }
})

// The verified roster identity is authoritative across browsers and devices.
router.get('/voted-categories', requireVoter, async (req, res) => {
    const orgId = getOrgId()

    try {
        const electionId = await getCurrentElectionId(orgId)
        if (!electionId || req.voter.electionId !== electionId) {
            return res.status(401).json({ message: 'Please verify your voter details again.' })
        }
        const ids = await getDbVotedCategoryIds(orgId, electionId, req.voter.id)
        res.json({ votedCategoryIds: [...new Set(ids)] })
    } catch (error) {
        console.error('Error loading voted categories:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

router.post('/validate', voterValidationLimiter, async (req, res) => {
    const orgId = getOrgId()
    const matricNumber = normalizeMatricNumber(req.body.matricNumber)
    const nameKey = normalizeName(req.body.verificationName || req.body.surname)
    const invalidMessage = 'We could not verify those details. Check your matric number and name.'

    if (!/^\d{9}$/.test(matricNumber) || nameKey.length < 2 || nameKey.length > 160) {
        return res.status(400).json({ valid: false, message: invalidMessage })
    }

    try {
        const electionId = await getCurrentElectionId(orgId)
        if (!electionId) return res.status(400).json({ valid: false, message: invalidMessage })

        const result = await query(
            `select id, full_name
             from eligible_voters
             where organization_id = $1
               and election_id = $2
               and matric_number = $3
               and $4 = any(name_keys)
               and is_active = true
             limit 1`,
            [orgId, electionId, matricNumber, nameKey]
        )
        const voter = result.rows[0]
        if (!voter) return res.status(400).json({ valid: false, message: invalidMessage })

        const voterToken = issueVoterToken({
            id: voter.id,
            organizationId: orgId,
            electionId,
        })
        res.json({
            valid: true,
            fullName: voter.full_name,
            departmentId: 'nimeche',
            voterToken,
        })
    } catch (error) {
        console.error('Error validating voter:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

module.exports = router
