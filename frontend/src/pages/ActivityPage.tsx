import { useEffect } from 'react'
import { ArrowDownLeft, ArrowUpRight, Clock3, RefreshCw, WalletCards } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { clearTransactions, loadTransactions } from '../store'
import type { AccountReference, Transaction } from '../types'

function referenceId(reference: string | AccountReference | null | undefined) { return typeof reference === 'string' ? reference : reference?._id || '' }
function formatMoney(amount: number, currency = 'INR') { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount) } catch { return `${currency} ${amount}` } }

export function ActivityPage() {
  const dispatch = useDispatch<AppDispatch>()
  const { items, hasMore, nextCursor, status, error } = useSelector((state: RootState) => state.transactions)
  const accounts = useSelector((state: RootState) => state.accounts.items)
  useEffect(() => { dispatch(clearTransactions()); void dispatch(loadTransactions(undefined)) }, [dispatch])
  const ownIds = new Set(accounts.map(account => account._id))
  return <section className="activity-panel"><div className="activity-header"><div><div className="section-kicker">RECENT ACTIVITY</div><h2>Transfers &amp; funding</h2><p>Ledger entries connected to your accounts.</p></div><button className="button button-outline" onClick={() => { dispatch(clearTransactions()); void dispatch(loadTransactions(undefined)) }} disabled={status === 'loading'}><RefreshCw size={14}/> Refresh</button></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {status === 'loading' && items.length === 0 ? <div className="activity-empty">Loading your activity…</div> : items.length === 0 ? <div className="activity-empty"><span className="empty-icon"><Clock3 size={21}/></span><h3>Nothing has moved yet.</h3><p>Completed transfers and added funds will appear here.</p></div> : <div className="activity-list">{items.map((item: Transaction) => {
      const destinationId = referenceId(item.toAccount)
      const incoming = ownIds.has(destinationId) && item.kind === 'TRANSFER'
      const currency = (typeof item.toAccount === 'object' && item.toAccount?.currency) || 'INR'
      const isCredit = incoming || item.kind === 'FUNDING'
      const detail = item.kind === 'FUNDING' ? 'Added money' : item.kind === 'REFUND' ? 'Payment refunded' : incoming ? 'Received transfer' : 'Sent transfer'
      return <article className="activity-row" key={item._id}><span className={`activity-direction ${isCredit ? 'activity-in' : 'activity-out'}`}>{isCredit ? <ArrowDownLeft size={17}/> : <ArrowUpRight size={17}/>}</span><div className="activity-copy"><b>{detail}</b><span>{item.kind === 'FUNDING' ? 'Razorpay payment' : item.kind === 'REFUND' ? 'Razorpay refund reversal' : `${incoming ? 'From' : 'To'} account · ${incoming ? referenceId(item.fromAccount) : destinationId}`}</span></div><div className="activity-date">{new Date(item.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}<span className={`transaction-status transaction-${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span></div><b className={`activity-amount ${isCredit ? 'amount-positive' : ''}`}>{isCredit ? '+' : '−'}{formatMoney(item.amount, currency)}</b></article>
    })}</div>}
    {hasMore && <button className="button button-outline activity-more" disabled={status === 'loading'} onClick={() => nextCursor && void dispatch(loadTransactions(nextCursor))}>{status === 'loading' ? 'Loading…' : 'Load older activity'}</button>}
    <div className="activity-foot"><WalletCards size={14}/> Activity comes from your immutable ledger entries.</div>
  </section>
}
