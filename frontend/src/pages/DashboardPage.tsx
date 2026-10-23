import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CreditCard, Plus, RefreshCw, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AppDispatch, RootState } from '../store'
import { createAccount, loadAccounts } from '../store'
import type { AccountWithBalance } from '../types'

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value) }
  catch { return `${currency} ${value.toLocaleString('en-IN')}` }
}
function shortId(id: string) { return `${id.slice(0, 8)} ···· ${id.slice(-4)}` }

export function DashboardPage() {
  const dispatch = useDispatch<AppDispatch>()
  const { items, status, error } = useSelector((state: RootState) => state.accounts)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const total = items.reduce((sum: number, item: AccountWithBalance) => sum + (item.currency === 'INR' ? item.balance : 0), 0)
  const activeCount = items.filter(item => item.status === 'ACTIVE').length

  async function addAccount() {
    setCreating(true); setNotice('')
    const result = await dispatch(createAccount())
    if (result.meta.requestStatus === 'fulfilled') { await dispatch(loadAccounts()); setNotice('Your new INR account is ready.') }
    else setNotice('We couldn’t create an account. Please try again.')
    setCreating(false)
  }

  return <>
    <section className="summary-grid"><article className="balance-card"><div className="balance-card-top"><span className="balance-label"><span className="balance-indicator"/> TOTAL INR BALANCE</span><span className="balance-icon"><WalletCards size={18}/></span></div><div className="total-balance">{money(total, 'INR')}</div><div className="balance-foot"><span>Across {items.length} {items.length === 1 ? 'account' : 'accounts'}</span><span className="balance-foot-right"><span/> Up to date</span></div><div className="balance-decoration"/></article>
      <article className="stat-card"><div className="stat-card-top"><span className="stat-icon stat-blue"><CreditCard size={17}/></span><span className="stat-overline">YOUR ACCOUNTS</span></div><div className="stat-value">{items.length.toString().padStart(2, '0')}</div><div className="stat-caption">{activeCount} active · ready when you are</div></article>
      <article className="action-card"><div className="action-sparkle"><ArrowUpRight size={18}/></div><div className="action-heading">Money moves<br/>better with a plan.</div><p>Send money or add funds securely.</p><div className="dashboard-actions"><Link to="/transfer" className="button button-cream">Send money <ArrowRight size={15}/></Link><Link to="/add-money" className="button button-cream">Add money</Link></div></article></section>
    <section className="section-heading"><div><div className="section-kicker">THE FULL PICTURE</div><h2>Your accounts<span className="heading-count">{items.length}</span></h2></div><div className="section-actions"><button className="button button-outline" onClick={() => void dispatch(loadAccounts())} disabled={status === 'loading'}><RefreshCw size={15} className={status === 'loading' ? 'spin' : ''}/> Refresh</button><button className="button button-dark" onClick={addAccount} disabled={creating}><Plus size={16}/>{creating ? 'Creating…' : 'New account'}</button></div></section>
    {notice && <div className={`notice ${notice.includes('couldn’t') ? 'notice-error' : ''}`} role="status">{notice}</div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {status === 'loading' && items.length === 0 ? <div className="account-grid"><div className="skeleton-card"/><div className="skeleton-card"/></div> : error && items.length === 0 ? <div className="empty-state"><div className="empty-icon"><WalletCards size={23}/></div><h3>We couldn’t load your accounts.</h3><p>Your balance is still safe. Try refreshing the account list.</p><button className="button button-dark" onClick={() => void dispatch(loadAccounts())}><RefreshCw size={15}/> Try again</button></div> : items.length === 0 ? <div className="empty-state"><div className="empty-icon"><WalletCards size={23}/></div><h3>Your money needs a home.</h3><p>Open your first account to start keeping everything in one place.</p><button className="button button-dark" onClick={addAccount} disabled={creating}><Plus size={16}/>{creating ? 'Creating…' : 'Create your first account'}</button></div> : <div className="account-grid">{items.map((account, index) => <AccountCard key={account._id} account={account} index={index}/>)}</div>}
    <section className="bottom-note"><div className="bottom-note-icon"><ArrowDownLeft size={17}/></div><div><b>A clear view, by design.</b><p>Balances come directly from your account ledger.</p></div><span className="bottom-note-lock">PRIVATE BY DEFAULT</span></section>
  </>
}

function AccountCard({ account, index }: { account: AccountWithBalance; index: number }) {
  return (<article className={`account-card account-tone-${index % 3}`}><div className="account-card-head"><span className="account-type"><span className="account-type-icon"><CreditCard size={16}/></span> {account.currency || 'Account'} account</span><span className={`status-pill ${account.status === 'ACTIVE' ? 'status-active' : 'status-muted'}`}><span/>{account.status.toLowerCase()}</span></div><div className="account-balance-label">AVAILABLE BALANCE</div><div className="account-balance">{money(account.balance, account.currency || 'INR')}</div><div className="account-card-divider"/><div className="account-card-foot"><div><span>ACCOUNT ID</span><b title={account._id}>{shortId(account._id)}</b></div><Link className="icon-button" to={`/transfer?from=${account._id}`} title="Transfer from this account" aria-label="Transfer from this account"><ArrowUpRight size={17}/></Link></div></article>)
}
