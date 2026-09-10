import { prisma } from '../lib/prisma'
import type { Difficulty } from '@wordswipe/shared'

export type MediaKind = 'cinema' | 'shadowing'
export type PlaylistType = 'cinema' | 'shadowing' | 'mixed'

export class PlaylistNotFoundError extends Error {
  constructor() {
    super('Playlist not found')
    this.name = 'PlaylistNotFoundError'
  }
}

export interface PlaylistItemDTO {
  id: string
  kind: MediaKind
  clipId: string
  order: number
  title: string | null
  level: Difficulty | null
  durationSec: number | null
  completed: boolean
  /** False when the referenced clip no longer exists / isn't visible. */
  available: boolean
}

export interface PlaylistDTO {
  id: string
  title: string
  description: string | null
  coverUrl: string | null
  type: PlaylistType
  level: Difficulty | null
  isPublished: boolean
  order: number
  itemCount: number
  /** True when a teacher has assigned this playlist to one of the learner's groups. */
  assigned?: boolean
  items?: PlaylistItemDTO[]
}

function toDTO(p: any, items?: PlaylistItemDTO[], assigned = false): PlaylistDTO {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? null,
    coverUrl: p.coverUrl ?? null,
    type: p.type,
    level: (p.level as Difficulty | null) ?? null,
    isPublished: p.isPublished,
    order: p.order,
    itemCount: items?.length ?? p._count?.items ?? p.items?.length ?? 0,
    assigned,
    items,
  }
}

/** Playlist IDs a teacher has assigned to any of the learner's active groups. */
async function assignedPlaylistIds(userId: string): Promise<Set<string>> {
  const enrollments = await prisma.integrationEnrollment.findMany({
    where: { userId, status: 'active', groupExternalId: { not: null } },
    select: { partnerId: true, groupExternalId: true },
  })
  if (!enrollments.length) return new Set()

  const assignments = await prisma.teacherPlaylistAssignment.findMany({
    where: {
      OR: enrollments.map((e) => ({
        partnerId: e.partnerId,
        groupExternalId: e.groupExternalId!,
      })),
    },
    select: { playlistId: true },
  })
  return new Set(assignments.map((a) => a.playlistId))
}

/**
 * Resolve playlist items to clip summaries. For cinema, only include clips the
 * user may view (global, or uploaded by them). Shadowing must be published.
 */
async function resolveItems(
  userId: string | null,
  rawItems: Array<{ id: string; kind: MediaKind; clipId: string; order: number }>,
): Promise<PlaylistItemDTO[]> {
  const cinemaIds = rawItems.filter((i) => i.kind === 'cinema').map((i) => i.clipId)
  const shadowingIds = rawItems.filter((i) => i.kind === 'shadowing').map((i) => i.clipId)

  const [cinemaClips, shadowingClips, cinemaDone, shadowingDone] = await Promise.all([
    cinemaIds.length
      ? prisma.cinemaClip.findMany({ where: { id: { in: cinemaIds } } })
      : Promise.resolve([]),
    shadowingIds.length
      ? prisma.shadowingClip.findMany({ where: { id: { in: shadowingIds } } })
      : Promise.resolve([]),
    userId && cinemaIds.length
      ? prisma.cinemaCompletion.findMany({ where: { userId, clipId: { in: cinemaIds } } })
      : Promise.resolve([]),
    userId && shadowingIds.length
      ? prisma.shadowingCompletion.findMany({ where: { userId, clipId: { in: shadowingIds } } })
      : Promise.resolve([]),
  ])

  const cinemaById = new Map(cinemaClips.map((c) => [c.id, c]))
  const shadowingById = new Map(shadowingClips.map((c) => [c.id, c]))
  const cinemaDoneSet = new Set(cinemaDone.map((c) => c.clipId))
  const shadowingDoneSet = new Set(shadowingDone.map((c) => c.clipId))

  return rawItems.map((it) => {
    if (it.kind === 'cinema') {
      const clip = cinemaById.get(it.clipId)
      const visible = !!clip && (clip.visibility === 'global' || clip.uploadedByUserId === userId)
      return {
        id: it.id,
        kind: it.kind,
        clipId: it.clipId,
        order: it.order,
        title: clip?.title ?? null,
        level: (clip?.level as Difficulty | null) ?? null,
        durationSec: clip?.durationSec ?? null,
        completed: cinemaDoneSet.has(it.clipId),
        available: visible,
      }
    }
    const clip = shadowingById.get(it.clipId)
    return {
      id: it.id,
      kind: it.kind,
      clipId: it.clipId,
      order: it.order,
      title: clip?.title ?? null,
      level: (clip?.level as Difficulty | null) ?? null,
      durationSec: clip?.durationSec ?? null,
      completed: shadowingDoneSet.has(it.clipId),
      available: !!clip && clip.isPublished,
    }
  })
}

