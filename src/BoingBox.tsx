import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { AudioEngine, type SoundSettings } from './AudioEngine'
import { SoftBoxStage } from './SoftBoxStage'
import './boing-box.less'

type Phase = 'entry' | 'entering' | 'studio' | 'leaving'
type Copy = typeof zh

const zh = {
  eyebrow: 'TINKER / SAMPLE 02', title: 'Boing 声音软盒', intro: '把一小段声音装进软盒里',
  entryTitle: '录下一颗有重量的声音', entryGuide: '按住说话、哼唱或敲击 · 松开完成',
  record: '按住录音', stop: '松开完成', listening: '正在聆听', demo: '先用示例声音进入',
  requesting: '等待授权', privacy: '声音只在此设备处理，不会上传', readyHold: '权限已开启，请再按住录音',
  permission: '麦克风未开启。请在浏览器或系统设置中允许访问，或使用示例声音。',
  containerBlocked: 'Mini App 容器未开放麦克风，需要宿主为游戏 iframe 开启 microphone 权限。',
  unsupported: '当前环境不支持网页录音，请使用示例声音。', tooShort: '按住时间太短，请至少录 0.4 秒。', loading: '松开即可完成 · 最长 4 秒',
  ready: '拖动盒子改变重力 · 轻点盒子弹起声音', waiting: '等待第一次碰撞…', heard: '声音已装入盒中',
  play: '播放', pause: '暂停', rerecord: '重新录音', bounce: '弹性', pitch: '音高', space: '空间',
  hintBounce: '碰撞密度', hintPitch: '转调幅度', hintSpace: '回声长度',
}
const en: Copy = {
  eyebrow: 'TINKER / SAMPLE 02', title: 'Boing Sound Box', intro: 'Put a tiny sound inside a soft box',
  entryTitle: 'Record a sound with weight', entryGuide: 'Hold to speak, hum or tap · release to finish',
  record: 'Hold to record', stop: 'Release to finish', listening: 'Listening', demo: 'Enter with a demo sound',
  requesting: 'Allow access', privacy: 'Processed on this device. Never uploaded.', readyHold: 'Access granted. Hold again to record.',
  permission: 'Microphone is off. Allow access in browser or system settings, or use the demo.',
  containerBlocked: 'The Mini App container has not enabled microphone access for this game.',
  unsupported: 'Recording is not supported here. Use the demo sound.', tooShort: 'Too short. Hold for at least 0.4 seconds.', loading: 'Release to finish · 4 seconds max',
  ready: 'Drag to change gravity · tap to toss the sounds', waiting: 'Waiting for the first collision…', heard: 'Sound is inside the box',
  play: 'Play', pause: 'Pause', rerecord: 'Record again', bounce: 'Bounce', pitch: 'Pitch', space: 'Space',
  hintBounce: 'collision rate', hintPitch: 'transpose range', hintSpace: 'echo length',
}

function getCopy() {
  const forced = localStorage.getItem('game_locale')
  return forced === 'en' || (!forced && !navigator.language.toLowerCase().startsWith('zh')) ? en : zh
}

