// routes/admin.js — Admin-only endpoints (results, settings, reset)
const express = require('express')
const router = express.Router()
const { query, transaction } = require('../db')
const { adminLimiter, requireAdmin, invalidateElectionCache, getOrgId } = require('./middleware')

// All admin routes require rate limiting + password auth
router.use(adminLimiter)
router.use(requireAdmin)

// --- Results (aggregated vote counts) ---
router.post('/results', async (req, res) => {
    try {
        const result = await query(
            `with current_election as (
                select id
                from elections
                where organization_id = $1
                order by created_at desc
                limit 1
             )
             select
                p.id as category,
                c.name,
                count(v.id)::int as votes
             from positions p
             left join current_election e on true
             left join candidates c
               on c.organization_id = p.organization_id
              and c.election_id = e.id
              and c.position_id = p.id
              and (
                  c.status = 'approved'
                  or exists (
                      select 1 from votes recorded_vote
                      where recorded_vote.organization_id = p.organization_id
                        and recorded_vote.election_id = e.id
                        and recorded_vote.position_id = p.id
                        and recorded_vote.candidate_id = c.id
                  )
              )
             left join votes v
               on v.organization_id = p.organization_id
              and v.election_id = e.id
              and v.position_id = p.id
              and v.candidate_id = c.id
             where p.organization_id = $1
             group by p.sort_order, p.id, c.id, c.name
             order by p.sort_order, p.id, votes desc, c.name`,
            [getOrgId()]
        )
        const grouped = new Map()
        for (const row of result.rows) {
            const nominees = grouped.get(row.category) || []
            if (row.name) nominees.push({ name: row.name, votes: row.votes })
            grouped.set(row.category, nominees)
        }
        res.json(Array.from(grouped.entries()).map(([category, nominees]) => ({ category, nominees })))
    } catch (error) {
        console.error('Error fetching results:', error)
        res.status(500).json({ message: 'A server error occurred while fetching results.' })
    }
})

