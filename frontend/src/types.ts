export interface User { _id: string; email: string; name: string; role: 'USER' | 'ADMIN'; emailVerified: boolean }
export interface Account { _id: string; user: string; status: 'ACTIVE' | 'FROZEN' | 'CLOSED'; currency: string; createdAt?: string }
export interface AccountWithBalance extends Account { balance: number }
export interface AccountReference { _id: string; currency: string; user?: string }
export interface Transaction { _id: string; fromAccount: string | AccountReference | null; toAccount: string | AccountReference; amount: number; status: string; idempotencyKey: string; kind: 'TRANSFER' | 'FUNDING' | 'REFUND'; createdAt: string; providerPaymentId?: string; providerRefundId?: string }
