import type {
  ConnectorType,
  IntegrationGroupInput,
  IntegrationLearnerInput,
  IntegrationStaffInput,
} from '@wordswipe/shared'

export interface ConnectorPullResult {
  staff: IntegrationStaffInput[]
  groups: IntegrationGroupInput[]
  learners: IntegrationLearnerInput[]
  warnings: string[]
}

export interface GenericRestConnectorConfig {
  staff_url?: string
  groups_url?: string
  learners_url?: string
  /** Single URL returning { staff?, groups?, learners? } */
  bundle_url?: string
  auth_header?: string
}

export interface EdupageConnectorConfig {
  username: string
  password: string
  /** e.g. "schoolname" from schoolname.edupage.org */
  school_subdomain: string
  /** Optional JSON field on EduPage student for phone, e.g. "mobile" */
  student_phone_field?: string
}

export interface PartnerConnectorConfig {
  connector?: ConnectorType
  generic_rest?: GenericRestConnectorConfig
  edupage?: EdupageConnectorConfig
}

export interface ErpConnector {
  type: ConnectorType
  pull(config: PartnerConnectorConfig): Promise<ConnectorPullResult>
}
