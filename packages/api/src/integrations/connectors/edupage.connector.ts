import type { ConnectorPullResult, PartnerConnectorConfig } from './types'

/** EduPage dan telefon raqamini ajratish (maydon nomi maktabga qarab farq qiladi) */
function pickPhone(student: Record<string, unknown>, field?: string): string | null {
  const keys = field
    ? [field]
    : ['phone', 'mobile', 'telefon', 'phoneNumber', 'tel', 'contact']
  for (const k of keys) {
    const v = student[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/**
 * EduPage connector — `edupage-api` npm orqali (rasmiy API emas).
 * Telefoni yo'q o'quvchilar o'tkazib yuboriladi; ERP da telefon to'ldirilgan bo'lishi kerak.
 */
export async function pullEdupage(config: PartnerConnectorConfig): Promise<ConnectorPullResult> {
  const cfg = config.edupage
  if (!cfg?.username || !cfg.password || !cfg.school_subdomain) {
    throw new Error('edupage config requires username, password, school_subdomain')
  }

  let Edupage: new () => {
    login(u: string, p: string): Promise<unknown>
    students?: Array<Record<string, unknown>>
    teachers?: Array<Record<string, unknown>>
    classes?: Array<Record<string, unknown>>
  }

  try {
    const mod = await import('edupage-api')
    Edupage = (mod as { Edupage: typeof Edupage }).Edupage
  } catch {
    throw new Error('edupage-api package not installed on server')
  }

  const edupage = new Edupage()
  await edupage.login(cfg.username, cfg.password)

  const result: ConnectorPullResult = { staff: [], groups: [], learners: [], warnings: [] }

  const teachers = edupage.teachers ?? []
  const teacherIdByName = new Map<string, string>()

  for (const t of teachers) {
    const externalId = String(t.id ?? t.username ?? t.fullname ?? '').trim()
    if (!externalId) continue
    const phone = pickPhone(t, 'phone') ?? pickPhone(t, 'mobile')
    if (!phone) {
      result.warnings.push(`Teacher ${externalId} skipped — no phone`)
      continue
    }
    const name = String(t.fullname ?? t.name ?? '').trim()
    const parts = name.split(/\s+/)
    result.staff.push({
      external_id: externalId,
      phone,
      first_name: parts[0],
      last_name: parts.slice(1).join(' ') || undefined,
      role: 'teacher',
      status: 'active',
    })
    if (name) teacherIdByName.set(name.toLowerCase(), externalId)
  }

  const classes = edupage.classes ?? []
  for (const cls of classes) {
    const externalId = String(cls.id ?? cls.name ?? '').trim()
    if (!externalId) continue
    const teacherName = String(cls.teacher ?? cls.classTeacher ?? '').toLowerCase()
    result.groups.push({
      external_id: externalId,
      name: String(cls.name ?? externalId),
      teacher_external_id: teacherIdByName.get(teacherName),
      status: 'active',
    })
  }

  const students = edupage.students ?? []
  for (const s of students) {
    const externalId = String(s.id ?? s.number ?? s.username ?? '').trim()
    if (!externalId) continue
    const phone = pickPhone(s, cfg.student_phone_field)
    if (!phone) {
      result.warnings.push(`Student ${externalId} skipped — no phone in EduPage`)
      continue
    }
    const classRef = s.class as Record<string, unknown> | undefined
    const classId = String(s.classId ?? classRef?.id ?? s.classname ?? '').trim()
    const name = String(s.fullname ?? s.name ?? '').trim()
    const parts = name.split(/\s+/)
    result.learners.push({
      external_id: externalId,
      phone,
      first_name: parts[0],
      last_name: parts.slice(1).join(' ') || undefined,
      status: 'active',
      group: classId ? { external_id: classId } : undefined,
    })
  }

  return result
}
