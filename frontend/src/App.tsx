import { useEffect } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Activity, ArrowLeftRight, CircleHelp, Command, LayoutDashboard, LogOut, ShieldCheck, Sparkles, WalletCards, Users } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from './store'
import { checkSession, clearAccounts, clearSession, clearTransactions, loadAccounts, signOut } from './store'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { TransferPage } from './pages/TransferPage'
import { AuthFlowPage } from './pages/AuthFlowPage'
import { ActivityPage } from './pages/ActivityPage'
import { FundingPage } from './pages/FundingPage'
import { AdminPage } from './pages/AdminPage'

function Protected({ children }: { children: React.ReactNode }) {
  const authenticated = useSelector((state: RootState) => state.auth.authenticated)
  return authenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const role = useSelector((state: RootState) => state.auth.user?.role)
  return role === 'ADMIN' ? <>{children}</> : <Navigate to="/" replace />
}

function AppLayout() {
  const dispatch = useDispatch<AppDispatch>()
  const user = useSelector((state: RootState) => state.auth.user)
  const location = useLocation()
  const navigate = useNavigate()
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there'
  useEffect(() => { if (user) void dispatch(loadAccounts()) }, [dispatch, user?._id])
  useEffect(() => { if (user) void dispatch(checkSession()) }, [dispatch])
  useEffect(() => {
    const onUnauthorized = () => { dispatch(clearSession()); dispatch(clearAccounts()); dispatch(clearTransactions()); navigate('/login', { replace: true }) }
    window.addEventListener('ledger:unauthorized', onUnauthorized)
    return () => window.removeEventListener('ledger:unauthorized', onUnauthorized)
  }, [dispatch, navigate])
  const logout = async () => { await dispatch(signOut()); dispatch(clearAccounts()); dispatch(clearTransactions()); navigate('/login') }
  const activeTitle = ({ '/transfer': 'Move money', '/activity': 'Activity', '/add-money': 'Add money', '/admin': 'Admin' } as Record<string, string>)[location.pathname] || 'Overview'
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/" className="brand"><span className="brand-mark"><Command size={19} strokeWidth={2.4}/></span><span>ledger<span className="brand-dot">.</span></span></NavLink>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav">
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`}><LayoutDashboard size={18}/><span>Overview</span></NavLink>
        <NavLink to="/transfer" className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`}><ArrowLeftRight size={18}/><span>Move money</span></NavLink>
        <NavLink to="/add-money" className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`}><WalletCards size={18}/><span>Add money</span></NavLink>
        <NavLink to="/activity" className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`}><Activity size={18}/><span>Activity</span></NavLink>
        {user?.role === 'ADMIN' && <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`}><Users size={18}/><span>Admin</span></NavLink>}
      </nav>
      <div className="sidebar-bottom">
        <div className="safe-card"><span className="safe-icon"><ShieldCheck size={16}/></span><div><b>Your money, protected</b><p>Private and secure by design.</p></div></div>
        <button className="profile-button" onClick={logout} title="Sign out"><span className="avatar">{user?.name?.[0]?.toUpperCase() || 'Y'}</span><span className="profile-copy"><b>{user?.name || 'Your account'}</b><small>{user?.email || 'Signed in'}</small></span><LogOut size={16}/></button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Command size={18}/></span><b>ledger<span className="brand-dot">.</span></b></div><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{activeTitle}</b></div><div className="topbar-right"><span className="secure-pill"><span/> Secure session</span><span className="top-avatar">{user?.name?.[0]?.toUpperCase() || 'Y'}</span></div></header>
      <div className="content"><div className="greeting-row"><div><div className="eyebrow"><Sparkles size={13}/> YOUR FINANCIAL HOME</div><h1>{location.pathname === '/transfer' ? 'A little closer.' : location.pathname === '/add-money' ? 'Top up, simply.' : location.pathname === '/activity' ? 'Your money in motion.' : location.pathname === '/admin' ? 'Operations overview.' : `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${firstName}.`}</h1><p className="subheading">{location.pathname === '/transfer' ? 'Send money simply, securely, and on your terms.' : location.pathname === '/add-money' ? 'Add funds securely through Razorpay checkout.' : location.pathname === '/activity' ? 'A clear record of your account activity.' : location.pathname === '/admin' ? 'Manage Ledger accounts and monitor activity.' : 'Here’s what’s happening with your money today.'}</p></div><div className="date-chip">{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</div></div>
        <Outlet />
        <footer className="footer"><span>Made for a little more peace of mind.</span><span><ShieldCheck size={13}/> Your financial data stays yours</span></footer>
      </div>
    </main>
    <nav className={`mobile-nav ${user?.role === 'ADMIN' ? 'mobile-nav-admin' : ''}`}><NavLink to="/" end><LayoutDashboard size={17}/><span>Home</span></NavLink><NavLink to="/add-money"><WalletCards size={17}/><span>Add</span></NavLink><NavLink to="/transfer"><ArrowLeftRight size={17}/><span>Move</span></NavLink><NavLink to="/activity"><Activity size={17}/><span>Activity</span></NavLink>{user?.role === 'ADMIN' && <NavLink to="/admin"><Users size={17}/><span>Admin</span></NavLink>}</nav>
  </div>
}

function NotFound() { return <div className="not-found"><span className="empty-icon"><CircleHelp size={23}/></span><h2>That page wandered off.</h2><p>The link may be old, or the page may have moved.</p><NavLink className="button button-dark" to="/">Back to overview</NavLink></div> }

export default function App() {
  const authenticated = useSelector((state: RootState) => state.auth.authenticated)
  return <Routes>
    <Route path="/login" element={authenticated ? <Navigate to="/" replace/> : <AuthPage/>}/>
    <Route path="/register" element={authenticated ? <Navigate to="/" replace/> : <AuthPage register/>}/>
    <Route path="/verify-email" element={<AuthFlowPage mode="verify"/>}/>
    <Route path="/forgot-password" element={<AuthFlowPage mode="forgot"/>}/>
    <Route path="/reset-password" element={<AuthFlowPage mode="reset"/>}/>
    <Route path="/resend-verification" element={<AuthFlowPage mode="resend"/>}/>
    <Route element={<Protected><AppLayout/></Protected>}>
      <Route path="/" element={<DashboardPage/>}/>
      <Route path="/transfer" element={<TransferPage/>}/>
      <Route path="/add-money" element={<FundingPage/>}/>
      <Route path="/activity" element={<ActivityPage/>}/>
      <Route path="/admin" element={<AdminOnly><AdminPage/></AdminOnly>}/>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes>
}
