import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowRight, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { api, errorMessage } from '../api'
import type { AppDispatch, RootState } from '../store'
import { loadAccounts, loadTransactions } from '../store'
import type { AccountWithBalance } from '../types'

interface FundingItem { _id: string; amount: number; currency: string; status: string; orderId?: string; createdAt: string }

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void } } }
let checkoutScript: Promise<void> | null = null
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the secure payment form'))
    document.body.appendChild(script)
  }).finally(() => { checkoutScript = null })
  return checkoutScript
}
function newKey() { return globalThis.crypto?.randomUUID?.() || `fund-${Date.now()}-${Math.random().toString(36).slice(2)}` }

export function FundingPage() {
  const dispatch = useDispatch<AppDispatch>()
  const accounts = useSelector((state: RootState) => state.accounts.items.filter((account: AccountWithBalance) => account.currency === 'INR' && account.status === 'ACTIVE'))
  const user = useSelector((state: RootState) => state.auth.user)
  const [accountId, setAccountId] = useState(accounts[0]?._id || '')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(newKey())
  const [fundingItems, setFundingItems] = useState<FundingItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  useEffect(() => { if (!accountId && accounts[0]) setAccountId(accounts[0]._id) }, [accountId, accounts])
  const refreshFunding = useCallback(async () => {
    setHistoryLoading(true)
    try { setFundingItems((await api.get('/funding/')).data.funding as FundingItem[]) }
    catch { /* Keep the payment form usable if recent status is unavailable. */ }
    finally { setHistoryLoading(false) }
  }, [])
  useEffect(() => { void refreshFunding() }, [refreshFunding])

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('')
    const value = Number(amount)
    if (!accountId || !Number.isFinite(value) || value < 1 || value > 100000 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
      setError('Choose an account and enter an amount from ₹1 to ₹1,00,000 (up to 2 decimal places).'); setBusy(false); return
    }
    try {
      const orderResponse = await api.post('/funding/orders', { accountId, amount: value, idempotencyKey })
      await refreshFunding()
      if (orderResponse.data.alreadyCompleted) { setMessage('This payment is already in your balance.'); setBusy(false); await Promise.all([dispatch(loadAccounts()), dispatch(loadTransactions(undefined))]); return }
      await loadCheckout()
      if (!window.Razorpay) throw new Error('The secure payment form is unavailable. Please try again.')
      const checkout = new window.Razorpay({
        key: orderResponse.data.keyId,
        amount: Math.round(value * 100),
        currency: 'INR',
        name: 'Ledger',
        description: 'Add funds to your Ledger account',
        order_id: orderResponse.data.orderId,
        prefill: { name: user?.name, email: user?.email },
        theme: { color: '#274333' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const result = await api.post('/funding/verify', response)
            setMessage(result.data.message || 'Money added successfully.')
            setAmount(''); setIdempotencyKey(newKey())
            await Promise.all([dispatch(loadAccounts()), dispatch(loadTransactions(undefined))])
            await refreshFunding()
          } catch (verificationError) {
            setError(errorMessage(verificationError))
            await Promise.all([dispatch(loadAccounts()), dispatch(loadTransactions(undefined))])
            await refreshFunding()
          } finally { setBusy(false) }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      checkout.on('payment.failed', response => { setError(response.error?.description || 'The payment did not complete. No money was added.'); setBusy(false); void refreshFunding() })
      checkout.open()
    } catch (err) { setError(errorMessage(err)); setIdempotencyKey(newKey()); setBusy(false) }
  }

  return <><div className="funding-layout"><section className="funding-card"><div className="transfer-form-header"><span className="transfer-icon"><ArrowDownToLine size={19}/></span><div><div className="eyebrow">ADD FUNDS</div><h2>Top up your account</h2></div><span className="secure-pill transfer-secure"><span/> Secure checkout</span></div><p className="transfer-intro">Payments are handled by Razorpay. Your card or UPI details never reach Ledger.</p>
    {accounts.length === 0 ? <div className="empty-state funding-empty"><span className="empty-icon"><WalletCards size={22}/></span><h3>Create an INR account first.</h3><p>Choose or create an active INR account to receive funds.</p><Link className="button button-dark" to="/">Go to overview <ArrowRight size={15}/></Link></div> : <form className="funding-form" onSubmit={submit}><label>Deposit into<select value={accountId} onChange={e => setAccountId(e.target.value)} required>{accounts.map(account => <option key={account._id} value={account._id}>INR account · {account._id.slice(0, 8)}…{account._id.slice(-4)}</option>)}</select></label><label>Amount to add<div className="amount-input"><span>₹</span><input type="number" min="1" max="100000" step="0.01" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required/></div><small className="field-hint">₹1 minimum · ₹1,00,000 maximum per payment</small></label>{error && <div className="inline-error" role="alert">{error}</div>}{message && <div className="flow-message" role="status">{message}</div>}<button className="button button-dark full-button" disabled={busy}>{busy ? <><span className="spinner"/> Preparing checkout…</> : <>Continue to secure payment <ArrowRight size={16}/></>}</button><div className="idempotency-note"><ShieldCheck size={14}/> Funds are credited after the payment is confirmed.</div></form>}
  </section><aside className="funding-aside"><span className="funding-art"><WalletCards size={24}/></span><div className="aside-kicker">PAYMENT PROTECTION</div><h3>Secure payment.<br/>Clear record.</h3><p>Each successful payment creates a permanent credit entry in your account ledger.</p><div className="funding-provider">Powered by <b>Razorpay</b><span>Payment mode is controlled by your server credentials.</span></div></aside></div>
    <section className="funding-history"><div className="activity-header"><div><div className="section-kicker">PAYMENT STATUS</div><h2>Recent funding attempts</h2></div><button className="button button-outline" disabled={historyLoading} onClick={() => void refreshFunding()}><RefreshCw size={14}/> Refresh</button></div>{historyLoading ? <div className="activity-empty">Loading payment status…</div> : fundingItems.length ? <div className="activity-list">{fundingItems.map(item => <div className="activity-row" key={item._id}><span className={`activity-direction ${item.status === 'COMPLETED' ? 'activity-in' : 'activity-out'}`}><WalletCards size={16}/></span><div className="activity-copy"><b>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: item.currency }).format(item.amount)} deposit</b><span>{new Date(item.createdAt).toLocaleString('en-IN')}</span></div><span className={`transaction-status transaction-${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span></div>)}</div> : <div className="activity-empty">No funding attempts yet.</div>}</section>
  </>
}
