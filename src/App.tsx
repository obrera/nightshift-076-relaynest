import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { WalletUiAuth, WalletUiIcon, type UiWallet, type WalletUiAuthState, useWalletUi, useWalletUiWallet } from '@wallet-ui/react'

type Session = { walletAddress: string; role: 'operator' | 'volunteer'; handle: string }
type Bootstrap = { ok: boolean; session: Session | null; runtime: { ready: boolean; build: string; publicBaseUrl: string; solanaRpcUrl: string; mplCoreProgramAddress: string; mplCorePackageRequired: boolean; minting: { enabled: boolean; disclosure: string } } }
type Relay = { id: number; code: string; title: string; zone: string; pickup: string; dropoff: string; urgency: number; requestedBy: string; status: string; neededBy: string; details: string; volunteerId: number | null; claimedBy: string | null; createdAt: string; updatedAt: string }
type Volunteer = { id: number; walletAddress: string; handle: string; zone: string; capacity: number; transport: string; availableUntil: string; status: string }
type Suggestion = { relayCode: string; candidates: Array<Volunteer & { score: number }> }
type Audit = { id: number; actor_wallet: string; action: string; target: string; note: string; created_at: string }

const lanes = ['open', 'matched', 'claimed', 'completed', 'escalated']

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) { throw new Error(data.error ?? 'request failed') }
  return data
}
function short(value?: string | null) { return value ? `${value.slice(0, 4)}…${value.slice(-4)}` : 'unassigned' }
function minutesUntil(value: string) { return Math.round((new Date(value).getTime() - Date.now()) / 60000) }

function SafeWalletPicker() {
  const walletUi = useWalletUi()
  const [open, setOpen] = useState(false)

  if (walletUi.connected) {
    return (
      <div className="wallet-picker">
        <button onClick={() => walletUi.copy()}>{short(walletUi.account?.address)}</button>
        <button onClick={() => walletUi.disconnect()}>Disconnect</button>
      </div>
    )
  }

  return (
    <div className="wallet-picker">
      <button onClick={() => setOpen((value) => !value)}>Select Wallet</button>
      {open ? (
        <div className="wallet-menu">
          {walletUi.wallets.length ? walletUi.wallets.map((availableWallet) => (
            <WalletPickerItemBoundary key={availableWallet.name} wallet={availableWallet} onConnected={() => setOpen(false)} />
          )) : (
            <button onClick={() => window.open('https://solana.com/solana-wallets', '_blank')}>Install a Solana wallet</button>
          )}
        </div>
      ) : null}
    </div>
  )
}

class WalletPickerItemBoundary extends Component<{ onConnected: () => void; wallet: UiWallet }, { unavailable: boolean }> {
  state = { unavailable: false }

  componentDidCatch(error: unknown) {
    console.warn('wallet connect unavailable', error)
    this.setState({ unavailable: true })
  }

  render() {
    if (this.state.unavailable) {
      return (
        <button disabled>
          <WalletUiIcon wallet={this.props.wallet} />
          <span>{this.props.wallet.name} unavailable</span>
        </button>
      )
    }

    return <WalletPickerItem onConnected={this.props.onConnected} wallet={this.props.wallet} />
  }
}

function WalletPickerItem({ onConnected, wallet }: { onConnected: () => void; wallet: UiWallet }) {
  const { connect, isConnecting } = useWalletUiWallet({ wallet })
  return (
    <button
      disabled={isConnecting}
      onClick={async () => {
        try {
          await connect()
          onConnected()
        } catch (error) {
          console.warn('wallet connect failed', error)
        }
      }}
    >
      <WalletUiIcon wallet={wallet} />
      <span>{isConnecting ? 'Connecting...' : wallet.name}</span>
    </button>
  )
}

