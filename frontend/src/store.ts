import { configureStore, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { api, errorMessage } from './api'
import type { Account, AccountWithBalance, Transaction, User } from './types'

function cachedUser(): User | null {
  // Remove access tokens persisted by the previous frontend version; auth now uses HTTP-only cookies.
  localStorage.removeItem('ledger_token')
  try { const value = localStorage.getItem('ledger_user'); return value ? JSON.parse(value) as User : null }
  catch { localStorage.removeItem('ledger_user'); return null }
}
interface AuthState { user: User | null; authenticated: boolean; status: 'idle' | 'loading'; error: string | null }
const authInitial: AuthState = { user: cachedUser(), authenticated: Boolean(cachedUser()), status: 'idle', error: null }

export const signIn = createAsyncThunk('auth/signIn', async (credentials: { email: string; password: string }, { rejectWithValue }) => {
  try { return (await api.post('/auth/login', credentials)).data as { user: User } }
  catch (error) { return rejectWithValue(errorMessage(error)) }
})
export const signUp = createAsyncThunk('auth/signUp', async (credentials: { name: string; email: string; password: string }, { rejectWithValue }) => {
  try { return (await api.post('/auth/register', credentials)).data as { message: string } }
  catch (error) { return rejectWithValue(errorMessage(error)) }
})
export const checkSession = createAsyncThunk('auth/checkSession', async (_, { rejectWithValue }) => {
  try { return (await api.get('/auth/me')).data.user as User }
  catch (error) { return rejectWithValue(errorMessage(error)) }
})
export const signOut = createAsyncThunk('auth/signOut', async () => {
  try { await api.post('/auth/logout') } catch { /* Clear local UI state even if the server is unavailable. */ }
})

export const loadAccounts = createAsyncThunk('accounts/load', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/accounts/')
    const accounts = data.accounts as Account[]
    return await Promise.all(accounts.map(async (account) => {
      const result = await api.get(`/accounts/balance/${account._id}`)
      return { ...account, balance: Number(result.data.balance) } as AccountWithBalance
    }))
  } catch (error) { return rejectWithValue(errorMessage(error)) }
})
export const createAccount = createAsyncThunk('accounts/create', async (_, { rejectWithValue }) => {
  try { await api.post('/accounts/'); return true }
  catch (error) { return rejectWithValue(errorMessage(error)) }
})
export const loadTransactions = createAsyncThunk('transactions/load', async (before: string | undefined, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/transactions/', { params: { limit: 25, ...(before ? { before } : {}) } })
    return data as { transactions: Transaction[]; hasMore: boolean; nextCursor: string | null }
  } catch (error) { return rejectWithValue(errorMessage(error)) }
})

const authSlice = createSlice({
  name: 'auth', initialState: authInitial,
  reducers: {
    clearSession(state) { state.user = null; state.authenticated = false; state.error = null; localStorage.removeItem('ledger_user') },
  },
  extraReducers: (builder) => {
    builder.addCase(signIn.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(signIn.fulfilled, (state, action) => { state.status = 'idle'; state.user = action.payload.user; state.authenticated = true; localStorage.setItem('ledger_user', JSON.stringify(action.payload.user)) })
      .addCase(signIn.rejected, (state, action) => { state.status = 'idle'; state.error = action.payload as string || 'Unable to sign in' })
      .addCase(signUp.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(signUp.fulfilled, (state) => { state.status = 'idle' })
      .addCase(signUp.rejected, (state, action) => { state.status = 'idle'; state.error = action.payload as string || 'Unable to create account' })
      .addCase(checkSession.fulfilled, (state, action) => { state.user = action.payload; state.authenticated = true; localStorage.setItem('ledger_user', JSON.stringify(action.payload)) })
      // The Axios 401/403 handler clears the session. A temporary network failure must not log a cached user out.
      .addCase(checkSession.rejected, () => {})
      .addCase(signOut.fulfilled, (state) => { state.user = null; state.authenticated = false; state.error = null; localStorage.removeItem('ledger_user') })
  },
})

const accountsSlice = createSlice({
  name: 'accounts', initialState: { items: [] as AccountWithBalance[], status: 'idle' as 'idle' | 'loading', error: null as string | null },
  reducers: { clearAccounts(state) { state.items = []; state.error = null } },
  extraReducers: (builder) => {
    builder.addCase(loadAccounts.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(loadAccounts.fulfilled, (state, action) => { state.status = 'idle'; state.items = action.payload })
      .addCase(loadAccounts.rejected, (state, action) => { state.status = 'idle'; state.error = action.payload as string || 'Unable to load accounts' })
      .addCase(createAccount.fulfilled, (state) => { state.error = null })
      .addCase(createAccount.rejected, (state, action) => { state.error = action.payload as string || 'Unable to create account' })
  },
})

const transactionsSlice = createSlice({
  name: 'transactions', initialState: { items: [] as Transaction[], hasMore: false, nextCursor: null as string | null, status: 'idle' as 'idle' | 'loading', error: null as string | null },
  reducers: { clearTransactions(state) { state.items = []; state.hasMore = false; state.nextCursor = null; state.error = null } },
  extraReducers: (builder) => {
    builder.addCase(loadTransactions.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(loadTransactions.fulfilled, (state, action) => {
        state.status = 'idle'
        state.items = action.meta.arg ? [...state.items, ...action.payload.transactions] : action.payload.transactions
        state.hasMore = action.payload.hasMore; state.nextCursor = action.payload.nextCursor
      })
      .addCase(loadTransactions.rejected, (state, action) => { state.status = 'idle'; state.error = action.payload as string || 'Unable to load transfers' })
  },
})

export const { clearSession } = authSlice.actions
export const { clearAccounts } = accountsSlice.actions
export const { clearTransactions } = transactionsSlice.actions
export const store = configureStore({ reducer: { auth: authSlice.reducer, accounts: accountsSlice.reducer, transactions: transactionsSlice.reducer } })
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
