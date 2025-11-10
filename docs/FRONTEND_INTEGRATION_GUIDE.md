# Council API - Frontend Integration Guide

This guide explains how to integrate the AI Risk Council API into the Sengol Next.js frontend application.

---

## Table of Contents

1. [Overview](#overview)
2. [API Client Setup](#api-client-setup)
3. [Type Definitions](#type-definitions)
4. [React Hooks](#react-hooks)
5. [UI Components](#ui-components)
6. [Page Structure](#page-structure)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

---

## Overview

The Council API provides governance workflow capabilities for risk assessments. Key features:
- Council management (admin)
- Membership administration (admin)
- Assessment review and approval (council members)
- Tamper-evident audit trail

**Base URL**: `/api/v1` (proxied through Next.js API routes)

---

## API Client Setup

### 1. Create API Client

Create `lib/api/council.ts`:

```typescript
import { api } from './client' // Your existing API client

export interface Council {
  id: string
  name: string
  description?: string
  status: 'ACTIVE' | 'ARCHIVED' | 'SUSPENDED'
  quorum: number
  requireUnanimous: boolean
  createdAt: string
  updatedAt: string
}

export interface CouncilMembership {
  id: string
  councilId: string
  userId: string
  role: 'CHAIR' | 'PARTNER' | 'OBSERVER'
  status: 'ACTIVE' | 'REVOKED' | 'SUSPENDED'
  assignedAt: string
  revokedAt?: string
  notes?: string
  user?: {
    id: string
    name: string
    email: string
  }
}

export interface RiskApproval {
  id: string
  assessmentId: string
  councilId: string
  status: 'APPROVED' | 'REJECTED' | 'PENDING' | 'CONDITIONAL'
  decisionNotes?: string
  reasonCodes: string[]
  decidedAt: string
  membership?: CouncilMembership
}

export interface ApprovalStatus {
  approved: boolean
  rejected: boolean
  pending: boolean
  quorumMet: boolean
  totalApprovals: number
  totalRejections: number
  requiredQuorum: number
  requiresUnanimous: boolean
}

// Council Management
export const councilApi = {
  // List councils
  list: async (params?: {
    status?: string
    orgId?: string
    cursor?: string
    limit?: number
  }) => {
    return api.get<{
      councils: Council[]
      pagination: { limit: number; cursor: string | null }
    }>('/v1/councils', { params })
  },

  // Get council details
  get: async (councilId: string, includeRevoked = false) => {
    return api.get<{ council: Council }>(`/v1/councils/${councilId}`, {
      params: { includeRevoked }
    })
  },

  // Create council (admin only)
  create: async (data: {
    name: string
    description?: string
    quorum?: number
    requireUnanimous?: boolean
  }) => {
    return api.post<{ council: Council }>('/v1/councils', data)
  },

  // Update council (admin only)
  update: async (councilId: string, data: Partial<Council>) => {
    return api.patch<{ council: Council }>(`/v1/councils/${councilId}`, data)
  },

  // Archive council (admin only)
  archive: async (councilId: string) => {
    return api.post<{ council: Council }>(`/v1/councils/${councilId}/archive`)
  },

  // Members
  members: {
    list: async (councilId: string, status?: string) => {
      return api.get<{ members: CouncilMembership[] }>(
        `/v1/councils/${councilId}/members`,
        { params: { status } }
      )
    },

    add: async (councilId: string, data: {
      userId: string
      role: 'CHAIR' | 'PARTNER' | 'OBSERVER'
      notes?: string
    }) => {
      return api.post<{ membership: CouncilMembership }>(
        `/v1/councils/${councilId}/assignments`,
        data
      )
    },

    update: async (councilId: string, membershipId: string, data: {
      role?: string
      notes?: string
    }) => {
      return api.patch<{ membership: CouncilMembership }>(
        `/v1/councils/${councilId}/members/${membershipId}`,
        data
      )
    },

    revoke: async (councilId: string, membershipId: string, notes?: string) => {
      return api.post<{ membership: CouncilMembership }>(
        `/v1/councils/${councilId}/members/${membershipId}/revoke`,
        { notes }
      )
    }
  },

  // Assessment workflow
  assessments: {
    list: async (councilId: string, params?: {
      status?: string
      cursor?: string
      limit?: number
    }) => {
      return api.get(`/v1/councils/${councilId}/assessments`, { params })
    },

    assign: async (assessmentId: string, councilId: string) => {
      return api.post(`/v1/assessments/${assessmentId}/council/assign`, {
        councilId
      })
    },

    unassign: async (assessmentId: string) => {
      return api.delete(`/v1/assessments/${assessmentId}/council/assign`)
    },

    submitDecision: async (assessmentId: string, data: {
      councilId: string
      step: string
      status: 'APPROVED' | 'REJECTED' | 'PENDING' | 'CONDITIONAL'
      notes?: string
      reasonCodes?: string[]
    }) => {
      return api.post<{
        approval: RiskApproval
        approvalStatus: ApprovalStatus
      }>(`/v1/assessments/${assessmentId}/council/decision`, data)
    },

    getApprovals: async (assessmentId: string) => {
      return api.get<{ approvals: RiskApproval[] }>(
        `/v1/assessments/${assessmentId}/council/approvals`
      )
    }
  },

  // Ledger
  ledger: {
    get: async (assessmentId: string, params?: {
      entryType?: string[]
      cursor?: string
      limit?: number
    }) => {
      return api.get(`/v1/assessments/${assessmentId}/ledger`, { params })
    },

    verify: async (assessmentId: string) => {
      return api.post(`/v1/assessments/${assessmentId}/ledger/verify`)
    }
  }
}
```

---

## React Hooks

### 1. useCouncils Hook

Create `hooks/useCouncils.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { councilApi } from '@/lib/api/council'
import { toast } from 'sonner'

export function useCouncils(params?: { status?: string }) {
  return useQuery({
    queryKey: ['councils', params],
    queryFn: () => councilApi.list(params)
  })
}

export function useCouncil(councilId: string) {
  return useQuery({
    queryKey: ['council', councilId],
    queryFn: () => councilApi.get(councilId),
    enabled: !!councilId
  })
}

export function useCreateCouncil() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: councilApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['councils'] })
      toast.success('Council created successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create council')
    }
  })
}

export function useUpdateCouncil(councilId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: any) => councilApi.update(councilId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['council', councilId] })
      queryClient.invalidateQueries({ queryKey: ['councils'] })
      toast.success('Council updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update council')
    }
  })
}
```

### 2. useCouncilMembers Hook

```typescript
export function useCouncilMembers(councilId: string) {
  return useQuery({
    queryKey: ['council-members', councilId],
    queryFn: () => councilApi.members.list(councilId),
    enabled: !!councilId
  })
}

export function useAddMember(councilId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: councilApi.members.add.bind(null, councilId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['council-members', councilId] })
      toast.success('Member added successfully')
    }
  })
}
```

### 3. useAssessmentApproval Hook

```typescript
export function useAssessmentApprovals(assessmentId: string) {
  return useQuery({
    queryKey: ['assessment-approvals', assessmentId],
    queryFn: () => councilApi.assessments.getApprovals(assessmentId),
    enabled: !!assessmentId
  })
}

export function useSubmitDecision(assessmentId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: councilApi.assessments.submitDecision.bind(null, assessmentId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['assessment-approvals', assessmentId] })

      const { approvalStatus } = data
      if (approvalStatus.approved) {
        toast.success('Assessment approved! Quorum met.')
      } else if (approvalStatus.quorumMet) {
        toast.success('Decision submitted. Quorum met.')
      } else {
        toast.success(`Decision submitted. ${approvalStatus.totalApprovals}/${approvalStatus.requiredQuorum} approvals.`)
      }
    }
  })
}
```

---

## UI Components

### 1. CouncilList Component

Create `components/council/CouncilList.tsx`:

```typescript
'use client'

import { useCouncils } from '@/hooks/useCouncils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

export function CouncilList() {
  const { data, isLoading } = useCouncils({ status: 'ACTIVE' })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data?.councils.map((council) => (
        <Link key={council.id} href={`/admin/councils/${council.id}`}>
          <Card className="p-6 hover:border-primary transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg">{council.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {council.description}
                </p>
              </div>
              <Badge variant={council.status === 'ACTIVE' ? 'default' : 'secondary'}>
                {council.status}
              </Badge>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
              <span>Quorum: {council.quorum}</span>
              {council.requireUnanimous && (
                <Badge variant="outline">Unanimous</Badge>
              )}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
```

### 2. ApprovalDecisionForm Component

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { useSubmitDecision } from '@/hooks/useCouncils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ApprovalFormProps {
  assessmentId: string
  councilId: string
  step: string
}

export function ApprovalDecisionForm({ assessmentId, councilId, step }: ApprovalFormProps) {
  const { register, handleSubmit, setValue, watch } = useForm()
  const submitDecision = useSubmitDecision(assessmentId)
  const status = watch('status')

  const onSubmit = (data: any) => {
    submitDecision.mutate({
      councilId,
      step,
      status: data.status,
      notes: data.notes,
      reasonCodes: data.reasonCodes?.split(',').map((c: string) => c.trim()) || []
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Decision</label>
        <Select
          onValueChange={(value) => setValue('status', value)}
          defaultValue="PENDING"
        >
          <SelectTrigger>
            <SelectValue placeholder="Select decision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="APPROVED">Approve</SelectItem>
            <SelectItem value="REJECTED">Reject</SelectItem>
            <SelectItem value="CONDITIONAL">Conditional</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          {...register('notes')}
          placeholder="Explain your decision..."
          rows={4}
        />
      </div>

      {(status === 'REJECTED' || status === 'CONDITIONAL') && (
        <div>
          <label className="text-sm font-medium">Reason Codes</label>
          <input
            {...register('reasonCodes')}
            className="w-full p-2 border rounded"
            placeholder="INSUFFICIENT_CONTROLS, MISSING_DOCUMENTATION"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma-separated reason codes
          </p>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitDecision.isPending}
        className="w-full"
      >
        {submitDecision.isPending ? 'Submitting...' : 'Submit Decision'}
      </Button>
    </form>
  )
}
```

### 3. ApprovalStatusBadge Component

```typescript
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react'

interface ApprovalStatusProps {
  status: ApprovalStatus
}

export function ApprovalStatusBadge({ status }: ApprovalStatusProps) {
  if (status.approved) {
    return (
      <Badge variant="default" className="bg-green-500">
        <CheckCircle2 className="h-4 w-4 mr-1" />
        Approved ({status.totalApprovals}/{status.requiredQuorum})
      </Badge>
    )
  }

  if (status.rejected) {
    return (
      <Badge variant="destructive">
        <XCircle className="h-4 w-4 mr-1" />
        Rejected
      </Badge>
    )
  }

  if (status.quorumMet) {
    return (
      <Badge variant="secondary">
        <AlertCircle className="h-4 w-4 mr-1" />
        Quorum Met ({status.totalApprovals}/{status.requiredQuorum})
      </Badge>
    )
  }

  return (
    <Badge variant="outline">
      <Clock className="h-4 w-4 mr-1" />
      Pending ({status.totalApprovals}/{status.requiredQuorum})
    </Badge>
  )
}
```

---

## Page Structure

### 1. Admin Council Management Page

Create `app/admin/councils/page.tsx`:

```typescript
import { CouncilList } from '@/components/council/CouncilList'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export default function CouncilsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">AI Risk Councils</h1>
          <p className="text-muted-foreground mt-2">
            Manage governance bodies for risk assessment review
          </p>
        </div>
        <Link href="/admin/councils/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Council
          </Button>
        </Link>
      </div>

      <CouncilList />
    </div>
  )
}
```

### 2. Council Detail Page

Create `app/admin/councils/[councilId]/page.tsx`:

```typescript
'use client'

import { useCouncil, useCouncilMembers } from '@/hooks/useCouncils'
import { ApprovalStatusBadge } from '@/components/council/ApprovalStatusBadge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function CouncilDetailPage({
  params
}: {
  params: { councilId: string }
}) {
  const { data: councilData } = useCouncil(params.councilId)
  const { data: membersData } = useCouncilMembers(params.councilId)

  const council = councilData?.council

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{council?.name}</h1>
        <p className="text-muted-foreground mt-2">{council?.description}</p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card className="p-6">
            {/* Member management UI */}
          </Card>
        </TabsContent>

        <TabsContent value="assessments">
          <Card className="p-6">
            {/* Assigned assessments list */}
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="p-6">
            {/* Council settings */}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### 3. Assessment Review Page (Council Member View)

Create `app/review/[assessmentId]/council/page.tsx`:

```typescript
'use client'

import { useAssessmentApprovals } from '@/hooks/useCouncils'
import { ApprovalDecisionForm } from '@/components/council/ApprovalDecisionForm'
import { ApprovalStatusBadge } from '@/components/council/ApprovalStatusBadge'
import { Card } from '@/components/ui/card'

export default function CouncilReviewPage({
  params
}: {
  params: { assessmentId: string }
}) {
  const { data } = useAssessmentApprovals(params.assessmentId)

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Council Review</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Submit Decision</h2>
          <ApprovalDecisionForm
            assessmentId={params.assessmentId}
            councilId="council_id" // From assessment data
            step="final_review"
          />
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Approval History</h2>
          <div className="space-y-4">
            {data?.approvals.map((approval) => (
              <div key={approval.id} className="border-l-4 border-primary pl-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {approval.membership?.user?.name}
                  </span>
                  <ApprovalStatusBadge status={approval.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {approval.decisionNotes}
                </p>
                <span className="text-xs text-muted-foreground">
                  {new Date(approval.decidedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
```

---

## Error Handling

### Error Boundary

```typescript
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export function CouncilErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Council error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        {error.message || 'An error occurred while loading council data.'}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
```

---

## Best Practices

### 1. Permission Checks

```typescript
function canManageCouncil(user: User): boolean {
  return user.role === 'admin'
}

function canSubmitDecision(user: User, councilId: string): boolean {
  const allowedRoles = ['admin', 'council_chair', 'council_partner']
  return allowedRoles.includes(user.role)
}

// Usage in component
{canManageCouncil(user) && (
  <Button onClick={createCouncil}>Create Council</Button>
)}
```

### 2. Optimistic Updates

```typescript
export function useAddMember(councilId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: councilApi.members.add.bind(null, councilId),
    onMutate: async (newMember) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['council-members', councilId]
      })

      // Snapshot previous value
      const previousMembers = queryClient.getQueryData(['council-members', councilId])

      // Optimistically update
      queryClient.setQueryData(['council-members', councilId], (old: any) => ({
        ...old,
        members: [...(old?.members || []), { ...newMember, id: 'temp' }]
      }))

      return { previousMembers }
    },
    onError: (err, newMember, context) => {
      // Rollback on error
      queryClient.setQueryData(
        ['council-members', councilId],
        context?.previousMembers
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['council-members', councilId] })
    }
  })
}
```

### 3. Loading States

```typescript
function CouncilDetail({ councilId }: { councilId: string }) {
  const { data, isLoading, error } = useCouncil(councilId)

  if (isLoading) {
    return <CouncilDetailSkeleton />
  }

  if (error) {
    return <ErrorState error={error} />
  }

  return <CouncilContent council={data.council} />
}
```

### 4. Real-time Updates

```typescript
// Poll for approval status updates
export function useApprovalStatus(assessmentId: string) {
  return useQuery({
    queryKey: ['approval-status', assessmentId],
    queryFn: () => councilApi.assessments.getApprovals(assessmentId),
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: true
  })
}
```

---

## Testing

### Unit Tests

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApprovalDecisionForm } from './ApprovalDecisionForm'

describe('ApprovalDecisionForm', () => {
  it('submits decision successfully', async () => {
    const queryClient = new QueryClient()
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <ApprovalDecisionForm
          assessmentId="test-assessment"
          councilId="test-council"
          step="final_review"
        />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Approve'))
    await user.type(screen.getByPlaceholderText('Explain your decision...'), 'All controls verified')
    await user.click(screen.getByText('Submit Decision'))

    await waitFor(() => {
      expect(screen.getByText('Decision submitted')).toBeInTheDocument()
    })
  })
})
```

---

## Summary

This integration guide provides:
- ✅ Type-safe API client
- ✅ React Query hooks for data fetching
- ✅ Reusable UI components
- ✅ Complete page examples
- ✅ Error handling patterns
- ✅ Best practices for permissions, optimistic updates, and testing

For additional help, refer to:
- [Council API Reference](./COUNCIL_API_REFERENCE.md)
- [Test Results](../COUNCIL_API_TEST_RESULTS.md)
- [Implementation Guide](../COUNCIL_API_IMPLEMENTATION.md)
