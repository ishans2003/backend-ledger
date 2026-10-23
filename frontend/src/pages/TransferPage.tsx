import { FormEvent, useState } from 'react'
import { ArrowDown, ArrowLeftRight, ArrowRight, CheckCircle2, CircleHelp, Copy, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useDispatch } from 'react-redux'
import { api, errorMessage } from '../api'
import type { RootState } from '../store'
import type { AppDispatch } from '../store'
import { loadAccounts, loadTransactions } from '../store'
import type { AccountWithBalance, Transaction } from '../types'

function makeKey() { return globalThis.crypto?.randomUUID?.() || `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}` }
function money(value: number, currency: string) { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value) } catch { return `${currency} ${value.toLocaleString('en-IN')}` } }
function accountId(value: Transaction['toAccount']) { return typeof value === 'string' ? value : value._id }

export function TransferPage() {
  const [searchParams] = useSearchParams()
  const dispatch = useDispatch<AppDispatch>()
  const accounts = useSelector((state: RootState) => state.accounts.items)
  const [fromAccount, setFromAccount] = useState(searchParams.get('from') || '')
  const [toAccount, setToAccount] = useState('')
  const [amount, setAmount] = useState('')
  const [key, setKey] = useState(makeKey())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState<Transaction | null>(null)
  const selected = accounts.find((account: AccountWithBalance) => account._id === fromAccount)

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!fromAccount) { setError('Choose the account you’d like to send from.'); return }
    if (!toAccount.trim()) { setError('Enter the destination account ID.'); return }
    if (toAccount.trim() === fromAccount) { setError('Choose a different destination account.'); return }
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) { setError('Enter an amount greater than zero with up to 2 decimal places.'); return }
    if (selected && value > selected.balance) { setError('This amount is greater than the available balance.'); return }
    setBusy(true)
    try {
      const { data } = await api.post('/transactions/', { fromAccount, toAccount: toAccount.trim(), amount: value, idempotencyKey: key })
      if (!data.transaction) {
        setError(data.message || 'This transfer is still processing. You can retry safely with the same reference.')
        return
      }
      setCompleted({ ...data.transaction, status: 'COMPLETED' } as Transaction)
      void dispatch(loadAccounts())
      void dispatch(loadTransactions(undefined))
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  function startAnother() { setCompleted(null); setAmount(''); setToAccount(''); setKey(makeKey()) }

  if (completed) return <div className="transfer-layout"><section className="transfer-form-card success-card"><span className="success-mark"><CheckCircle2 size={27}/></span><div className="eyebrow">TRANSFER CONFIRMED</div><h2>All sent, all set.</h2><p className="transfer-intro">Your transfer has been completed successfully.</p><div className="success-amount">{money(completed.amount, selected?.currency || 'INR')}</div><div className="success-details"><div><span>FROM ACCOUNT</span><b>{fromAccount.slice(0, 8)}…{fromAccount.slice(-4)}</b></div><div><span>TO ACCOUNT</span><b>{accountId(completed.toAccount).slice(0, 8)}…{accountId(completed.toAccount).slice(-4)}</b></div><div><span>STATUS</span><b className="success-status">{completed.status}</b></div></div><button className="button button-dark full-button" onClick={startAnother}>Make another transfer <ArrowRight size={16}/></button><Link to="/" className="back-link">Back to overview</Link></section><aside className="transfer-aside aside-success"><div className="aside-art"><Sparkles size={23}/></div><h3>That felt good,<br/>didn’t it?</h3><p>Money moves. Your balance catches up. Everything in its place.</p><div className="aside-bottom"><ShieldCheck size={15}/> Recorded securely in your ledger</div></aside></div>

  return <div className="transfer-layout"><section className="transfer-form-card"><div className="transfer-form-header"><span className="transfer-icon"><ArrowLeftRight size={19}/></span><div><div className="eyebrow">SEND MONEY</div><h2>Make a transfer</h2></div><span className="secure-pill transfer-secure"><span/> Secure</span></div><p className="transfer-intro">Move funds from your account to another Ledger account.</p>
    {accounts.length === 0 ? <div className="notice">Create an account first to send money. <Link to="/">Go to overview</Link></div> : <form className="transfer-form" onSubmit={submit}>
      <label>From account<select value={fromAccount} onChange={e => setFromAccount(e.target.value)} required><option value="" disabled>Select an account</option>{accounts.map((account: AccountWithBalance) => <option key={account._id} value={account._id} disabled={account.status !== 'ACTIVE'}>{account.currency} · {account._id.slice(0, 8)}…{account._id.slice(-4)} · {money(account.balance, account.currency)}{account.status !== 'ACTIVE' ? ` · ${account.status}` : ''}</option>)}</select></label>
      {selected && <div className="available-hint"><span/> Available balance <b>{money(selected.balance, selected.currency)}</b></div>}
      <div className="transfer-arrow"><span/><ArrowDown size={15}/><span/></div>
      <label>To account ID<div className="input-with-icon"><input value={toAccount} onChange={e => setToAccount(e.target.value)} placeholder="Paste the recipient’s account ID" autoComplete="off"/><CircleHelp size={16}/></div><small className="field-hint">Ask the recipient to share their Ledger account ID.</small></label>
      <label>Amount<div className="amount-input"><span>{selected?.currency === 'INR' || !selected ? '₹' : selected.currency}</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" required/></div></label>
      {amount && Number(amount) > 0 && selected && <div className="transfer-preview"><span>You’re sending</span><b>{money(Number(amount), selected.currency)}</b></div>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <button type="submit" className="button button-dark full-button" disabled={busy || !accounts.some((account: AccountWithBalance) => account.status === 'ACTIVE')}>{busy ? <><span className="spinner"/> Sending securely…</> : <>Review and send <ArrowRight size={17}/></>}</button>
      <div className="idempotency-note"><Copy size={13}/> A unique secure reference is attached to this transfer.</div>
    </form>}
  </section><aside className="transfer-aside"><div className="aside-art"><ArrowLeftRight size={24}/></div><div className="aside-kicker">A THOUGHTFUL WAY TO MOVE MONEY</div><h3>One clear step<br/>at a time.</h3><p>Transfers are validated against your available balance and recorded directly in the ledger.</p><div className="aside-steps"><div><span>01</span> Choose your account</div><div><span>02</span> Add recipient details</div><div><span>03</span> Send with confidence</div></div><div className="aside-bottom"><ShieldCheck size={15}/> Protected and recorded securely</div></aside></div>
}
