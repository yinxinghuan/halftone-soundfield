import React from 'react'
import { createRoot } from 'react-dom/client'
import SoundWall from '../src/social/SoundWall'
import type { SoundWallEntry } from '../src/social/types'

const host = document.createElement('div')
host.id = 'optimistic-wall-qa'
document.body.append(host)

const entry: SoundWallEntry = {
  userId: 'self',
  userName: '你',
  work: {
    id: 'just-published',
    createdAt: Date.now(),
    audioUrl: 'data:audio/wav;base64,UklGRg==',
    durationMs: 5000,
    visualSeed: 27,
    recipe: { bounce: 66, pitch: 58, space: 46 },
  },
}

createRoot(host).render(<SoundWall mode="boing" entries={[entry]} loaded={false} likesByWork={new Map()} notesByWork={new Map()} myLikes={[]} myMessages={[]} onClose={() => {}} onToggleLike={() => {}} onSendMessage={() => {}} />)
