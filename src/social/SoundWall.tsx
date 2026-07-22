import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { isInAigram, openAigramProfile } from '../shared/runtime'
import { threadFor, timeAgo, type GuestMessage } from '../shared/social/guestbook'
import type { SoundWallEntry } from './types'
import './sound-wall.less'

type Mode = 'bloom' | 'boing'
type Props = {
  mode: Mode
  entries: SoundWallEntry[]
  loaded: boolean
  likesByWork: Map<string, Set<string>>
  notesByWork: Map<string, GuestMessage[]>
  myLikes: string[]
  myMessages?: GuestMessage[]
  myUserId?: string
  onClose: () => void
  onToggleLike: (entry: SoundWallEntry) => void
  onSendMessage: (entry: SoundWallEntry, text: string) => void
}

const wallCopy = {
  zh: { bloomTitle: '多人声音植物园', boingTitle: '声音标本盒', intro: '听见别人留下的声音，也给喜欢的作品留一句话。', platform: '在 Aigram 中打开，才可以发布、点赞和留言。', loading: '正在打开声音墙…', empty: '这里还很安静。发布第一件声音作品吧。', you: '你', yours: '你的作品', player: '声音玩家', close: '关闭作品墙', detail: '声音作品详情', pause: '暂停预览', play: '播放预览', pauseSound: '暂停声音', playSound: '播放 5 秒声音', liked: '已喜欢', like: '喜欢', notes: '留言', noNotes: '还没有留言。', placeholder: '留一句话…', send: '发送留言', closeDetail: '关闭详情' },
  en: { bloomTitle: 'Community Sound Garden', boingTitle: 'Sound Specimen Boxes', intro: 'Hear what others made and leave a note on sounds you love.', platform: 'Open in Aigram to publish, like, and leave notes.', loading: 'Opening the sound wall…', empty: 'It is quiet here. Publish the first sound.', you: 'You', yours: 'Your work', player: 'Sound maker', close: 'Close sound wall', detail: 'Sound work details', pause: 'Pause preview', play: 'Play preview', pauseSound: 'Pause sound', playSound: 'Play 5-second sound', liked: 'Liked', like: 'Like', notes: 'Notes', noNotes: 'No notes yet.', placeholder: 'Leave a note…', send: 'Send note', closeDetail: 'Close details' },
}

