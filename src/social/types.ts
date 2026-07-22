import type { GuestMessage } from '../shared/social/guestbook'

export type SoundRecipe = Record<string, number | string | boolean | number[] | string[]>

export interface SoundWork {
  id: string
  createdAt: number
  audioUrl: string
  durationMs: number
  visualSeed: number
  recipe: SoundRecipe
}

export interface SoundSocialSave {
  works: SoundWork[]
  likes: string[]
  messages?: GuestMessage[]
}

export interface SoundWallEntry {
  userId: string
  userName?: string
  userAvatarUrl?: string
  work: SoundWork
}

