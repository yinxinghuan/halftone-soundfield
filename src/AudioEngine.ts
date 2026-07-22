const PENTATONIC = [0, 2, 4, 7, 9, 12, 14]

export type SoundSettings = {
  bounce: number
  pitch: number
  space: number
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private master: GainNode | null = null
  private delay: DelayNode | null = null
  private feedback: GainNode | null = null
  private reverbSend: GainNode | null = null
  private convolver: ConvolverNode | null = null
  private buffer: AudioBuffer | null = null
  private activeVoices = 0
  private readonly lastHit = new Map<number, number>()
  private readonly frequencyData = new Uint8Array(32)

  get context() {
    if (!this.ctx) this.createGraph()
    return this.ctx!
  }

  async unlock() {
    const ctx = this.context
    if (ctx.state === 'suspended') await ctx.resume()
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    source.connect(ctx.destination)
    source.start()
  }

  async decode(bytes: ArrayBuffer) {
    this.buffer = await this.context.decodeAudioData(bytes.slice(0))
  }

  setDemoBuffer() {
    const ctx = this.context
    const duration = 2.4
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      const t = i / ctx.sampleRate
      const beat = t % 0.6
      const pluck = Math.exp(-beat * 7)
      const voice = Math.sin(Math.PI * 2 * 146.83 * t) * 0.19
        + Math.sin(Math.PI * 2 * 220 * t) * 0.12
        + Math.sin(Math.PI * 2 * 293.66 * t) * 0.075
      data[i] = voice * (0.34 + pluck * 0.66) + (Math.random() * 2 - 1) * 0.018 * pluck
    }
    this.buffer = buffer
  }

  updateSpace(value: number) {
    if (!this.ctx || !this.delay || !this.feedback || !this.reverbSend) return
    const now = this.ctx.currentTime
    const amount = value / 100
    this.delay.delayTime.setTargetAtTime(0.07 + amount * 0.24, now, 0.035)
    this.feedback.gain.setTargetAtTime(0.08 + amount * 0.27, now, 0.035)
    this.reverbSend.gain.setTargetAtTime(0.03 + amount * 0.23, now, 0.035)
  }

  chirp(start: number, end: number, duration: number) {
    const ctx = this.context
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const now = ctx.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(start, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain).connect(this.master!)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
  }

  hit(index: number, strength: number, settings: SoundSettings, pair = false) {
    if (!this.buffer || !this.ctx || this.ctx.state !== 'running' || this.activeVoices >= 12) return
    const nowMs = performance.now()
    if (nowMs - (this.lastHit.get(index) ?? 0) < 55) return
    this.lastHit.set(index, nowMs)

    const ctx = this.ctx
    const intensity = Math.min(1, Math.max(0.08, strength))
    const pitchRange = 2 + settings.pitch / 100 * 12
    const semitone = (PENTATONIC[index % PENTATONIC.length] - 5) * pitchRange / 9
    const rate = 2 ** (semitone / 12)
    const duration = Math.min(0.28, 0.075 + intensity * 0.16)
    const maxOffset = Math.max(0, this.buffer.duration - duration - 0.01)
    const offset = maxOffset * ((index * 0.173 + (pair ? 0.31 : 0.07)) % 1)

    const source = ctx.createBufferSource()
    const envelope = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    const pan = ctx.createStereoPanner()
    const dry = ctx.createGain()
    const send = ctx.createGain()
    source.buffer = this.buffer
    source.playbackRate.value = rate
    filter.type = 'lowpass'
    filter.frequency.value = 1700 + (1 - intensity) * 4300
    filter.Q.value = 0.8 + intensity * 2.6
    pan.pan.value = Math.sin(index * 2.19) * 0.68
    dry.gain.value = 0.18 + intensity * 0.18
    send.gain.value = 0.07 + settings.space / 100 * 0.2
    const now = ctx.currentTime
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.linearRampToValueAtTime(0.34 + intensity * 0.34, now + 0.012)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration / rate)
    source.connect(filter).connect(envelope).connect(pan)
    pan.connect(dry).connect(this.master!)
    pan.connect(send).connect(this.delay!)
    pan.connect(send).connect(this.reverbSend!)
    this.activeVoices += 1
    source.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1) }
    source.start(now, Math.min(offset, maxOffset), duration)
    source.stop(now + duration / rate + 0.03)

    if (pair) this.resonance(index, intensity)
  }

  sample() {
    if (!this.analyser) return { level: 0, bins: this.frequencyData }
    this.analyser.getByteFrequencyData(this.frequencyData)
    let sum = 0
    for (let i = 0; i < 16; i += 1) sum += this.frequencyData[i]
    return { level: sum / (16 * 255), bins: this.frequencyData }
  }

  async close() {
    await this.ctx?.close()
    this.ctx = null
  }

  private resonance(index: number, strength: number) {
    const ctx = this.ctx!
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const now = ctx.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.value = 65.41 * 2 ** (PENTATONIC[index % PENTATONIC.length] / 12)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.018 + strength * 0.045, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15 + strength * 0.2)
    oscillator.connect(gain).connect(this.master!)
    oscillator.start(now)
    oscillator.stop(now + 0.4)
  }

  private createGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    this.ctx = new AudioContextClass()
    const highpass = this.ctx.createBiquadFilter()
    const lowpass = this.ctx.createBiquadFilter()
    const compressor = this.ctx.createDynamicsCompressor()
    this.master = this.ctx.createGain()
    this.analyser = this.ctx.createAnalyser()
    this.delay = this.ctx.createDelay(0.5)
    this.feedback = this.ctx.createGain()
    this.reverbSend = this.ctx.createGain()
    this.convolver = this.ctx.createConvolver()
    highpass.type = 'highpass'; highpass.frequency.value = 80
    lowpass.type = 'lowpass'; lowpass.frequency.value = 6500
    compressor.threshold.value = -20; compressor.ratio.value = 3; compressor.attack.value = 0.008; compressor.release.value = 0.22
    this.master.gain.value = 0.74
    this.analyser.fftSize = 64; this.analyser.smoothingTimeConstant = 0.68
    const impulse = this.ctx.createBuffer(2, Math.floor(this.ctx.sampleRate * 0.9), this.ctx.sampleRate)
    for (let channel = 0; channel < 2; channel += 1) {
      const samples = impulse.getChannelData(channel)
      for (let i = 0; i < samples.length; i += 1) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 3
    }
    this.convolver.buffer = impulse
    this.master.connect(highpass).connect(lowpass).connect(compressor).connect(this.analyser).connect(this.ctx.destination)
    this.delay.connect(this.feedback).connect(this.delay)
    this.delay.connect(this.master)
    this.reverbSend.connect(this.convolver).connect(this.master)
    this.updateSpace(46)
  }
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext
  }
}
