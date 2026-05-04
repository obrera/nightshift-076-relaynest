import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { WalletUi, createSolanaDevnet, createStorageAccount, createStorageCluster, createWalletUiConfig } from '@wallet-ui/react'
import App from './App'
import './index.css'

const walletStorageKeys = ['wallet-ui:account', 'relaynest076:wallet-ui:account']
const walletResetFlag = 'relaynest076:wallet-reset-attempted'

function clearWalletState() {
  for (const key of walletStorageKeys) {
    localStorage.removeItem(key)
  }
}

function isWalletRegistryError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }
  const code = (error as Error & { context?: { __code?: number } }).context?.__code
  return error.name === 'WalletStandardError' && (code === 3834000 || error.message.includes('No underlying Wallet Standard wallet'))
}

class WalletRuntimeBoundary extends Component<{ children: ReactNode }, { blocked: boolean }> {
  state = { blocked: false }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    if (isWalletRegistryError(error)) {
      clearWalletState()
      if (sessionStorage.getItem(walletResetFlag) !== '1') {
        sessionStorage.setItem(walletResetFlag, '1')
        location.reload()
        return
      }
    }
    this.setState({ blocked: true })
  }

  render() {
    if (this.state.blocked) {
      return (
        <main>
          <section className="auth-strip">
            <div>
              <span>Wallet state reset needed</span>
              <strong>stale wallet handle blocked startup</strong>
            </div>
            <button onClick={() => { clearWalletState(); sessionStorage.removeItem(walletResetFlag); location.reload() }}>Reset wallet state</button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

const walletConfig = createWalletUiConfig({
  accountStorage: createStorageAccount({ key: 'relaynest076:wallet-ui:account' }),
  clusters: [createSolanaDevnet(import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com')],
  clusterStorage: createStorageCluster({ key: 'relaynest076:wallet-ui:cluster' }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletRuntimeBoundary>
      <WalletUi config={walletConfig}>
        <App />
      </WalletUi>
    </WalletRuntimeBoundary>
  </StrictMode>,
)