function Icon({ name }: { name: 'mic' | 'play' | 'pause' | 'refresh' | 'lock' }) {
  const paths = {
    mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M8.5 21h7"/></>,
    play: <path fill="currentColor" stroke="none" d="M8 5.5v13l10-6.5z"/>,
    pause: <><path d="M8.5 6v12M15.5 6v12"/></>,
    refresh: <><path d="M19 8a8 8 0 1 0 1 7M19 4v4h-4"/></>,
    lock: <><rect x="6.5" y="10" width="11" height="9" rx="2"/><path d="M9 10V7.5a3 3 0 0 1 6 0V10M12 13.5v2"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

const floaters = [
  [-122, -116, 22, .78], [118, -101, -18, .56], [-146, 18, 42, .48], [142, 35, -34, .72],
  [-92, 126, -29, .58], [88, 137, 36, .5], [-38, -164, 18, .42], [46, 166, -22, .46],
] as const

type PermissionIssue = 'denied' | 'container' | 'unsupported' | 'too-short' | null

function containerAllowsMicrophone() {
  const policyDocument = document as Document & {
    permissionsPolicy?: { allowsFeature: (feature: string) => boolean }
    featurePolicy?: { allowsFeature: (feature: string) => boolean }
  }
  const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy
  return !policy || policy.allowsFeature('microphone')
}

export default function BoingBox() {
  const [audio] = useState(() => new AudioEngine())
  const [copy] = useState(getCopy)
  const [phase, setPhase] = useState<Phase>('entry')
  const [recording, setRecording] = useState(false)
  const [requestingPermission, setRequestingPermission] = useState(false)
  const [permissionIssue, setPermissionIssue] = useState<PermissionIssue>(null)
  const [permissionReady, setPermissionReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [collided, setCollided] = useState(false)
  const [settings, setSettings] = useState<SoundSettings>({ bounce: 66, pitch: 58, space: 46 })
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const holdingRef = useRef(false)
  const recordStartedAtRef = useRef(0)
  const recordTimerRef = useRef<number | null>(null)
  const transitionRef = useRef<number | null>(null)

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    if (recordTimerRef.current !== null) window.clearTimeout(recordTimerRef.current)
    if (transitionRef.current !== null) window.clearTimeout(transitionRef.current)
    void audio.close()
  }, [audio])

  function enterStudio() {
    setCollided(false); setPhase('entering'); setRunning(true)
    transitionRef.current = window.setTimeout(() => { setPhase('studio'); transitionRef.current = null }, 620)
  }

  async function beginRecording() {
    if (recording || requestingPermission) return
    setRequestingPermission(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setPermissionIssue('unsupported'); holdingRef.current = false; return
      }
      if (!containerAllowsMicrophone()) {
        setPermissionIssue('container'); holdingRef.current = false; return
      }
      void audio.unlock()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      setPermissionReady(true)
      if (!holdingRef.current) {
        stream.getTracks().forEach(track => track.stop())
        setPermissionIssue(null)
        return
      }
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      streamRef.current = stream; recorderRef.current = recorder
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop()); setRecording(false)
        if (recordTimerRef.current !== null) window.clearTimeout(recordTimerRef.current)
        recordTimerRef.current = null
        if (performance.now() - recordStartedAtRef.current < 380 || chunks.length === 0) {
          setPermissionIssue('too-short')
          return
        }
        try {
          const bytes = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()
          await audio.decode(bytes)
        } catch { audio.setDemoBuffer() }
        audio.chirp(330, 660, 0.16); enterStudio()
      }
      recorder.start(120); recordStartedAtRef.current = performance.now(); setPermissionIssue(null); setRecording(true); audio.chirp(520, 520, 0.07)
      recordTimerRef.current = window.setTimeout(() => { holdingRef.current = false; if (recorder.state === 'recording') recorder.stop() }, 4000)
    } catch { setPermissionIssue('denied'); setRecording(false); holdingRef.current = false }
    finally { setRequestingPermission(false) }
  }

  function holdRecordStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    holdingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    void beginRecording()
  }

  function holdRecordEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    holdingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  function useDemo() {
    void audio.unlock(); audio.setDemoBuffer(); audio.chirp(330, 660, 0.16); setPermissionIssue(null); enterStudio()
  }

  function recordAgain() {
    setRunning(false); setPhase('leaving')
    transitionRef.current = window.setTimeout(() => { setPhase('entry'); transitionRef.current = null }, 440)
  }

  function changeSetting(key: keyof SoundSettings, value: number) {
    setSettings(current => ({ ...current, [key]: value }))
  }

  const studioVisible = phase !== 'entry'
  return <main className={`bb bb--${phase} ${recording ? 'bb--recording' : ''}`}>
    <div className="bb__vignette" aria-hidden="true" />
    <header className="bb__header">
      <p>{copy.eyebrow}</p><h1>{copy.title}</h1><span>{studioVisible ? (collided ? copy.heard : copy.waiting) : copy.intro}</span>
    </header>

    {studioVisible && <section className="bb__studio" aria-label={copy.title}>
      <SoftBoxStage audio={audio} running={running} settings={settings} onFirstCollision={() => setCollided(true)} />
      <p className="bb__gestureHint">{copy.ready}</p>
      <div className="bb__instrument">
        <div className="bb__transport">
          <button className="bb__play" onPointerDown={() => setRunning(value => !value)} aria-label={running ? copy.pause : copy.play}>
            <Icon name={running ? 'pause' : 'play'} /><span>{running ? copy.pause : copy.play}</span>
          </button>
          <span className={`bb__live ${running ? 'is-live' : ''}`}><i />{running ? 'LIVE' : 'HOLD'}</span>
          <button className="bb__again" onPointerDown={recordAgain}><Icon name="refresh" />{copy.rerecord}</button>
        </div>
        <div className="bb__controls">
          {([
            ['bounce', copy.bounce, copy.hintBounce], ['pitch', copy.pitch, copy.hintPitch], ['space', copy.space, copy.hintSpace],
          ] as const).map(([key, label, hint]) => <label className="bb__control" key={key}>
            <span><b>{label}</b><small>{hint}</small><output>{settings[key]}</output></span>
            <input type="range" min="0" max="100" value={settings[key]} onChange={event => changeSetting(key, Number(event.currentTarget.value))} style={{ '--value': `${settings[key]}%` } as CSSProperties} />
          </label>)}
        </div>
      </div>
    </section>}

    {(phase === 'entry' || phase === 'entering' || phase === 'leaving') && <section className="bb__entry" aria-label="录音入口">
      <div className="bb__entryObject" aria-hidden="true">
        <span className="bb__entryGlass" />
        {floaters.map(([x, y, rotate, scale], index) => <i key={index} style={{ '--x': `${x}px`, '--y': `${y}px`, '--r': `${rotate}deg`, '--s': scale, '--delay': `${-index * 210}ms` } as CSSProperties} />)}
      </div>
      <div className="bb__entryCopy"><span>01 / CAPTURE</span><h2>{recording ? copy.listening : copy.entryTitle}</h2><p>{recording ? copy.loading : permissionReady ? copy.readyHold : copy.entryGuide}</p></div>
      <p className="bb__privacy"><Icon name="lock" />{copy.privacy}</p>
      <button className="bb__record" onPointerDown={holdRecordStart} onPointerUp={holdRecordEnd} onPointerCancel={holdRecordEnd} onContextMenu={event => event.preventDefault()} aria-label={recording ? copy.stop : requestingPermission ? copy.requesting : copy.record}>
        <span className="bb__recordPulse"/><span className="bb__recordCore"><Icon name="mic" /><b>{recording ? copy.stop : requestingPermission ? copy.requesting : copy.record}</b></span>
      </button>
      {permissionIssue && <p className="bb__error" role="alert">{permissionIssue === 'container' ? copy.containerBlocked : permissionIssue === 'unsupported' ? copy.unsupported : permissionIssue === 'too-short' ? copy.tooShort : copy.permission}</p>}
      <button className="bb__demo" onPointerDown={useDemo} disabled={recording}>{copy.demo}<span>↗</span></button>
    </section>}
  </main>
}