// --- Nominations (20 award categories, paginated as complete groups) ---
router.post('/pending-nominations', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.body.page) || 1)
        const limit = Math.min(20, Math.max(1, parseInt(req.body.limit) || 5))
        const skip = (page - 1) * limit
        const search = typeof req.body.search === 'string' ? req.body.search.trim().slice(0, 100) : ''
        const searchPattern = `%${search}%`

        const [categoryRows, total] = await Promise.all([
            query(
                `with matching_categories as (
                    select p.id, p.title, p.sort_order
                    from positions p
                    where p.organization_id = $1
                      and (
                          $2 = ''
                          or p.title ilike $3
                          or exists (
                              select 1
                              from nominations n
                              where n.organization_id = p.organization_id
                                and n.position_id = p.id
                                and (n.full_name ilike $3 or coalesce(n.popular_name, '') ilike $3)
                          )
                      )
                ),
                category_page as (
                    select id, title, sort_order
                    from matching_categories
                    order by sort_order, title, id
                    offset $4 limit $5
                ),
                grouped_nominees as (
                    select
                        (array_agg(n.id order by (n.status = 'pending') desc, n.submitted_at desc))[1] as id,
                        array_agg(n.id order by n.submitted_at desc) as "nominationIds",
                        (array_agg(n.full_name order by n.submitted_at desc))[1] as "fullName",
                        max(n.popular_name) as "popularName",
                        n.position_id as category,
                        max(n.image_url) as "imageUrl",
                        max(n.submitted_at) as "submittedAt",
                        count(*)::int as "nominationCount",
                        count(*) filter (where n.status = 'approved')::int as "approvedCount",
                        count(*) filter (where n.status = 'pending')::int as "pendingCount",
                        count(*) filter (where n.status = 'rejected')::int as "rejectedCount"
                    from nominations n
                    join category_page cp on cp.id = n.position_id
                    where n.organization_id = $1
                      and (
                          $2 = ''
                          or cp.title ilike $3
                          or n.full_name ilike $3
                          or coalesce(n.popular_name, '') ilike $3
                      )
                    group by n.election_id, n.position_id,
                             lower(regexp_replace(trim(n.full_name), '\\s+', ' ', 'g'))
                )
                select
                    cp.id as category,
                    cp.title as "categoryTitle",
                    cp.sort_order as "categorySort",
                    gn.id,
                    gn."nominationIds",
                    gn."fullName",
                    gn."popularName",
                    gn."imageUrl",
                    gn."submittedAt",
                    gn."nominationCount",
                    gn."approvedCount",
                    gn."pendingCount",
                    gn."rejectedCount"
                from category_page cp
                left join grouped_nominees gn on gn.category = cp.id
                order by cp.sort_order, cp.title, cp.id, gn."fullName"`,
                [getOrgId(), search, searchPattern, skip, limit]
            ),
            query(
                `with matching_categories as (
                    select p.id
                    from positions p
                    where p.organization_id = $1
                      and (
                          $2 = ''
                          or p.title ilike $3
                          or exists (
                              select 1
                              from nominations n
                              where n.organization_id = p.organization_id
                                and n.position_id = p.id
                                and (n.full_name ilike $3 or coalesce(n.popular_name, '') ilike $3)
                          )
                      )
                ),
                grouped_nominees as (
                    select n.position_id,
                           count(*)::int as "nominationCount"
                    from nominations n
                    join matching_categories mc on mc.id = n.position_id
                    left join positions p on p.id = n.position_id and p.organization_id = n.organization_id
                    where n.organization_id = $1
                      and ($2 = '' or p.title ilike $3 or n.full_name ilike $3 or coalesce(n.popular_name, '') ilike $3)
                    group by n.election_id, n.position_id,
                             lower(regexp_replace(trim(n.full_name), '\\s+', ' ', 'g'))
                )
                select
                    (select count(*)::int from matching_categories) as "categoryCount",
                    count(*)::int as count,
                    coalesce(sum("nominationCount"), 0)::int as "submissionCount"
                from grouped_nominees`,
                [getOrgId(), search, searchPattern]
            ),
        ])

        const categories = []
        const categoriesById = new Map()
        for (const row of categoryRows.rows) {
            let category = categoriesById.get(row.category)
            if (!category) {
                category = {
                    id: row.category,
                    title: row.categoryTitle,
                    sortOrder: row.categorySort,
                    nominations: [],
                }
                categoriesById.set(row.category, category)
                categories.push(category)
            }
            if (row.id) {
                category.nominations.push({
                    id: row.id,
                    nominationIds: row.nominationIds,
                    fullName: row.fullName,
                    popularName: row.popularName,
                    category: row.category,
                    imageUrl: row.imageUrl,
                    submittedAt: row.submittedAt,
                    nominationCount: row.nominationCount,
                    approvedCount: row.approvedCount,
                    pendingCount: row.pendingCount,
                    rejectedCount: row.rejectedCount,
                })
            }
        }

        const count = total.rows[0]?.count || 0
        const submissionCount = total.rows[0]?.submissionCount || 0
        const categoryCount = total.rows[0]?.categoryCount || 0
        res.json({
            categories,
            nominations: categories.flatMap(category => category.nominations),
            total: count,
            submissionTotal: submissionCount,
            categoryTotal: categoryCount,
            page,
            totalPages: Math.max(1, Math.ceil(categoryCount / limit)),
        })
    } catch (error) {
        console.error('Error fetching pending nominations:', error)
        res.status(500).json({ message: 'Error fetching pending nominations.' })
    }
})

