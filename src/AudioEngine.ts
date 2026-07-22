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
  private grainOffsets = Array.from({ length: 7 }, (_, index) => index / 7)
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
    const decoded = await this.context.decodeAudioData(bytes.slice(0))
    this.buffer = this.normaliseBuffer(decoded)
    this.grainOffsets = this.findGrainOffsets(this.buffer)
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
    this.grainOffsets = this.findGrainOffsets(buffer)
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
    if (!this.buffer || !this.ctx || this.ctx.state !== 'running' || this.activeVoices >= 10) return false
    const nowMs = performance.now()
    if (nowMs - (this.lastHit.get(index) ?? 0) < 72) return false
    this.lastHit.set(index, nowMs)

    const ctx = this.ctx
    const intensity = Math.min(1, Math.max(0.16, strength))
    const pitchRange = 3 + settings.pitch / 100 * 10
    const semitone = (PENTATONIC[index % PENTATONIC.length] - 5) * pitchRange / 9
    const rate = 2 ** (semitone / 12)
    const duration = Math.min(0.34, 0.11 + intensity * 0.21)
    const maxOffset = Math.max(0, this.buffer.duration - duration - 0.01)
    const offset = Math.min(maxOffset, this.grainOffsets[index % this.grainOffsets.length] * maxOffset)

    const source = ctx.createBufferSource()
    const envelope = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    const pan = ctx.createStereoPanner()
    const dry = ctx.createGain()
    const send = ctx.createGain()
    source.buffer = this.buffer
    source.playbackRate.value = rate
    filter.type = 'lowpass'
    filter.frequency.value = 2800 + intensity * 4700
    filter.Q.value = 0.7 + intensity * 1.5
    pan.pan.value = Math.sin(index * 2.19) * 0.68
    dry.gain.value = 0.66 + intensity * 0.28
    send.gain.value = 0.08 + settings.space / 100 * 0.16
    const now = ctx.currentTime
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.linearRampToValueAtTime(0.58 + intensity * 0.34, now + 0.008)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration / rate)
    source.connect(filter).connect(envelope).connect(pan)
    pan.connect(dry).connect(this.master!)
    pan.connect(send).connect(this.delay!)
    pan.connect(send).connect(this.reverbSend!)
    this.activeVoices += 1
    source.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1) }
    source.start(now, Math.min(offset, maxOffset), duration)
    source.stop(now + duration / rate + 0.03)

    this.resonance(index, pair ? intensity * 0.78 : intensity)
    return true
  }

  sample() {
    if (!this.analyser) return { level: 0, bins: this.frequencyData }
    this.analyser.getByteFrequencyData(this.frequencyData)
    let sum = 0
    for (let i = 0; i < 16; i += 1) sum += this.frequencyData[i]
    return { level: sum / (16 * 255), bins: this.frequencyData }
  }

  async recordPreview(durationMs = 5000): Promise<Blob> {
    if (typeof MediaRecorder === 'undefined') throw new Error('preview recorder unavailable')
    await this.unlock()
    if (!this.analyser) throw new Error('audio graph unavailable')
    const destination = this.context.createMediaStreamDestination()
    this.analyser.connect(destination)
    const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type))
    const recorder = mimeType ? new MediaRecorder(destination.stream, { mimeType }) : new MediaRecorder(destination.stream)
    const chunks: BlobPart[] = []
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('preview recording failed'))
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
    })
    recorder.start(200)
    await new Promise(resolve => window.setTimeout(resolve, durationMs))
    recorder.stop()
    const blob = await done
    this.analyser.disconnect(destination)
    destination.stream.getTracks().forEach(track => track.stop())
    if (!blob.size) throw new Error('empty preview')
    return blob
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
    gain.gain.linearRampToValueAtTime(0.032 + strength * 0.075, now + 0.008)
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
    compressor.threshold.value = -18; compressor.knee.value = 14; compressor.ratio.value = 3.5; compressor.attack.value = 0.004; compressor.release.value = 0.18
    this.master.gain.value = 0.96
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

  private normaliseBuffer(source: AudioBuffer) {
    let peak = 0
    let energy = 0
    let count = 0
    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const data = source.getChannelData(channel)
      for (let i = 0; i < data.length; i += 1) {
        const value = data[i]
        peak = Math.max(peak, Math.abs(value))
        energy += value * value
        count += 1
      }
    }
    const rms = Math.sqrt(energy / Math.max(1, count))
    const gain = Math.min(8, 0.92 / Math.max(peak, 0.0001), 0.16 / Math.max(rms, 0.0001))
    if (gain <= 1.04) return source
    const target = this.context.createBuffer(source.numberOfChannels, source.length, source.sampleRate)
    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const input = source.getChannelData(channel)
      const output = target.getChannelData(channel)
      for (let i = 0; i < input.length; i += 1) output[i] = Math.tanh(input[i] * gain)
    }
    return target
  }

  private findGrainOffsets(buffer: AudioBuffer) {
    const data = buffer.getChannelData(0)
    const windowSize = Math.max(64, Math.floor(buffer.sampleRate * 0.09))
    const offsets: number[] = []
    for (let voice = 0; voice < 7; voice += 1) {
      const regionStart = Math.floor(data.length * voice / 7)
      const regionEnd = Math.max(regionStart + windowSize, Math.floor(data.length * (voice + 1) / 7) - windowSize)
      let best = regionStart
      let bestEnergy = -1
      const step = Math.max(32, Math.floor(windowSize / 3))
      for (let start = regionStart; start <= regionEnd; start += step) {
        let energy = 0
        const end = Math.min(data.length, start + windowSize)
        for (let i = start; i < end; i += 8) energy += data[i] * data[i]
        if (energy > bestEnergy) { bestEnergy = energy; best = start }
      }
      offsets.push(best / Math.max(1, data.length - windowSize))
    }
    return offsets
  }
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext
  }
}
