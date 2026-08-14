require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { transaction, pool } = require('../db')

function normalizeSurname(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
}

function buildNameKeys(fullName, surname) {
    const normalized = `${fullName} ${surname}`
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    const tokens = normalized.match(/[a-z0-9]+/g) || []
    const fullNameKey = normalizeSurname(fullName)
    return [...new Set([...tokens, fullNameKey].filter(key => key.length >= 2))]
}

function validateRecord(record, index) {
    const matricNumber = String(record.matricNumber || '').trim()
    const surname = String(record.surname || '').trim()
    const fullName = String(record.fullName || '').trim()
    const surnameKey = normalizeSurname(surname)

    if (!/^\d{9}$/.test(matricNumber)) {
        throw new Error(`Record ${index + 1} has an invalid nine-digit matric number.`)
    }
    if (!surnameKey || !fullName) {
        throw new Error(`Record ${index + 1} is missing a surname or full name.`)
    }

    return {
        matricNumber,
        surname,
        surnameKey,
        fullName,
        nameKeys: buildNameKeys(fullName, surname),
        level: record.level ? String(record.level) : null,
        sourceLabel: record.sourceLabel ? String(record.sourceLabel) : null,
    }
}

async function main() {
    const inputPath = process.argv[2]
    if (!inputPath) throw new Error('Usage: npm run import:voters -- /absolute/path/to/voters.json')

    const records = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
    if (!Array.isArray(records) || records.length === 0) throw new Error('The voter file must contain a non-empty JSON array.')

    const normalized = records.map(validateRecord)
    const matricNumbers = new Set(normalized.map(record => record.matricNumber))
    if (matricNumbers.size !== normalized.length) throw new Error('The voter file contains duplicate matric numbers.')

    const orgId = process.env.ORG_ID
    if (!orgId) throw new Error('ORG_ID is required.')

    const imported = await transaction(async client => {
        const electionResult = await client.query(
            `select id from elections where organization_id = $1 order by created_at desc limit 1`,
            [orgId]
        )
        const electionId = electionResult.rows[0]?.id
        if (!electionId) throw new Error('No election is configured for this organization.')

        const result = await client.query(
            `insert into eligible_voters (
                organization_id, election_id, matric_number, surname, surname_key,
                full_name, name_keys, level, source_label, is_active, updated_at
             )
             select $1, $2, record.matric_number, record.surname, record.surname_key,
                    record.full_name, record.name_keys, record.level, record.source_label, true, now()
             from jsonb_to_recordset($3::jsonb) as record(
                matric_number text,
                surname text,
                surname_key text,
                full_name text,
                name_keys text[],
                level text,
                source_label text
             )
             on conflict (election_id, matric_number) do update set
                surname = excluded.surname,
                surname_key = excluded.surname_key,
                full_name = excluded.full_name,
                name_keys = excluded.name_keys,
                level = excluded.level,
                source_label = excluded.source_label,
                is_active = true,
                updated_at = now()
             returning id`,
            [
                orgId,
                electionId,
                JSON.stringify(normalized.map(record => ({
                    matric_number: record.matricNumber,
                    surname: record.surname,
                    surname_key: record.surnameKey,
                    full_name: record.fullName,
                    name_keys: record.nameKeys,
                    level: record.level,
                    source_label: record.sourceLabel,
                }))),
            ]
        )
        return result.rowCount
    })

    console.log(`Imported ${imported} eligible voters.`)
}

main()
    .catch(error => {
        console.error(error.message)
        process.exitCode = 1
    })
    .finally(() => pool.end())