// --- Toggle election status ---
router.post('/toggle-election', async (req, res) => {
    try {
        const result = await query(
            `with current_status as (
                select coalesce(
                    (select value from settings where organization_id = $1 and key = 'electionStatus'),
                    (select status from elections where organization_id = $1 order by created_at desc limit 1),
                    'closed'
                ) as value
            ),
            updated_setting as (
                insert into settings (organization_id, key, value)
                select $1, 'electionStatus', case when value = 'open' then 'closed' else 'open' end
                from current_status
                on conflict (organization_id, key) do update
                set value = excluded.value, updated_at = now()
                returning value
            )
            update elections
            set status = (select value from updated_setting)
            where id = (
                select id from elections where organization_id = $1 order by created_at desc limit 1
            )
            returning status`,
            [getOrgId()]
        )
        const status = result.rows[0]?.status || 'closed'
        invalidateElectionCache()
        console.log(`[AUDIT] Election toggled to: ${status}`)
        res.json({ success: true, newStatus: status })
    } catch (error) {
        console.error('Error toggling election status:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

// --- Toggle portal mode ---
router.post('/toggle-portal-mode', async (req, res) => {
    try {
        const result = await query(
            `with current_mode as (
                select coalesce(
                    (select value from settings where organization_id = $1 and key = 'portalMode'),
                    'nominations'
                ) as value
            )
            insert into settings (organization_id, key, value)
            select $1, 'portalMode', case when value = 'nominations' then 'voting' else 'nominations' end
            from current_mode
            on conflict (organization_id, key) do update
            set value = excluded.value, updated_at = now()
            returning value`,
            [getOrgId()]
        )
        const mode = result.rows[0]?.value || 'nominations'
        invalidateElectionCache()
        console.log(`[AUDIT] Portal mode toggled to: ${mode}`)
        res.json({ success: true, newPortalMode: mode })
    } catch (error) {
        console.error('Error toggling portal mode:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

// --- Delete all nominations ---
router.post('/delete-nominations', async (req, res) => {
    try {
        const result = await query(
            `delete from nominations where organization_id = $1 and status = 'pending'`,
            [getOrgId()]
        )
        console.log(`[AUDIT] Deleted ${result.rowCount} pending nominations`)
        res.json({ success: true, message: `${result.rowCount} pending nominations have been deleted.` })
    } catch (error) {
        console.error('Error deleting nominations:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

// --- Approve a nomination (move to candidates, change status to approved) ---
router.post('/approve-nomination', async (req, res) => {
    const { nominationId, description } = req.body
    if (!nominationId) return res.status(400).json({ message: 'Nomination ID is required.' })

    try {
        await transaction(async (client) => {
            // 1. Get the nomination details
            const nomRes = await client.query(
                `select full_name, popular_name, position_id, image_url, election_id, status
                 from nominations
                 where organization_id = $1 and id = $2
                 for update`,
                [getOrgId(), nominationId]
            )

            if (nomRes.rows.length === 0) {
                const error = new Error('Nomination not found.')
                error.statusCode = 404
                throw error
            }

            const nom = nomRes.rows[0]
            if (nom.status !== 'pending') {
                return { processed: 0, alreadyProcessed: true }
            }

            const duplicateRes = await client.query(
                `select id, full_name, popular_name, image_url
                 from nominations
                 where organization_id = $1
                   and election_id = $2
                   and position_id = $3
                   and status = 'pending'
                   and lower(regexp_replace(trim(full_name), '\\s+', ' ', 'g')) =
                       lower(regexp_replace(trim($4), '\\s+', ' ', 'g'))
                 for update`,
                [getOrgId(), nom.election_id, nom.position_id, nom.full_name]
            )

            const preferred = duplicateRes.rows.find(row => row.image_url) || duplicateRes.rows[0]
            const candidateName = preferred.full_name.trim()
            const existingCandidate = await client.query(
                `select id
                 from candidates
                 where organization_id = $1 and election_id = $2 and position_id = $3
                   and lower(regexp_replace(regexp_replace(trim(name), '\\s*\\([^)]*\\)\\s*$', ''), '\\s+', ' ', 'g')) =
                       lower(regexp_replace(trim($4), '\\s+', ' ', 'g'))
                 order by created_at asc
                 limit 1
                 for update`,
                [getOrgId(), nom.election_id, nom.position_id, candidateName]
            )

            if (existingCandidate.rows[0]) {
                await client.query(
                    `update candidates
                     set image_url = coalesce($2, image_url),
                         description = coalesce($3, description),
                         status = 'approved'
                     where id = $1`,
                    [existingCandidate.rows[0].id, preferred.image_url || null, description || preferred.popular_name || null]
                )
            } else {
                await client.query(
                `insert into candidates (organization_id, election_id, position_id, name, description, image_url, status)
                 values ($1, $2, $3, $4, $5, $6, 'approved')
                 on conflict (election_id, position_id, lower(name)) do update
                 set image_url = coalesce(excluded.image_url, candidates.image_url),
                     description = coalesce(excluded.description, candidates.description),
                     status = 'approved'`,
                [
                    getOrgId(),
                    nom.election_id,
                    nom.position_id,
                    candidateName,
                    description || preferred.popular_name || null,
                    preferred.image_url || null
                ]
                )
            }

            const updated = await client.query(
                `update nominations
                 set status = 'approved'
                 where id = any($1::uuid[])
                 returning id`,
                [duplicateRes.rows.map(row => row.id)]
            )
            return { processed: updated.rowCount, alreadyProcessed: false }
        })

        res.json({ success: true, message: 'Nominee approved successfully.' })
    } catch (error) {
        console.error('Error approving nomination:', error)
        res.status(error.statusCode || 500).json({ message: error.message || 'Error processing approval.' })
    }
})

// --- Reject a nomination (keep it there, just change status to rejected) ---
router.post('/reject-nomination', async (req, res) => {
    const { nominationId } = req.body
    if (!nominationId) return res.status(400).json({ message: 'Nomination ID is required.' })

    try {
        const result = await transaction(async client => {
            const nomination = await client.query(
                `select election_id, position_id, full_name, status
                 from nominations
                 where organization_id = $1 and id = $2
                 for update`,
                [getOrgId(), nominationId]
            )
            if (!nomination.rows[0]) return null
            if (nomination.rows[0].status !== 'pending') return { processed: 0 }
            const nom = nomination.rows[0]
            const updated = await client.query(
                `update nominations
                 set status = 'rejected'
                 where organization_id = $1
                   and election_id = $2
                   and position_id = $3
                   and status = 'pending'
                   and lower(regexp_replace(trim(full_name), '\\s+', ' ', 'g')) =
                       lower(regexp_replace(trim($4), '\\s+', ' ', 'g'))
                 returning id`,
                [getOrgId(), nom.election_id, nom.position_id, nom.full_name]
            )
            return { processed: updated.rowCount }
        })
        if (!result) return res.status(404).json({ message: 'Nomination not found.' })
        res.json({ success: true, processed: result.processed, message: 'Nominee rejected.' })
    } catch (error) {
        console.error('Error rejecting nomination:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

// --- Reset election (delete all votes) ---
router.post('/reset-election', async (req, res) => {
    try {
        const result = await transaction(async client => {
            const deleted = await client.query(
                `delete from votes where organization_id = $1`,
                [getOrgId()]
            )
            return deleted
        })
        invalidateElectionCache()
        console.log(`[AUDIT] Election reset. Deleted ${result.rowCount} vote records.`)
        res.json({ success: true, message: `Election reset. Deleted ${result.rowCount} vote records.` })
    } catch (error) {
        console.error('Error resetting election:', error)
        res.status(500).json({ message: 'A server error occurred while resetting the election.' })
    }
})

// --- Export unique nominees, grouped per award category ---
router.post('/export-nominations', async (req, res) => {
    try {
        const rows = await query(
            `with grouped_nominees as (
                select
                    (array_agg(n.id order by n.submitted_at desc))[1] as id,
                    (array_agg(n.full_name order by n.submitted_at desc))[1] as "fullName",
                    max(n.popular_name) as "popularName",
                    n.position_id as category,
                    max(n.image_url) as "imageUrl",
                    count(*)::int as "nominationCount",
                    count(*) filter (where n.status = 'approved')::int as "approvedCount",
                    count(*) filter (where n.status = 'pending')::int as "pendingCount",
                    count(*) filter (where n.status = 'rejected')::int as "rejectedCount",
                    min(n.submitted_at) as "firstSubmittedAt",
                    max(n.submitted_at) as "lastSubmittedAt"
                from nominations n
                where n.organization_id = $1
                group by n.election_id, n.position_id,
                         lower(regexp_replace(trim(n.full_name), '\\s+', ' ', 'g'))
            )
            select
                p.id as category,
                p.title as "categoryTitle",
                p.sort_order as "categorySort",
                gn.id,
                gn."fullName",
                gn."popularName",
                gn."imageUrl",
                gn."nominationCount",
                gn."approvedCount",
                gn."pendingCount",
                gn."rejectedCount",
                gn."firstSubmittedAt",
                gn."lastSubmittedAt"
            from positions p
            left join grouped_nominees gn on gn.category = p.id
            where p.organization_id = $1
            order by p.sort_order, p.title, p.id, gn."fullName"`,
            [getOrgId()]
        )

        const categories = []
        const categoriesById = new Map()
        for (const row of rows.rows) {
            let category = categoriesById.get(row.category)
            if (!category) {
                category = {
                    id: row.category,
                    title: row.categoryTitle,
                    sortOrder: row.categorySort,
                    nominations: [],
                }
                categoriesById.set(row.category, category)
                categories.push(category)
            }
            if (row.id) category.nominations.push(row)
        }

        const nominations = categories.flatMap(category => category.nominations)
        const submissionTotal = nominations.reduce((sum, row) => sum + row.nominationCount, 0)
        res.json({
            categories,
            nominations,
            categoryTotal: categories.length,
            total: nominations.length,
            submissionTotal,
        })
    } catch (error) {
        console.error('Error exporting nominations:', error)
        res.status(500).json({ message: 'A server error occurred during export.' })
    }
})

router.get('/setup', async (req, res) => {
    try {
        const orgId = getOrgId()
        const [electionRes, departmentsRes, positionsRes, candidatesRes] = await Promise.all([
            query(
                `select id, title, year, status
                 from elections
                 where organization_id = $1
                 order by created_at desc
                 limit 1`,
                [orgId]
            ),
            query(
                `select id, title, sort_order as "sortOrder"
                 from departments
                 where organization_id = $1
                 order by sort_order, title`,
                [orgId]
            ),
            query(
                `select id, title, group_key as "groupKey", department_id as "departmentId", sort_order as "sortOrder"
                 from positions
                 where organization_id = $1
                 order by sort_order, title`,
                [orgId]
            ),
            query(
                `select id, position_id as "positionId", name, description, image_url as "imageUrl", status
                 from candidates
                 where organization_id = $1
                 order by name`,
                [orgId]
            ),
        ])

        res.json({
            election: electionRes.rows[0] || null,
            departments: departmentsRes.rows,
            positions: positionsRes.rows,
            candidates: candidatesRes.rows,
        })
    } catch (error) {
        console.error('Error fetching setup data:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

router.put('/election', async (req, res) => {
    const { title, year, status } = req.body
    if (!title || !year || !['open', 'closed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid election data.' })
    }

    try {
        const result = await query(
            `update elections
             set title = $2, year = $3, status = $4
             where id = (
                select id from elections where organization_id = $1 order by created_at desc limit 1
             )
             returning id, title, year, status`,
            [getOrgId(), title.trim(), String(year).trim(), status]
        )
        await query(
            `insert into settings (organization_id, key, value)
             values ($1, 'electionStatus', $2)
             on conflict (organization_id, key) do update
             set value = excluded.value, updated_at = now()`,
            [getOrgId(), status]
        )
        invalidateElectionCache()
        res.json(result.rows[0])
    } catch (error) {
        console.error('Error updating election:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

router.post('/departments', async (req, res) => {
    const { id, title, sortOrder } = req.body
    if (!id || !title) return res.status(400).json({ message: 'Department ID and title are required.' })

    try {
        const result = await query(
            `insert into departments (id, organization_id, title, sort_order)
             values ($1, $2, $3, $4)
             on conflict (id) do update
             set title = excluded.title, sort_order = excluded.sort_order
             returning id, title, sort_order as "sortOrder"`,
            [id.trim(), getOrgId(), title.trim(), Number(sortOrder) || 0]
        )
        res.status(201).json(result.rows[0])
    } catch (error) {
        console.error('Error saving department:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

router.delete('/departments/:id', async (req, res) => {
    try {
        const result = await query(
            `delete from departments where organization_id = $1 and id = $2`,
            [getOrgId(), req.params.id]
        )
        res.json({ success: true, deleted: result.rowCount })
    } catch (error) {
        console.error('Error deleting department:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

router.post('/positions', async (req, res) => {
    const { id, title, groupKey, departmentId, sortOrder } = req.body
    const validGroupKey = typeof groupKey === 'string' && /^[a-z0-9-]{1,40}$/.test(groupKey)
    if (!id || !title || !validGroupKey) {
        return res.status(400).json({ message: 'Invalid position data.' })
    }

    try {
        const election = await query(
            `select id from elections where organization_id = $1 order by created_at desc limit 1`,
            [getOrgId()]
        )
        const electionId = election.rows[0]?.id
        if (!electionId) return res.status(400).json({ message: 'Create an election before adding positions.' })

        const result = await query(
            `insert into positions (id, organization_id, election_id, title, group_key, department_id, sort_order)
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (id) do update
             set title = excluded.title,
                 group_key = excluded.group_key,
                 department_id = excluded.department_id,
                 sort_order = excluded.sort_order
             returning id, title, group_key as "groupKey", department_id as "departmentId", sort_order as "sortOrder"`,
            [id.trim(), getOrgId(), electionId, title.trim(), groupKey, departmentId || null, Number(sortOrder) || 0]
        )
        res.status(201).json(result.rows[0])
    } catch (error) {
        console.error('Error saving position:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

router.delete('/positions/:id', async (req, res) => {
    try {
        const result = await query(
            `delete from positions where organization_id = $1 and id = $2`,
            [getOrgId(), req.params.id]
        )
        res.json({ success: true, deleted: result.rowCount })
    } catch (error) {
        console.error('Error deleting position:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

router.post('/candidates', async (req, res) => {
    const { positionId, name, description, imageUrl, status } = req.body
    if (!positionId || !name) return res.status(400).json({ message: 'Position and candidate name are required.' })

    try {
        const election = await query(
            `select id from elections where organization_id = $1 order by created_at desc limit 1`,
            [getOrgId()]
        )
        const electionId = election.rows[0]?.id
        if (!electionId) return res.status(400).json({ message: 'Create an election before adding candidates.' })

        const result = await query(
            `insert into candidates (organization_id, election_id, position_id, name, description, image_url, status)
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (election_id, position_id, lower(name)) do update
             set description = excluded.description,
                 image_url = excluded.image_url,
                 status = excluded.status
             returning id, position_id as "positionId", name, description, image_url as "imageUrl", status`,
            [
                getOrgId(),
                electionId,
                positionId,
                name.trim(),
                description || null,
                imageUrl || null,
                status || 'approved',
            ]
        )
        res.status(201).json(result.rows[0])
    } catch (error) {
        console.error('Error saving candidate:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

router.delete('/candidates/:id', async (req, res) => {
    try {
        const result = await query(
            `update candidates
             set status = 'rejected'
             where organization_id = $1 and id = $2
             returning id`,
            [getOrgId(), req.params.id]
        )
        res.json({ success: true, rejected: result.rowCount })
    } catch (error) {
        console.error('Error removing candidate:', error)
        res.status(500).json({ message: 'Server error.' })
    }
})

module.exports = router
