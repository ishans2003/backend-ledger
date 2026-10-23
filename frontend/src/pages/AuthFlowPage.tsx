import { FormEvent, useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Command, ShieldCheck } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../api'

type Mode = 'verify' | 'forgot' | 'reset' | 'resend'
const headings: Record<Mode, [string, string]> = {
  verify: ['Verify your email', 'Confirming your email address.'],
  forgot: ['Forgot your password?', 'We’ll send you a secure reset link.'],
  reset: ['Choose a new password', 'Use at least 8 characters.'],
  resend: ['Need a new link?', 'We’ll send a fresh verification link if the account needs one.'],
}

export function AuthFlowPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') || '')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode !== 'verify') return
    const token = params.get('token')
    if (!token) { setError('This verification link is missing its token.'); return }
    let active = true
    setBusy(true)
    api.post('/auth/verify-email', { token }).then(({ data }) => { if (active) setMessage(data.message) }).catch((err) => { if (active) setError(errorMessage(err)) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [mode, params])

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'forgot') setMessage((await api.post('/auth/forgot-password', { email })).data.message)
      else if (mode === 'resend') setMessage((await api.post('/auth/resend-verification', { email })).data.message)
      else if (mode === 'reset') {
        if (password.length < 8) { setError('Your new password needs at least 8 characters.'); return }
        setMessage((await api.post('/auth/reset-password', { token: params.get('token'), password })).data.message)
      }
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  const [title, subtitle] = headings[mode]
  return <div className="flow-page"><Link className="brand flow-brand" to="/login"><span className="brand-mark"><Command size={19}/></span><span>ledger<span className="brand-dot">.</span></span></Link><main className="flow-card"><span className="flow-icon">{message ? <CheckCircle2 size={23}/> : <ShieldCheck size={23}/>}</span><div className="eyebrow">ACCOUNT SECURITY</div><h1>{title}</h1><p>{subtitle}</p>
    {mode === 'verify' ? <div className={error ? 'inline-error' : 'flow-message'} role="status">{busy ? 'Verifying…' : error || message}</div> : <form onSubmit={submit} className="auth-form">{mode !== 'reset' && <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com"/></label>}{mode === 'reset' && <label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required placeholder="At least 8 characters"/></label>}{error && <div className="inline-error" role="alert">{error}</div>}{message && <div className="flow-message" role="status">{message}</div>}<button className="button button-dark auth-submit" disabled={busy}>{busy ? <span className="spinner"/> : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Save new password' : 'Send verification link'}</button></form>}
    <Link to="/login" className="flow-back"><ArrowLeft size={14}/>{mode === 'verify' || (mode === 'reset' && message) ? 'Back to sign in' : 'I remember my password'}</Link>
  </main></div>
}
