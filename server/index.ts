import { randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { z } from 'zod'
import { MPL_CORE_PROGRAM_ADDRESS } from '@obrera/mpl-core-kit-lib'
import { getBase58Encoder, signatureBytes, verifySignature } from '@solana/kit'

type Session = { id: number; walletAddress: string; role: 'operator' | 'volunteer'; handle: string }
type RelayRow = { id: number; code: string; title: string; zone: string; pickup: string; dropoff: string; urgency: number; requestedBy: string; status: string; neededBy: string; details: string; volunteerId: number | null; claimedBy: string | null; createdAt: string; updatedAt: string }
type VolunteerRow = { id: number; walletAddress: string; handle: string; zone: string; capacity: number; transport: string; availableUntil: string; status: string }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientRoot = path.resolve(__dirname, '..', 'client')
const dbPath = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'relaynest.db')
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000'
const solanaRpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const operatorWallet = 'BpCGZxZmKcJuCL6b6nU2MHmwgiwc818E8syJVAbxivz8'
const fieldWallet = '9uozm5nKTGe9pqRtCKRud3GUoCzTcQpcHZoZrfvyNk2L'
const sessionCookie = 'relaynest_session'

fs.mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

function nowIso() { return new Date().toISOString() }
function minutesFromNow(minutes: number) { return new Date(Date.now() + minutes * 60_000).toISOString() }
function snakeToCamelRelay(row: Record<string, unknown>) {
  return { id: row.id, code: row.code, title: row.title, zone: row.zone, pickup: row.pickup, dropoff: row.dropoff, urgency: row.urgency, requestedBy: row.requested_by, status: row.status, neededBy: row.needed_by, details: row.details, volunteerId: row.volunteer_id, claimedBy: row.claimed_by, createdAt: row.created_at, updatedAt: row.updated_at } as RelayRow
}
function snakeToCamelVolunteer(row: Record<string, unknown>) {
  return { id: row.id, walletAddress: row.wallet_address, handle: row.handle, zone: row.zone, capacity: row.capacity, transport: row.transport, availableUntil: row.available_until, status: row.status } as VolunteerRow
}
function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT UNIQUE NOT NULL, handle TEXT NOT NULL, role TEXT NOT NULL, last_seen_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS auth_nonces (nonce TEXT PRIMARY KEY, wallet_address TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
    CREATE TABLE IF NOT EXISTS relays (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, zone TEXT NOT NULL, pickup TEXT NOT NULL, dropoff TEXT NOT NULL, urgency INTEGER NOT NULL, requested_by TEXT NOT NULL, status TEXT NOT NULL, needed_by TEXT NOT NULL, details TEXT NOT NULL, volunteer_id INTEGER, claimed_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS volunteers (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT NOT NULL, handle TEXT NOT NULL, zone TEXT NOT NULL, capacity INTEGER NOT NULL, transport TEXT NOT NULL, available_until TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_wallet TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
  `)
}
function audit(actorWallet: string, action: string, target: string, note: string) {
  db.prepare('INSERT INTO audit_log (actor_wallet, action, target, note, created_at) VALUES (?, ?, ?, ?, ?)').run(actorWallet, action, target, note, nowIso())
}
function seed() {
  const count = db.prepare('SELECT COUNT(*) as count FROM relays').get() as { count: number }
  if (count.count > 0) { return }
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (wallet_address, handle, role, last_seen_at) VALUES (?, ?, ?, ?)')
  insertUser.run(operatorWallet, 'obrera dispatch', 'operator', nowIso())
  insertUser.run(fieldWallet, 'field nest', 'volunteer', nowIso())
  const insertVolunteer = db.prepare('INSERT INTO volunteers (wallet_address, handle, zone, capacity, transport, available_until, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
  insertVolunteer.run(fieldWallet, 'Field Nest', 'north loop', 3, 'cargo bike', minutesFromNow(95), 'available')
  insertVolunteer.run('7MBxRelay111111111111111111111111111111111', 'Signal Auntie', 'river east', 2, 'walk + tram', minutesFromNow(45), 'available')
  insertVolunteer.run('5RelayScout2222222222222222222222222222222', 'Block Scout', 'market spine', 1, 'scooter', minutesFromNow(20), 'busy')
  insertVolunteer.run('8RelaySpare3333333333333333333333333333333', 'Spare Hands', 'north loop', 4, 'van', minutesFromNow(160), 'available')
  const insertRelay = db.prepare('INSERT INTO relays (code, title, zone, pickup, dropoff, urgency, requested_by, status, needed_by, details, volunteer_id, claimed_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const base = nowIso()
  insertRelay.run('RN-7601', 'Cooler battery handoff', 'north loop', 'Maker shed', 'Community fridge', 5, 'Fridge crew', 'open', minutesFromNow(36), 'Battery pack must arrive before evening meal prep.', null, null, base, base)
  insertRelay.run('RN-7602', 'Seedling tray relay', 'river east', 'Greenhouse dock', 'School garden gate', 3, 'Garden club', 'matched', minutesFromNow(80), 'Keep trays upright; volunteer should confirm shade bag.', 2, null, base, base)
  insertRelay.run('RN-7603', 'Radio charger swap', 'market spine', 'Repair cafe', 'Night market tent', 4, 'Radio desk', 'claimed', minutesFromNow(22), 'Swap depleted kit for charged kit and photograph serial.', 3, '5RelayScout2222222222222222222222222222222', base, base)
  insertRelay.run('RN-7604', 'Library crate return', 'north loop', 'Pop-up library', 'Main branch slot', 1, 'Book table', 'completed', minutesFromNow(-18), 'Crate logged and returned.', 4, '8RelaySpare3333333333333333333333333333333', base, base)
  insertRelay.run('RN-7605', 'Insulin cooler reroute', 'river east', 'Clinic side door', 'Shelter desk', 5, 'Clinic volunteer', 'escalated', minutesFromNow(-12), 'Temperature-sensitive. Original runner missed window.', null, null, base, base)
  audit(operatorWallet, 'seed', 'relay board', 'Seeded RelayNest dispatch lanes and volunteers')
}
migrate(); seed()

const app = new Hono()
const relaySchema = z.object({ title: z.string().min(3).max(80), zone: z.string().min(2).max(40), pickup: z.string().min(2).max(80), dropoff: z.string().min(2).max(80), urgency: z.number().int().min(1).max(5), requestedBy: z.string().min(2).max(60), neededByMinutes: z.number().int().min(10).max(360), details: z.string().min(5).max(500) })
const volunteerSchema = z.object({ handle: z.string().min(2).max(60), zone: z.string().min(2).max(40), capacity: z.number().int().min(1).max(8), transport: z.string().min(2).max(60), availableMinutes: z.number().int().min(15).max(360) })
const verifySchema = z.object({
  accountAddress: z.string().min(32),
  input: z.object({
    domain: z.string().min(1),
    requestId: z.string().min(1),
    statement: z.string().min(1),
    uri: z.string().url(),
  }),
  method: z.string().min(1),
  signature: z.array(z.number().int().min(0).max(255)).length(64),
  signedMessage: z.array(z.number().int().min(0).max(255)).min(1),
})

function buildNonce() { return randomBytes(18).toString('hex') }
function parseSiwsMessage(bytes: Uint8Array) { return new TextDecoder().decode(bytes) }
async function verifyWalletSignature(walletAddress: string, signatureData: Uint8Array, message: Uint8Array) {
  const publicKeyBytes = getBase58Encoder().encode(walletAddress)
  const publicKey = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'Ed25519' }, true, ['verify'])
  return verifySignature(publicKey, signatureBytes(signatureData), message)
}
function getSessionRow(token?: string): Session | null {
  if (!token) { return null }
  const row = db.prepare('SELECT users.id, users.wallet_address as walletAddress, users.role, users.handle FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > ?').get(token, nowIso()) as Session | undefined
  return row ?? null
}
function requireSession(c: Context) { const session = getSessionRow(getCookie(c, sessionCookie)); if (!session) { throw new Error('wallet sign-in required') } return session }
function requireOperator(c: Context) { const session = requireSession(c); if (session.role !== 'operator') { throw new Error('operator wallet required') } return session }
function sessionPayload(c: Context) { const session = getSessionRow(getCookie(c, sessionCookie)); return session ? { walletAddress: session.walletAddress, role: session.role, handle: session.handle } : null }
function setSessionForWallet(c: Context, walletAddress: string) {
  const role = walletAddress === operatorWallet ? 'operator' : 'volunteer'
  const handle = role === 'operator' ? 'obrera dispatch' : `volunteer ${walletAddress.slice(0, 4)}`
  db.prepare('INSERT INTO users (wallet_address, handle, role, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(wallet_address) DO UPDATE SET last_seen_at = excluded.last_seen_at, role = excluded.role').run(walletAddress, handle, role, nowIso())
  const user = db.prepare('SELECT id FROM users WHERE wallet_address = ?').get(walletAddress) as { id: number }
  const token = randomBytes(24).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(token, user.id, minutesFromNow(60 * 24 * 7), nowIso())
  setCookie(c, sessionCookie, token, { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 7 })
  audit(walletAddress, 'sign_in', 'session', 'Wallet completed verified SIWS sign-in')
}
function relays() { return (db.prepare('SELECT * FROM relays ORDER BY urgency DESC, needed_by ASC').all() as Record<string, unknown>[]).map(snakeToCamelRelay) }
function volunteers() { return (db.prepare('SELECT * FROM volunteers ORDER BY status ASC, available_until ASC').all() as Record<string, unknown>[]).map(snakeToCamelVolunteer) }
function score(relay: RelayRow, volunteer: VolunteerRow) { let value = 20; if (relay.zone.toLowerCase() === volunteer.zone.toLowerCase()) { value += 38 } if (volunteer.status === 'available') { value += 20 } value += Math.min(16, volunteer.capacity * 4); value += Math.max(0, 12 - Math.floor((new Date(relay.neededBy).getTime() - Date.now()) / 600_000)); return Math.max(0, Math.min(99, value)) }

app.onError((error, c) => c.json({ error: error.message }, 400))
const runtimePayload = () => ({
  ready: true,
  build: '076',
  publicBaseUrl,
  solanaRpcUrl,
  mplCoreProgramAddress: MPL_CORE_PROGRAM_ADDRESS,
  mplCorePackageRequired: true,
  minting: {
    enabled: false,
    disclosure: 'Dispatch state is off-chain; no MPL Core mint/claim flow in this build.',
  },
})
app.get('/health', (c) => c.json({ ok: true, service: 'relaynest', build: '076', checkedAt: nowIso() }))
app.get('/ready', (c) => c.json({ ok: true, runtime: runtimePayload() }))
app.get('/api/health', (c) => c.json({ ok: true, service: 'relaynest', build: '076', checkedAt: nowIso() }))
app.get('/api/bootstrap', (c) => c.json({ ok: true, session: sessionPayload(c), runtime: runtimePayload() }))
app.post('/api/auth/nonce', async (c) => {
  const { walletAddress } = z.object({ walletAddress: z.string().min(20) }).parse(await c.req.json().catch(() => ({})))
  const nonce = buildNonce()
  db.prepare('INSERT INTO auth_nonces (nonce, wallet_address, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)').run(nonce, walletAddress, nowIso(), minutesFromNow(10))
  return c.json({ domain: new URL(publicBaseUrl).host, nonce, statement: 'Sign in to RelayNest and bind this wallet to the dispatch relay board.', uri: publicBaseUrl })
})
app.post('/api/auth/verify', async (c) => {
  const body = verifySchema.parse(await c.req.json())
  if (body.method !== 'solana:signIn') {
    return c.json({ error: 'Wallet must use SIWS native sign-in' }, 400)
  }
  const nonceRow = db.prepare('SELECT nonce, wallet_address, expires_at, used_at FROM auth_nonces WHERE nonce = ?').get(body.input.requestId) as { nonce: string; wallet_address: string | null; expires_at: string; used_at: string | null } | undefined
  if (!nonceRow || nonceRow.used_at || nonceRow.expires_at <= nowIso()) {
    return c.json({ error: 'Nonce is invalid or expired' }, 400)
  }
  if (nonceRow.wallet_address && nonceRow.wallet_address !== body.accountAddress) {
    return c.json({ error: 'Wallet address mismatch for nonce' }, 400)
  }
  const signedMessage = Uint8Array.from(body.signedMessage)
  const signature = Uint8Array.from(body.signature)
  const verified = await verifyWalletSignature(body.accountAddress, signature, signedMessage)
  if (!verified) {
    return c.json({ error: 'Signature verification failed' }, 400)
  }
  const messageText = parseSiwsMessage(signedMessage)
  const expectedDomain = new URL(publicBaseUrl).host
  const messageChecks = [
    messageText.includes(expectedDomain),
    messageText.includes(body.input.requestId),
    messageText.includes(body.accountAddress),
    messageText.includes(body.input.statement),
  ]
  if (messageChecks.includes(false)) {
    return c.json({ error: 'SIWS message content failed validation' }, 400)
  }
  db.prepare('UPDATE auth_nonces SET used_at = ? WHERE nonce = ?').run(nowIso(), body.input.requestId)
  setSessionForWallet(c, body.accountAddress)
  return c.json({ ok: true, session: sessionPayload(c) })
})
app.get('/api/session', (c) => c.json({ session: sessionPayload(c) }))
app.post('/api/auth/logout', (c) => { deleteCookie(c, sessionCookie, { path: '/' }); return c.json({ ok: true }) })
app.get('/api/relays', (c) => c.json({ relays: relays(), volunteers: volunteers() }))
app.post('/api/relays', async (c) => { const session = requireSession(c); const input = relaySchema.parse(await c.req.json()); const code = `RN-${7600 + Math.floor(Math.random() * 300)}`; db.prepare("INSERT INTO relays (code, title, zone, pickup, dropoff, urgency, requested_by, status, needed_by, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)").run(code, input.title, input.zone, input.pickup, input.dropoff, input.urgency, input.requestedBy, minutesFromNow(input.neededByMinutes), input.details, nowIso(), nowIso()); audit(session.walletAddress, 'create_relay', code, input.title); return c.json({ ok: true, relays: relays() }) })
app.post('/api/volunteers', async (c) => { const session = requireSession(c); const input = volunteerSchema.parse(await c.req.json()); db.prepare('INSERT INTO volunteers (wallet_address, handle, zone, capacity, transport, available_until, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(session.walletAddress, input.handle, input.zone, input.capacity, input.transport, minutesFromNow(input.availableMinutes), 'available'); audit(session.walletAddress, 'publish_window', input.handle, `${input.zone} / ${input.transport}`); return c.json({ ok: true, volunteers: volunteers() }) })
app.get('/api/suggestions', (c) => { const rows = relays().filter((relay) => ['open', 'matched', 'escalated'].includes(relay.status)); const available = volunteers(); return c.json({ suggestions: rows.map((relay) => ({ relayCode: relay.code, candidates: available.map((volunteer) => ({ ...volunteer, score: score(relay, volunteer) })).sort((a, b) => b.score - a.score).slice(0, 3) })) }) })
app.post('/api/relays/:id/claim', (c) => { const session = requireSession(c); const id = Number(c.req.param('id')); db.prepare('UPDATE relays SET status = ?, claimed_by = ?, updated_at = ? WHERE id = ?').run('claimed', session.walletAddress, nowIso(), id); audit(session.walletAddress, 'claim', `relay:${id}`, 'Volunteer claimed relay window'); return c.json({ ok: true, relays: relays() }) })
app.post('/api/relays/:id/complete', (c) => { const session = requireSession(c); const id = Number(c.req.param('id')); db.prepare('UPDATE relays SET status = ?, updated_at = ? WHERE id = ?').run('completed', nowIso(), id); audit(session.walletAddress, 'complete', `relay:${id}`, 'Relay completed at handoff point'); return c.json({ ok: true, relays: relays() }) })
app.post('/api/operator/match', async (c) => { const session = requireOperator(c); const body = z.object({ relayId: z.number(), volunteerId: z.number() }).parse(await c.req.json()); db.prepare('UPDATE relays SET status = ?, volunteer_id = ?, claimed_by = NULL, updated_at = ? WHERE id = ?').run('matched', body.volunteerId, nowIso(), body.relayId); audit(session.walletAddress, 'match', `relay:${body.relayId}`, `Assigned volunteer ${body.volunteerId}`); return c.json({ ok: true, relays: relays() }) })
app.post('/api/operator/sweep', (c) => { const session = requireOperator(c); const result = db.prepare("UPDATE relays SET status = 'escalated', updated_at = ? WHERE status IN ('open', 'matched', 'claimed') AND needed_by < ?").run(nowIso(), nowIso()); audit(session.walletAddress, 'sweep', 'overdue relays', `Escalated ${result.changes} overdue relay(s)`); return c.json({ ok: true, escalated: result.changes, relays: relays() }) })
app.get('/api/audit', (c) => { requireSession(c); return c.json({ audit: db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 40').all() }) })
app.use('/*', serveStatic({ root: clientRoot }))
app.get('*', serveStatic({ path: path.join(clientRoot, 'index.html') }))
const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => console.log(`RelayNest listening on ${port}`))