function App() {
  const walletUi = useWalletUi()
  const wallet = walletUi.wallet
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null)
  const [relays, setRelays] = useState<Relay[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [status, setStatus] = useState('warming radio mesh')
  const [relayForm, setRelayForm] = useState({ title: 'Water tote shuttle', zone: 'north loop', pickup: 'Depot bay C', dropoff: 'Block party table', urgency: 4, requestedBy: 'Hydration crew', neededByMinutes: 55, details: 'Two sealed totes and cup sleeves. Needs cargo capacity.' })
  const [volunteerForm, setVolunteerForm] = useState({ handle: 'Pocket Runner', zone: 'north loop', capacity: 2, transport: 'bike basket', availableMinutes: 90 })

  const session = bootstrap?.session ?? null
  const isOperator = session?.role === 'operator'
  const board = useMemo(() => lanes.map((lane) => ({ lane, relays: relays.filter((relay) => relay.status === lane) })), [relays])
  const nextMatches = useMemo(() => new Map(suggestions.map((suggestion) => [suggestion.relayCode, suggestion.candidates[0]])), [suggestions])

  const refresh = useCallback(async () => {
    const [boot, relayData, suggestionData] = await Promise.all([
      api<Bootstrap>('/api/bootstrap'),
      api<{ relays: Relay[]; volunteers: Volunteer[] }>('/api/relays'),
      api<{ suggestions: Suggestion[] }>('/api/suggestions'),
    ])
    setBootstrap(boot)
    setRelays(relayData.relays)
    setVolunteers(relayData.volunteers)
    setSuggestions(suggestionData.suggestions)
    if (boot.session) {
      const auditData = await api<{ audit: Audit[] }>('/api/audit').catch(() => ({ audit: [] }))
      setAudit(auditData.audit)
    }
    setStatus('signal locked')
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function handleSignIn(auth: WalletUiAuthState) {
    if (!walletUi.connected || !walletUi.account || !auth.canSignIn) {
      setStatus('connect a SIWS-capable wallet first')
      return
    }

    const nonce = await api<{ domain: string; statement: string; nonce: string; uri: string }>('/api/auth/nonce', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: walletUi.account.address }),
    })
    setStatus('requesting wallet signature')
    const result = await auth.signIn({
      input: {
        domain: nonce.domain,
        requestId: nonce.nonce,
        statement: nonce.statement,
        uri: nonce.uri,
      },
    })
    await api('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({
        accountAddress: result.account.address,
        input: result.input,
        method: result.method,
        signature: Array.from(result.signature),
        signedMessage: Array.from(result.signedMessage),
      }),
    })
    setStatus(`signed in with ${short(result.account.address)}`)
    await refresh()
  }
  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    await refresh()
    setStatus('signed out')
  }
  async function createRelay() {
    await api('/api/relays', { method: 'POST', body: JSON.stringify(relayForm) })
    setStatus('new relay packet entered the board')
    await refresh()
  }
  async function publishWindow() {
    await api('/api/volunteers', { method: 'POST', body: JSON.stringify(volunteerForm) })
    setStatus('availability window broadcast')
    await refresh()
  }
  async function claim(relay: Relay) { await api(`/api/relays/${relay.id}/claim`, { method: 'POST' }); await refresh() }
  async function complete(relay: Relay) { await api(`/api/relays/${relay.id}/complete`, { method: 'POST' }); await refresh() }
  async function match(relay: Relay, volunteerId: number) { await api('/api/operator/match', { method: 'POST', body: JSON.stringify({ relayId: relay.id, volunteerId }) }); await refresh() }
  async function sweep() { const result = await api<{ escalated: number }>('/api/operator/sweep', { method: 'POST' }); setStatus(`operator sweep escalated ${result.escalated} overdue relay(s)`); await refresh() }

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Nightshift 076 · Signal Noir</p>
          <h1>RelayNest</h1>
          <p className="lede">A wallet-first dispatch relay for neighborhood handoffs: intake a need, match a live runner, claim the route, and sweep overdue windows before they break.</p>
        </div>
        <div className="status-tower">
          <span className="beacon" />
          <strong>{status}</strong>
          <small>{bootstrap?.runtime.minting.disclosure ?? 'runtime loading'}</small>
        </div>
      </section>

      <section className="auth-strip">
        <div>
          <span>Wallet connect / SIWS</span>
          <strong>{session ? `${session.handle} · ${short(session.walletAddress)}` : 'not signed in'}</strong>
        </div>
        <SafeWalletPicker />
        {session ? (
          <button onClick={() => void logout()}>Sign out</button>
        ) : wallet ? (
          <WalletUiAuth wallet={wallet}>
            {(auth) => (
              <button disabled={!walletUi.connected || !auth.canSignIn} onClick={() => void handleSignIn(auth)}>
                Sign in with Solana
              </button>
            )}
          </WalletUiAuth>
        ) : (
          <button disabled>Connect wallet to sign in</button>
        )}
        <button onClick={() => void navigator.clipboard?.writeText(bootstrap?.runtime.mplCoreProgramAddress ?? '')}>Copy MPL Core program</button>
      </section>

      <section className="runtime-grid">
        <div><span>runtime</span><strong>{bootstrap?.runtime.ready ? 'ready' : 'checking'}</strong></div>
        <div><span>rpc</span><strong>{bootstrap?.runtime.solanaRpcUrl.replace('https://', '')}</strong></div>
        <div><span>mpl core</span><strong>{short(bootstrap?.runtime.mplCoreProgramAddress)}</strong></div>
        <div><span>active lanes</span><strong>{relays.length}</strong></div>
      </section>

      <section className="forms">
        <form onSubmit={(event) => { event.preventDefault(); void createRelay() }}>
          <h2>Intake relay packet</h2>
          <label>Title<input value={relayForm.title} onChange={(event) => setRelayForm({ ...relayForm, title: event.target.value })} /></label>
          <label>Zone<input value={relayForm.zone} onChange={(event) => setRelayForm({ ...relayForm, zone: event.target.value })} /></label>
          <div className="split"><label>Pickup<input value={relayForm.pickup} onChange={(event) => setRelayForm({ ...relayForm, pickup: event.target.value })} /></label><label>Dropoff<input value={relayForm.dropoff} onChange={(event) => setRelayForm({ ...relayForm, dropoff: event.target.value })} /></label></div>
          <div className="split"><label>Urgency<input type="number" min="1" max="5" value={relayForm.urgency} onChange={(event) => setRelayForm({ ...relayForm, urgency: Number(event.target.value) })} /></label><label>Window minutes<input type="number" value={relayForm.neededByMinutes} onChange={(event) => setRelayForm({ ...relayForm, neededByMinutes: Number(event.target.value) })} /></label></div>
          <label>Details<textarea value={relayForm.details} onChange={(event) => setRelayForm({ ...relayForm, details: event.target.value })} /></label>
          <button disabled={!session}>Transmit request</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); void publishWindow() }}>
          <h2>Volunteer window</h2>
          <label>Handle<input value={volunteerForm.handle} onChange={(event) => setVolunteerForm({ ...volunteerForm, handle: event.target.value })} /></label>
          <div className="split"><label>Zone<input value={volunteerForm.zone} onChange={(event) => setVolunteerForm({ ...volunteerForm, zone: event.target.value })} /></label><label>Capacity<input type="number" value={volunteerForm.capacity} onChange={(event) => setVolunteerForm({ ...volunteerForm, capacity: Number(event.target.value) })} /></label></div>
          <label>Transport<input value={volunteerForm.transport} onChange={(event) => setVolunteerForm({ ...volunteerForm, transport: event.target.value })} /></label>
          <label>Available minutes<input type="number" value={volunteerForm.availableMinutes} onChange={(event) => setVolunteerForm({ ...volunteerForm, availableMinutes: Number(event.target.value) })} /></label>
          <button disabled={!session}>Broadcast availability</button>
        </form>
      </section>

      <section className="board">
        {board.map(({ lane, relays: laneRelays }) => (
          <div className={`lane ${lane}`} key={lane}>
            <header><span>{lane}</span><b>{laneRelays.length}</b></header>
            {laneRelays.map((relay) => {
              const candidate = nextMatches.get(relay.code)
              return <article className="ticket" key={relay.id}>
                <div className="ticket-top"><strong>{relay.code}</strong><em>U{relay.urgency}</em></div>
                <h3>{relay.title}</h3>
                <p>{relay.details}</p>
                <div className="route"><span>{relay.pickup}</span><i>→</i><span>{relay.dropoff}</span></div>
                <div className="meta"><span>{relay.zone}</span><span>{minutesUntil(relay.neededBy)} min</span><span>{short(relay.claimedBy)}</span></div>
                {candidate ? <div className="match"><b>{candidate.score}</b><span>{candidate.handle} · {candidate.transport}</span></div> : null}
                <div className="actions">
                  {isOperator && candidate ? <button onClick={() => void match(relay, candidate.id)}>assign best</button> : null}
                  {['open', 'matched', 'escalated'].includes(relay.status) ? <button onClick={() => void claim(relay)} disabled={!session}>claim</button> : null}
                  {relay.status === 'claimed' ? <button onClick={() => void complete(relay)} disabled={!session}>complete</button> : null}
                </div>
              </article>
            })}
          </div>
        ))}
      </section>

      <section className="ops">
        <div>
          <h2>Operator sweep</h2>
          <p>Escalates any open, matched, or claimed relay whose handoff window is already overdue.</p>
          <button disabled={!isOperator} onClick={() => void sweep()}>Run overdue sweep</button>
        </div>
        <div className="volunteers">
          <h2>Live windows</h2>
          {volunteers.map((volunteer) => <p key={volunteer.id}><b>{volunteer.handle}</b><span>{volunteer.zone} · {volunteer.transport} · cap {volunteer.capacity}</span></p>)}
        </div>
        <div className="audit">
          <h2>Audit trace</h2>
          {audit.slice(0, 8).map((entry) => <p key={entry.id}><b>{entry.action}</b><span>{entry.target} · {short(entry.actor_wallet)}</span><small>{entry.note}</small></p>)}
        </div>
      </section>
    </main>
  )
}

export default App