// ---------------------------------------------------------------------------
// Learner-facing
// ---------------------------------------------------------------------------

export async function listPlaylists(userId: string): Promise<PlaylistDTO[]> {
  const [playlists, assignedIds] = await Promise.all([
    prisma.mediaPlaylist.findMany({
      where: { isPublished: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { items: true } } },
    }),
    assignedPlaylistIds(userId),
  ])
  // Teacher-assigned playlists float to the top so students see them first.
  return playlists
    .map((p) => toDTO(p, undefined, assignedIds.has(p.id)))
    .sort((a, b) => Number(b.assigned) - Number(a.assigned))
}

export async function getPlaylist(userId: string, id: string): Promise<PlaylistDTO> {
  const playlist = await prisma.mediaPlaylist.findFirst({
    where: { id, isPublished: true },
    include: { items: { orderBy: { order: 'asc' } } },
  })
  if (!playlist) throw new PlaylistNotFoundError()
  const items = await resolveItems(userId, playlist.items as any)
  return toDTO(playlist, items)
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminListPlaylists(): Promise<PlaylistDTO[]> {
  const playlists = await prisma.mediaPlaylist.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    include: { _count: { select: { items: true } } },
  })
  return playlists.map((p) => toDTO(p))
}

export async function adminGetPlaylist(id: string): Promise<PlaylistDTO> {
  const playlist = await prisma.mediaPlaylist.findUnique({
    where: { id },
    include: { items: { orderBy: { order: 'asc' } } },
  })
  if (!playlist) throw new PlaylistNotFoundError()
  const items = await resolveItems(null, playlist.items as any)
  return toDTO(playlist, items)
}

export async function adminCreatePlaylist(input: {
  title: string
  description?: string | null
  coverUrl?: string | null
  type?: PlaylistType
  level?: Difficulty | null
  isPublished?: boolean
  order?: number
}): Promise<PlaylistDTO> {
  const created = await prisma.mediaPlaylist.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      coverUrl: input.coverUrl ?? null,
      type: input.type ?? 'mixed',
      level: input.level ?? null,
      isPublished: input.isPublished ?? true,
      order: input.order ?? 0,
    },
    include: { _count: { select: { items: true } } },
  })
  return toDTO(created)
}

export async function adminUpdatePlaylist(
  id: string,
  input: {
    title?: string
    description?: string | null
    coverUrl?: string | null
    type?: PlaylistType
    level?: Difficulty | null
    isPublished?: boolean
    order?: number
  },
): Promise<PlaylistDTO> {
  const exists = await prisma.mediaPlaylist.findUnique({ where: { id } })
  if (!exists) throw new PlaylistNotFoundError()
  const updated = await prisma.mediaPlaylist.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.level !== undefined ? { level: input.level } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
    },
    include: { _count: { select: { items: true } } },
  })
  return toDTO(updated)
}

export async function adminDeletePlaylist(id: string): Promise<void> {
  const exists = await prisma.mediaPlaylist.findUnique({ where: { id } })
  if (!exists) throw new PlaylistNotFoundError()
  await prisma.mediaPlaylist.delete({ where: { id } })
}

/** Replace the full ordered item list in one shot (simplest reorder/add/remove). */
export async function adminSetItems(
  id: string,
  items: Array<{ kind: MediaKind; clipId: string }>,
): Promise<PlaylistDTO> {
  const playlist = await prisma.mediaPlaylist.findUnique({ where: { id } })
  if (!playlist) throw new PlaylistNotFoundError()

  await prisma.$transaction([
    prisma.mediaPlaylistItem.deleteMany({ where: { playlistId: id } }),
    ...(items.length
      ? [
          prisma.mediaPlaylistItem.createMany({
            data: items.map((it, idx) => ({
              playlistId: id,
              kind: it.kind,
              clipId: it.clipId,
              order: idx,
            })),
          }),
        ]
      : []),
  ])

  return adminGetPlaylist(id)
}
