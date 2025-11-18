/**
 * AI Risk Council - Common Types
 * Shared types across all Council API modules
 */

export enum AICouncilModule {
  POLICY_ENGINE = 'ai-council-policy-engine',
  VENDOR_GOVERNANCE = 'ai-council-vendor-governance',
  AUTOMATED_ASSESSMENT = 'ai-council-automated-assessment',
}

export interface PaginationParams {
  limit?: number
  offset?: number
}

export interface PaginationResponse {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export enum PolicyCategory {
  DATA_PRIVACY = 'DATA_PRIVACY',
  DATA_SECURITY = 'DATA_SECURITY',
  COMPLIANCE = 'COMPLIANCE',
  GOVERNANCE = 'GOVERNANCE',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  VENDOR_MANAGEMENT = 'VENDOR_MANAGEMENT',
  INCIDENT_RESPONSE = 'INCIDENT_RESPONSE',
  ACCESS_CONTROL = 'ACCESS_CONTROL',
}

export enum PolicyStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED',
  ARCHIVED = 'ARCHIVED',
}

export enum PolicySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum PolicyType {
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  SECURITY_AUDIT = 'SECURITY_AUDIT',
  DATA_GOVERNANCE = 'DATA_GOVERNANCE',
  VENDOR_RISK = 'VENDOR_RISK',
}

export enum PolicyScope {
  GLOBAL = 'GLOBAL',
  JURISDICTION = 'JURISDICTION',
  INDUSTRY = 'INDUSTRY',
  CUSTOM = 'CUSTOM',
}

export enum EnforcementMode {
  ALERT = 'ALERT',
  WARN = 'WARN',
  PREVENT = 'PREVENT',
}

export enum ConditionOperator {
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
}

export enum ComparisonOperator {
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  CONTAINS = 'CONTAINS',
  NOT_CONTAINS = 'NOT_CONTAINS',
  CONTAINS_ANY = 'CONTAINS_ANY',
  CONTAINS_ALL = 'CONTAINS_ALL',
  REGEX_MATCH = 'REGEX_MATCH',
  GREATER_THAN = 'GREATER_THAN',
  LESS_THAN = 'LESS_THAN',
  GREATER_EQUAL = 'GREATER_EQUAL',
  LESS_EQUAL = 'LESS_EQUAL',
  IN = 'IN',
  NOT_IN = 'NOT_IN',
  EXISTS = 'EXISTS',
  NOT_EXISTS = 'NOT_EXISTS',
}

export interface PolicyCondition {
  field: string
  operator: ComparisonOperator
  value?: string | string[] | number | boolean
}

export interface PolicyConditionGroup {
  operator: ConditionOperator
  conditions: (PolicyCondition | PolicyConditionGroup)[]
}

export enum NotificationChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  DASHBOARD = 'dashboard',
}

export interface NotificationAction {
  type: 'notify'
  channels: NotificationChannel[]
  recipients?: string[]
  webhookUrl?: string
}

export interface BlockAction {
  type: 'block'
  message: string
  autoRemediateAfterHours?: number
}

export interface RemediateAction {
  type: 'remediate'
  action: string
  parameters?: Record<string, any>
}

export type PolicyAction = NotificationAction | BlockAction | RemediateAction

export interface PolicyActions {
  onViolation: PolicyAction[]
  onApproval?: PolicyAction[]
}

export enum ViolationStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
  APPEALED = 'APPEALED',
}

export interface Violation {
  id: string
  policyId: string
  assessmentId?: string
  vendorId?: string
  status: ViolationStatus
  severity: PolicySeverity
  detectedAt: string
  resolvedAt?: string
  description: string
  evidence?: Record<string, any>
}

export enum VendorStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  UNDER_REVIEW = 'UNDER_REVIEW',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export enum AssessmentType {
  SECURITY = 'SECURITY',
  COMPLIANCE = 'COMPLIANCE',
  OPERATIONAL = 'OPERATIONAL',
  FINANCIAL = 'FINANCIAL',
  CUSTOM = 'CUSTOM',
}

export enum AssessmentStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ScheduleFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY',
}

export interface CouncilError {
  error: string
  details: string
  statusCode: number
  field?: string
  upgradeUrl?: string
}

export interface CouncilSuccess<T> {
  success: true
  data: T
}

export type CouncilResponse<T> = CouncilSuccess<T> | CouncilError

export interface FeatureLimitInfo {
  feature: string
  limit: number
  used: number
  remaining: number
  upgradeUrl: string
}

export interface ModuleStatus {
  module: AICouncilModule
  enabled: boolean
  limits: FeatureLimitInfo[]
}

export interface CouncilStatus {
  timestamp: string
  modules: ModuleStatus[]
  dbHealth: 'healthy' | 'degraded' | 'unhealthy'
}
