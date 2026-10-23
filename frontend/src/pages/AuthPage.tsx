import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Command, Eye, EyeOff, ShieldCheck, Sparkles } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { signIn, signUp } from '../store'

export function AuthPage({ register = false }: { register?: boolean }) {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { status, error } = useSelector((state: RootState) => state.auth)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [registrationSent, setRegistrationSent] = useState(false)
  const busy = status === 'loading'

  async function submit(event: FormEvent) {
    event.preventDefault(); setFormError('')
    if (!email.includes('@')) { setFormError('Enter a valid email address.'); return }
    if (password.length < 8) { setFormError('Your password needs at least 8 characters.'); return }
    if (register && !name.trim()) { setFormError('Please enter your name.'); return }
    const result = register ? await dispatch(signUp({ name: name.trim(), email, password })) : await dispatch(signIn({ email, password }))
    if (result.meta.requestStatus === 'fulfilled') {
      if (register) setRegistrationSent(true)
      else navigate('/', { replace: true })
    }
  }

  return <div className="auth-page">
    <section className="auth-story"><Link to="/login" className="brand auth-brand"><span className="brand-mark"><Command size={19}/></span><span>ledger<span className="brand-dot">.</span></span></Link><div className="story-content"><span className="story-label"><Sparkles size={14}/> MONEY, WITH A CLEARER VIEW</span><h1>A calmer way<br/>to keep track.</h1><p>All your accounts, one clear picture. Move money with confidence and spend less time wondering where it went.</p><div className="story-points"><div><span><Check size={15}/></span> Your accounts, all together</div><div><span><Check size={15}/></span> Transfers made simple</div><div><span><Check size={15}/></span> Built with your privacy in mind</div></div></div><div className="story-foot"><ShieldCheck size={15}/> A little more peace of mind, every day.</div></section>
    <main className="auth-main"><div className="auth-top-note"><span className="secure-pill"><span/> Secure connection</span></div><div className="auth-card"><div className="auth-card-icon"><Command size={21}/></div><div className="eyebrow">{register ? 'A GOOD PLACE TO BEGIN' : 'WELCOME BACK'}</div><h2>{register ? 'Let’s get you set up.' : 'Good to see you again.'}</h2><p className="auth-subtitle">{register ? 'A few details and your financial home is ready.' : 'Sign in to pick up right where you left off.'}</p>
      {registrationSent ? <div className="auth-success"><span className="success-mark"><ShieldCheck size={24}/></span><h3>Check your inbox.</h3><p>We sent a verification link to <b>{email}</b>. Verify your address, then sign in to continue.</p><Link to="/resend-verification">Need a new link?</Link></div> : <form onSubmit={submit} className="auth-form" noValidate>
        {register && <label>Your name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aanya Sharma" required/></label>}
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required/></label>
        <label>Password<span className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8}/><button className="show-password" type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
        {(formError || error) && <div className="inline-error" role="alert">{formError || error}{!register && error?.toLowerCase().includes('verify your email') && <> <Link to={`/resend-verification?email=${encodeURIComponent(email)}`}>Resend verification</Link></>}</div>}
        <button className="button button-dark auth-submit" disabled={busy}>{busy ? <span className="spinner"/> : <>{register ? 'Create my account' : 'Sign in'} <ArrowRight size={17}/></>}</button>
      </form>}{!registrationSent && <><p className="auth-switch">{register ? 'Already have an account?' : 'New around here?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>{!register && <p className="auth-switch auth-forgot"><Link to="/forgot-password">Forgot your password?</Link></p>}</>}<div className="auth-assurance"><ShieldCheck size={14}/> Your details are encrypted and kept private.</div></div><div className="auth-mobile-foot">Ledger · Your money, in good order</div></main>
  </div>
}