function Icon({ name }: { name: 'close' | 'play' | 'pause' | 'heart' | 'note' | 'send' }) {
  const paths = {
    close: <path d="M6 6l12 12M18 6 6 18"/>,
    play: <path fill="currentColor" stroke="none" d="M8 5.5v13l10-6.5z"/>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    heart: <path d="M20.8 5.8c-2-2-5.2-1.7-6.8.5L12 9 10 6.3C8.4 4.1 5.2 3.8 3.2 5.8c-2.1 2.2-1.8 5.8.5 7.8L12 21l8.3-7.4c2.3-2 2.6-5.6.5-7.8z"/>,
    note: <><path d="M5 5h14v11H9l-4 3z"/><path d="M8 9h8M8 12h5"/></>,
    send: <path d="M4 12 20 4l-5 16-3-6zM12 14l8-10"/>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function Artwork({ entry, mode, active }: { entry: SoundWallEntry; mode: Mode; active: boolean }) {
  const seed = entry.work.visualSeed
  if (mode === 'boing') {
    const pitch = Number(entry.work.recipe.pitch ?? 50)
    return <div className={`sw__boxArt ${active ? 'is-playing' : ''}`} style={{ '--box-turn': `${(seed % 17) - 8}deg`, '--box-scale': (.92 + pitch / 700).toFixed(2) } as CSSProperties}><i/><i/><i/><i/><i/><i/><i/></div>
  }
  const amounts = ['crystal', 'ocean', 'pulse', 'garden', 'crystal'].map(key => Number(entry.work.recipe[key] ?? 50))
  return <div className={`sw__gardenArt ${active ? 'is-playing' : ''}`}>{amounts.map((amount, index) => {
    const height = 42 + ((seed + index * 29 + amount) % 55)
    const bloom = 27 + Math.round(amount / 8)
    return <i key={index} style={{ height: `${height}px`, '--turn': `${(seed + index * 37) % 360}deg` } as CSSProperties}><span style={{ width: `${bloom}px`, height: `${bloom}px`, top: `${-bloom / 2}px` }}/></i>
  })}</div>
}

function Avatar({ entry }: { entry: SoundWallEntry }) {
  const letter = (entry.userName || '?').slice(0, 1).toUpperCase()
  return <span className="sw__avatar" aria-hidden>{entry.userAvatarUrl ? <img src={entry.userAvatarUrl} alt="" draggable={false}/> : <span>{letter}</span>}</span>
}

export default function SoundWall(props: Props) {
  const { mode, entries, loaded, likesByWork, notesByWork, myLikes, myMessages, myUserId } = props
  const [selected, setSelected] = useState<SoundWallEntry | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const locale = localStorage.getItem('game_locale') === 'en' || (!localStorage.getItem('game_locale') && !navigator.language.toLowerCase().startsWith('zh')) ? 'en' : 'zh'
  const copy = wallCopy[locale]
  const thread = useMemo(() => selected ? threadFor(selected.work.id, notesByWork, myMessages, myUserId) : [], [selected, notesByWork, myMessages, myUserId])

  function toggleAudio(entry: SoundWallEntry) {
    const audio = audioRef.current
    if (!audio) return
    if (activeId === entry.work.id && !audio.paused) { audio.pause(); setActiveId(null); return }
    audio.src = entry.work.audioUrl; void audio.play(); setActiveId(entry.work.id)
  }

  function author(entry: SoundWallEntry, compact = false) {
    const self = entry.userId === 'self' || (!!myUserId && entry.userId === myUserId)
    if (self) return <span className="sw__author sw__author--self">{compact ? copy.you : copy.yours}</span>
    return <button className="sw__author" onClick={event => { event.stopPropagation(); if (isInAigram) openAigramProfile(entry.userId) }} disabled={!isInAigram}><Avatar entry={entry}/><span>{entry.userName || copy.player}</span></button>
  }

  return <section className={`sw sw--${mode}`} aria-label={mode === 'bloom' ? copy.bloomTitle : copy.boingTitle}>
    <audio ref={audioRef} onEnded={() => setActiveId(null)}/>
    <header className="sw__top"><div><p>COMMUNITY SOUNDS</p><h2>{mode === 'bloom' ? copy.bloomTitle : copy.boingTitle}</h2></div><button onClick={props.onClose} aria-label={copy.close}><Icon name="close"/></button></header>
    <p className="sw__intro">{copy.intro}</p>
    {!isInAigram && <p className="sw__platformNote">{copy.platform}</p>}
    <div className="sw__feed">
      {!loaded && <p className="sw__empty">{copy.loading}</p>}
      {loaded && !entries.length && <p className="sw__empty">{copy.empty}</p>}
      {entries.map(entry => {
        const likes = likesByWork.get(entry.work.id)?.size ?? 0
        const liked = myLikes.includes(entry.work.id)
        const notes = notesByWork.get(entry.work.id)?.length ?? 0
        return <article className="sw__card" key={entry.work.id} onClick={() => { setSelected(entry); setDraft('') }}>
          <Artwork entry={entry} mode={mode} active={activeId === entry.work.id}/>
          <div className="sw__cardBody"><div>{author(entry)}<time>{timeAgo(entry.work.createdAt, locale)}</time></div><div className="sw__cardActions"><button onClick={event => { event.stopPropagation(); toggleAudio(entry) }} aria-label={activeId === entry.work.id ? copy.pause : copy.play}><Icon name={activeId === entry.work.id ? 'pause' : 'play'}/></button><span className={liked ? 'is-active' : ''}><Icon name="heart"/>{likes + (liked && !likesByWork.get(entry.work.id)?.has(myUserId || 'self') ? 1 : 0)}</span><span><Icon name="note"/>{notes}</span></div></div>
        </article>
      })}
    </div>
    {selected && <div className="sw__backdrop" onClick={() => setSelected(null)}><section className="sw__detail" role="dialog" aria-modal="true" aria-label={copy.detail} onClick={event => event.stopPropagation()}>
      <header>{author(selected)}<button onClick={() => setSelected(null)} aria-label={copy.closeDetail}><Icon name="close"/></button></header>
      <Artwork entry={selected} mode={mode} active={activeId === selected.work.id}/>
      <div className="sw__detailActions"><button onClick={() => toggleAudio(selected)}><Icon name={activeId === selected.work.id ? 'pause' : 'play'}/>{activeId === selected.work.id ? copy.pauseSound : copy.playSound}</button><button className={myLikes.includes(selected.work.id) ? 'is-active' : ''} onClick={() => props.onToggleLike(selected)} disabled={!isInAigram}><Icon name="heart"/>{myLikes.includes(selected.work.id) ? copy.liked : copy.like}</button></div>
      <div className="sw__thread"><h3>{copy.notes} · {thread.length}</h3>{!thread.length && <p>{copy.noNotes}</p>}{thread.map(message => {
        const self = !!myUserId && message.fromUserId === myUserId
        const identity = <><span className="sw__avatar" aria-hidden>{message.userAvatarUrl ? <img src={message.userAvatarUrl} alt="" draggable={false}/> : <span>{(message.userName || '?')[0]}</span>}</span><b>{self ? copy.you : message.userName || copy.player}</b></>
        return <div className="sw__message" key={message.id}>{self ? <span className="sw__messageAuthor">{identity}</span> : <button className="sw__messageAuthor" onClick={() => { if (isInAigram && message.fromUserId) openAigramProfile(message.fromUserId) }} disabled={!isInAigram || !message.fromUserId}>{identity}</button>}<div><p>{message.text}</p><time>{timeAgo(message.ts, locale)}</time></div></div>
      })}</div>
      {isInAigram && <form className="sw__compose" onSubmit={event => { event.preventDefault(); if (!draft.trim()) return; props.onSendMessage(selected, draft); setDraft('') }}><input value={draft} maxLength={140} onChange={event => setDraft(event.currentTarget.value)} placeholder={copy.placeholder}/><button type="submit" aria-label={copy.send}><Icon name="send"/></button></form>}
    </section></div>}
  </section>
}
