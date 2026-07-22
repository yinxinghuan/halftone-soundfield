import { useCallback, useEffect, useMemo, useState } from 'react'
import { callAigramAPI, isInAigram, type AigramResponse } from '../shared/runtime'
import { getGameUuid } from '../shared/runtime/game-id'
import { messagesByTarget, type GuestMessage } from '../shared/social/guestbook'
import type { SoundSocialSave, SoundWallEntry, SoundWork } from './types'

interface SaveRow { user_id: string; resource_data: string }
interface ProfileData { name?: string; head_url?: string }

export function useSoundWall(mine: SoundWork[]) {
  const [serverEntries, setServerEntries] = useState<SoundWallEntry[]>([])
  const [likesByWork, setLikesByWork] = useState<Map<string, Set<string>>>(new Map())
  const [notesByWork, setNotesByWork] = useState<Map<string, GuestMessage[]>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const sessionId = getGameUuid()

  const entries = useMemo(() => {
    const seen = new Set<string>()
    const optimistic: SoundWallEntry[] = mine.map(work => ({ userId: 'self', userName: '你', work }))
    return [...optimistic, ...serverEntries]
      .filter(entry => {
        if (seen.has(entry.work.id)) return false
        seen.add(entry.work.id)
        return true
      })
      .sort((a, b) => b.work.createdAt - a.work.createdAt)
      .slice(0, 24)
  }, [mine, serverEntries])

  const refresh = useCallback(async () => {
    if (!isInAigram || !sessionId) { setLoaded(true); return }
    try {
      const response = await callAigramAPI<AigramResponse<SaveRow[]>>(
        `/note/aigram/ai/game/get/data/list?session_id=${encodeURIComponent(sessionId)}`,
        'GET',
      )
      const rows = Array.isArray(response?.data) ? response.data : []
      const pairs: Array<{ userId: string; work: SoundWork }> = []
      const likes = new Map<string, Set<string>>()
      for (const row of rows) {
        if (!row.user_id || !row.resource_data) continue
        try {
          const save = JSON.parse(row.resource_data) as SoundSocialSave
          for (const work of save.works || []) {
            if (work?.id && work.audioUrl) pairs.push({ userId: row.user_id, work })
          }
          for (const workId of save.likes || []) {
            if (!likes.has(workId)) likes.set(workId, new Set())
            likes.get(workId)!.add(row.user_id)
          }
        } catch { /* skip corrupt rows */ }
      }
      pairs.sort((a, b) => b.work.createdAt - a.work.createdAt)
      const limited = pairs.slice(0, 24)
      const notes = messagesByTarget(rows)
      const ids = new Set(limited.map(pair => pair.userId))
      for (const messages of notes.values()) for (const message of messages) if (message.fromUserId) ids.add(message.fromUserId)
      const profiles = await Promise.all([...ids].map(async userId => {
        try {
          const profile = await callAigramAPI<AigramResponse<ProfileData>>(
            `/note/telegram/user/get/info/by/telegram_id?telegram_id=${encodeURIComponent(userId)}`,
            'GET',
          )
          return [userId, profile?.data ?? null] as const
        } catch { return [userId, null] as const }
      }))
      const profileMap = new Map(profiles)
      setServerEntries(limited.map(({ userId, work }) => {
        const profile = profileMap.get(userId)
        return { userId, userName: profile?.name, userAvatarUrl: profile?.head_url, work }
      }))
      const stamped = new Map<string, GuestMessage[]>()
      for (const [target, messages] of notes) {
        stamped.set(target, messages.map(message => {
          const profile = message.fromUserId ? profileMap.get(message.fromUserId) : null
          return { ...message, userName: profile?.name, userAvatarUrl: profile?.head_url }
        }))
      }
      setLikesByWork(likes); setNotesByWork(stamped)
    } catch { /* keep stale wall visible */ }
    finally { setLoaded(true) }
  }, [sessionId])

  useEffect(() => { void refresh() }, [refresh])
  return { entries, likesByWork, notesByWork, loaded, refresh }
}

