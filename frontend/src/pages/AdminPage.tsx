import { useEffect, useState } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, Ban, CheckCircle2, RefreshCw, Search, ShieldCheck, Users, WalletCards } from 'lucide-react'
import { api, errorMessage } from '../api'

type Tab = 'users' | 'accounts' | 'transactions'
interface Overview { users: number; accounts: number; completedTransactions: number; totalBalance: number }
interface AdminUser { _id: string; name: string; email: string; role: string; status: string; emailVerified: boolean; createdAt: string }
interface AdminAccount { _id: string; currency: string; status: string; balance: number; user: { name: string; email: string } }
interface AdminTransaction { _id: string; amount: number; status: string; kind: string; createdAt: string; fromAccount?: { _id: string; currency: string } | null; toAccount: { _id: string; currency: string }; initiatedBy?: { name: string; email: string } }

function money(amount: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount || 0) }

export function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const statCards = [
    { icon: Users, label: 'Customers', value: overview?.users ?? '—' },
    { icon: WalletCards, label: 'Accounts', value: overview?.accounts ?? '—' },
    { icon: Activity, label: 'Completed transfers', value: overview?.completedTransactions ?? '—' },
    { icon: ShieldCheck, label: 'Ledger balance', value: money(overview?.totalBalance || 0) },
  ]

  async function refresh(selectedTab = tab, query = search) {
    setLoading(true); setError('')
    try {
      const stats = await api.get('/admin/overview'); setOverview(stats.data)
      if (selectedTab === 'users') setUsers((await api.get('/admin/users', { params: { limit: 50, search: query || undefined } })).data.users)
      if (selectedTab === 'accounts') setAccounts((await api.get('/admin/accounts', { params: { limit: 50 } })).data.accounts)
      if (selectedTab === 'transactions') setTransactions((await api.get('/admin/transactions', { params: { limit: 50 } })).data.transactions)
    } catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh('users', '') }, [])
  useEffect(() => { const timeout = window.setTimeout(() => { if (tab === 'users') void refresh('users', search) }, 250); return () => window.clearTimeout(timeout) }, [search])

  async function toggleAccount(account: AdminAccount) {
    setBusyId(account._id); setError('')
    try { await api.patch(`/admin/accounts/${account._id}/status`, { status: account.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE' }); await refresh('accounts') }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusyId('') }
  }
  async function toggleUser(user: AdminUser) {
    setBusyId(user._id); setError('')
    try { await api.patch(`/admin/users/${user._id}/status`, { status: user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }); await refresh('users') }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusyId('') }
  }
  function selectTab(next: Tab) { setTab(next); void refresh(next) }

  return <section className="admin-panel"><div className="admin-heading"><div><div className="section-kicker">ADMINISTRATION</div><h2>Ledger operations</h2><p>Review activity and manage customer accounts.</p></div><button className="button button-outline" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    <div className="admin-stats">{statCards.map(({ icon: Icon, label, value }) => <article className="admin-stat" key={label}><span><Icon size={16}/></span><small>{label}</small><b>{value}</b></article>)}</div>
    <div className="admin-tabs">{(['users', 'accounts', 'transactions'] as Tab[]).map(value => <button key={value} className={tab === value ? 'admin-tab active' : 'admin-tab'} onClick={() => selectTab(value)}>{value === 'users' ? 'Customers' : value === 'accounts' ? 'Accounts' : 'Transactions'}</button>)}<div className="admin-search"><Search size={14}/><input aria-label="Search customers" placeholder="Search customers" value={search} onChange={e => setSearch(e.target.value)} disabled={tab !== 'users'}/></div></div>
    {loading ? <div className="activity-empty">Loading administration data…</div> : tab === 'users' ? (
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Email</th><th>Verification</th><th>Status</th><th>Role</th><th>Joined</th><th>Action</th></tr></thead><tbody>{users.map(user => <tr key={user._id}><td><b>{user.name}</b></td><td>{user.email}</td><td><span className={`transaction-status ${user.emailVerified ? 'transaction-completed' : 'transaction-pending'}`}>{user.emailVerified ? 'Verified' : 'Unverified'}</span></td><td><span className={`transaction-status transaction-${user.status.toLowerCase()}`}>{user.status}</span></td><td>{user.role}</td><td>{new Date(user.createdAt).toLocaleDateString('en-IN')}</td><td><button className="button button-outline admin-action" disabled={busyId === user._id || user.role === 'ADMIN'} onClick={() => void toggleUser(user)}>{user.status === 'ACTIVE' ? <><Ban size={13}/> Suspend</> : <><CheckCircle2 size={13}/> Restore</>}</button></td></tr>)}</tbody></table>{users.length === 0 && <div className="activity-empty">No customers match that search.</div>}</div>
    ) : tab === 'accounts' ? (
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Owner</th><th>Account</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{accounts.map(account => <tr key={account._id}><td><b>{account.user?.name || 'Unknown'}</b><small>{account.user?.email}</small></td><td>{account.currency} · {account._id.slice(0, 8)}…{account._id.slice(-4)}</td><td>{money(account.balance)}</td><td><span className={`transaction-status transaction-${account.status.toLowerCase()}`}>{account.status}</span></td><td><button className="button button-outline admin-action" disabled={busyId === account._id || account.status === 'CLOSED'} onClick={() => void toggleAccount(account)}>{account.status === 'ACTIVE' ? <><Ban size={13}/> Freeze</> : account.status === 'FROZEN' ? <><CheckCircle2 size={13}/> Reactivate</> : 'Closed'}</button></td></tr>)}</tbody></table>{accounts.length === 0 && <div className="activity-empty">No accounts found.</div>}</div>
    ) : (
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Type</th><th>Customer</th><th>Accounts</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{transactions.map(item => <tr key={item._id}><td>{item.kind === 'FUNDING' ? <><ArrowDownLeft size={13}/> Funding</> : item.kind === 'REFUND' ? <><ArrowUpRight size={13}/> Refund</> : <><ArrowUpRight size={13}/> Transfer</>}</td><td>{item.initiatedBy?.email || 'System'}</td><td>{item.toAccount?._id?.slice(0, 8)}…</td><td>{money(item.amount)}</td><td><span className={`transaction-status transaction-${item.status.toLowerCase()}`}>{item.status}</span></td><td>{new Date(item.createdAt).toLocaleDateString('en-IN')}</td></tr>)}</tbody></table>{transactions.length === 0 && <div className="activity-empty">No transactions found.</div>}</div>
    )}
    <div className="activity-foot"><ShieldCheck size={14}/> Admin access is controlled by the server’s ADMIN_EMAILS setting.</div>
  </section>
}
