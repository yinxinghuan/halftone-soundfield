import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { AudioEngine, SoundSettings } from './AudioEngine'

type Props = {
  audio: AudioEngine
  running: boolean
  settings: SoundSettings
  onFirstCollision: () => void
}

type Orb = {
  mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshPhysicalMaterial>
  position: THREE.Vector3
  velocity: THREE.Vector3
  radius: number
  impact: number
}

const BLUE = 0x1c69ae
const YELLOW = 0xffd23f

function makeDotsTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 320
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(255,255,255,.86)'
  for (let y = 34; y < 290; y += 22) for (let x = 34; x < 290; x += 22) {
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeSignalTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { canvas, ctx, texture }
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    mesh.geometry?.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach(item => item.dispose())
    else material?.dispose()
  })
}

export function SoftBoxStage({ audio, running, settings, onFirstCollision }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runningRef = useRef(running)
  const settingsRef = useRef(settings)
  const collisionRef = useRef(onFirstCollision)

  useEffect(() => { runningRef.current = running }, [running])
  useEffect(() => { settingsRef.current = settings; audio.updateSpace(settings.space) }, [audio, settings])
  useEffect(() => { collisionRef.current = onFirstCollision }, [onFirstCollision])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const hostElement = host
    const canvasElement = canvas
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.14

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30)
    camera.position.set(0, 0.18, 5.35)
    scene.add(new THREE.HemisphereLight(0xf8fbff, 0x526984, 2.7))
    const key = new THREE.DirectionalLight(0xffffff, 4.2); key.position.set(-3, 5, 4); scene.add(key)
    const rim = new THREE.DirectionalLight(0x9cc8ff, 2.4); rim.position.set(4, 1, -2); scene.add(rim)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.25, 64),
      new THREE.MeshBasicMaterial({ color: 0x7e9fc3, transparent: true, opacity: 0.12, depthWrite: false }),
    )
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.62; floor.scale.y = 0.25; scene.add(floor)
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.38, 64),
      new THREE.MeshBasicMaterial({ color: 0x243c5d, transparent: true, opacity: 0.18, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -1.59, 0.05); shadow.scale.y = 0.28; scene.add(shadow)

    const rig = new THREE.Group()
    rig.rotation.set(0.54, 0.73, -0.08)
    rig.position.y = 0.05
    scene.add(rig)

    const boxGeometry = new RoundedBoxGeometry(2.22, 2.22, 2.22, 12, 0.17)
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xd7e5f6,
      roughness: 0.09,
      metalness: 0,
      transmission: 0.9,
      transparent: true,
      opacity: 0.27,
      thickness: 1.35,
      ior: 1.36,
      clearcoat: 1,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const shell = new THREE.Mesh(boxGeometry, glass)
    shell.renderOrder = 4
    rig.add(shell)
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xf8fbff, transparent: true, opacity: 0.58 })
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeometry, 24), edgeMaterial)
    edges.renderOrder = 5
    rig.add(edges)

    const decalMaterial = (map: THREE.Texture, opacity = 0.75) => new THREE.MeshBasicMaterial({
      map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
    const decalGeometry = new THREE.PlaneGeometry(1.34, 1.34)
    const dots = new THREE.Mesh(decalGeometry, decalMaterial(makeDotsTexture(), 0.5))
    dots.position.x = -1.116; dots.rotation.y = -Math.PI / 2; rig.add(dots)
    const signal = makeSignalTexture()
    const spectrum = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.76), decalMaterial(signal.texture, 0.82))
    spectrum.position.y = 1.116; spectrum.rotation.x = -Math.PI / 2; rig.add(spectrum)
    const gaugeSignal = makeSignalTexture()
    const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 1.35), decalMaterial(gaugeSignal.texture, 0.7))
    gauge.position.z = 1.116; rig.add(gauge)

    const orbs: Orb[] = Array.from({ length: 7 }, (_, index) => {
      const radius = index % 3 === 0 ? 0.25 : 0.18 + (index % 2) * 0.025
      const geometry = new THREE.IcosahedronGeometry(radius, 4)
      const color = index % 2 ? YELLOW : BLUE
      const material = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.18,
        sheen: 0.65, sheenColor: new THREE.Color(0xffffff), emissive: color, emissiveIntensity: 0.035,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.renderOrder = 2
      const angle = index / 7 * Math.PI * 2
      const position = new THREE.Vector3(Math.cos(angle) * 0.48, -0.5 + (index % 3) * 0.38, Math.sin(angle) * 0.42)
      const velocity = index === 0
        ? new THREE.Vector3(1.55, 0.82, 0.34)
        : new THREE.Vector3(Math.sin(index * 1.7) * 0.65, 0.15 + index * 0.035, Math.cos(index * 1.4) * 0.55)
      mesh.position.copy(position); rig.add(mesh)
      return { mesh, position, velocity, radius, impact: 0 }
    })

    let raf = 0
    let previous = performance.now()
    let rotationX = 0.54, rotationY = 0.73
    let targetX = rotationX, targetY = rotationY
    let inertiaX = 0, inertiaY = 0
    let dragging = false
    let pointerId = -1
    let startX = 0, startY = 0, lastX = 0, lastY = 0, dragDistance = 0
    let firstCollision = false
    let visualPulse = 0
    const inverseQuaternion = new THREE.Quaternion()
    const localGravity = new THREE.Vector3()

    function collide(index: number, strength: number, pair = false) {
      const orb = orbs[index]
      orb.impact = Math.min(1, orb.impact + strength)
      visualPulse = Math.min(1, visualPulse + strength * 0.7)
      audio.hit(index, strength, settingsRef.current, pair)
      if (!firstCollision) { firstCollision = true; collisionRef.current() }
    }

    function updatePhysics(dt: number) {
      if (!runningRef.current) return
      inverseQuaternion.copy(rig.quaternion).invert()
      localGravity.set(0, -1, 0).applyQuaternion(inverseQuaternion)
      const bounce = 0.48 + settingsRef.current.bounce / 100 * 0.46
      const gravity = 1.15 + settingsRef.current.bounce / 100 * 1.15
      const bound = 1.015
      for (let i = 0; i < orbs.length; i += 1) {
        const orb = orbs[i]
        orb.velocity.addScaledVector(localGravity, gravity * dt)
        orb.velocity.multiplyScalar(Math.pow(0.985, dt * 60))
        orb.position.addScaledVector(orb.velocity, dt)
        const limit = bound - orb.radius
        for (const axis of ['x', 'y', 'z'] as const) {
          if (Math.abs(orb.position[axis]) > limit) {
            const sign = Math.sign(orb.position[axis])
            orb.position[axis] = sign * limit
            const impact = Math.min(1, Math.abs(orb.velocity[axis]) / 1.9)
            orb.velocity[axis] *= -bounce
            orb.velocity.x += (Math.random() - 0.5) * 0.06
            orb.velocity.z += (Math.random() - 0.5) * 0.06
            if (impact > 0.12) collide(i, impact)
          }
        }
      }
      for (let i = 0; i < orbs.length; i += 1) for (let j = i + 1; j < orbs.length; j += 1) {
        const a = orbs[i], b = orbs[j]
        const delta = b.position.clone().sub(a.position)
        const minDistance = a.radius + b.radius
        const distance = delta.length()
        if (distance > 0 && distance < minDistance) {
          const normal = delta.multiplyScalar(1 / distance)
          const overlap = minDistance - distance
          a.position.addScaledVector(normal, -overlap * 0.5); b.position.addScaledVector(normal, overlap * 0.5)
          const relative = b.velocity.clone().sub(a.velocity).dot(normal)
          if (relative < 0) {
            const impulse = -(1 + bounce * 0.82) * relative * 0.5
            a.velocity.addScaledVector(normal, -impulse); b.velocity.addScaledVector(normal, impulse)
            if (Math.abs(relative) > 0.26) collide((i + j) % orbs.length, Math.min(1, Math.abs(relative) / 2.2), true)
          }
        }
      }
    }

    function drawSignals(time: number) {
      const { level, bins } = audio.sample()
      const ctx = signal.ctx, width = signal.canvas.width, height = signal.canvas.height
      ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = `rgba(255,255,255,${0.38 + visualPulse * 0.58})`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(26, height * 0.72); ctx.lineTo(width - 26, height * 0.72); ctx.stroke()
      for (let i = 0; i < 30; i += 1) {
        const value = runningRef.current ? bins[i % bins.length] / 255 : 0.08 + Math.sin(time * 0.002 + i) * 0.025
        const barHeight = 12 + value * 105 + visualPulse * 25 * Math.sin(i * 1.7) ** 2
        ctx.fillStyle = `rgba(255,255,255,${0.38 + value * 0.6})`
        ctx.fillRect(28 + i * 15.2, height * 0.72 - barHeight, 6, barHeight)
      }
      signal.texture.needsUpdate = true

      const g = gaugeSignal.ctx, gw = gaugeSignal.canvas.width, gh = gaugeSignal.canvas.height
      g.clearRect(0, 0, gw, gh); g.strokeStyle = 'rgba(255,255,255,.76)'; g.lineWidth = 3
      g.strokeRect(gw * 0.43, 24, gw * 0.14, gh - 48)
      const fill = Math.min(0.94, 0.18 + level * 1.7 + visualPulse * 0.3)
      g.fillStyle = `rgba(255,255,255,${0.35 + visualPulse * 0.55})`
      g.fillRect(gw * 0.43, 24 + (gh - 48) * (1 - fill), gw * 0.14, (gh - 48) * fill)
      for (let i = 0; i <= 8; i += 1) { const y = 24 + (gh - 48) * i / 8; g.beginPath(); g.moveTo(gw * 0.61, y); g.lineTo(gw * (i % 2 ? 0.68 : 0.73), y); g.stroke() }
      gaugeSignal.texture.needsUpdate = true
    }

    function frame(now: number) {
      const dt = Math.min(0.035, (now - previous) / 1000); previous = now
      if (!dragging) {
        targetY += inertiaY * dt; targetX += inertiaX * dt
        inertiaX *= Math.pow(0.91, dt * 60); inertiaY *= Math.pow(0.91, dt * 60)
        if (!reducedMotion && runningRef.current) targetY += dt * 0.045
      }
      rotationX += (targetX - rotationX) * Math.min(1, dt * 9)
      rotationY += (targetY - rotationY) * Math.min(1, dt * 9)
      rig.rotation.x = rotationX; rig.rotation.y = rotationY
      updatePhysics(dt)
      for (const orb of orbs) {
        orb.impact *= Math.pow(0.08, dt)
        const squash = orb.impact * 0.28
        orb.mesh.position.copy(orb.position)
        orb.mesh.scale.set(1 + squash * 0.55, 1 - squash, 1 + squash * 0.45)
        orb.mesh.rotation.x += dt * (0.4 + orb.velocity.length())
        orb.mesh.rotation.y += dt * 0.55
        orb.mesh.material.emissiveIntensity = 0.035 + orb.impact * 0.58
      }
      visualPulse *= Math.pow(0.025, dt)
      shell.scale.set(1 + visualPulse * 0.014, 1 + visualPulse * 0.009, 1 + visualPulse * 0.014)
      edges.scale.copy(shell.scale)
      drawSignals(now)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }

    function resize() {
      const rect = hostElement.getBoundingClientRect()
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false)
      camera.aspect = rect.width / Math.max(1, rect.height)
      camera.position.z = camera.aspect < 0.86 ? 6.35 : camera.aspect < 1 ? 5.85 : 5.35
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize); observer.observe(hostElement); resize()

    function pointerDown(event: PointerEvent) {
      dragging = true; pointerId = event.pointerId; startX = lastX = event.clientX; startY = lastY = event.clientY; dragDistance = 0
      canvasElement.setPointerCapture(event.pointerId)
    }
    function pointerMove(event: PointerEvent) {
      if (!dragging || event.pointerId !== pointerId) return
      const dx = event.clientX - lastX, dy = event.clientY - lastY
      dragDistance += Math.abs(dx) + Math.abs(dy)
      targetY += dx * 0.009; targetX = Math.max(-1.05, Math.min(1.05, targetX + dy * 0.008))
      inertiaY = dx * 0.42; inertiaX = dy * 0.34
      lastX = event.clientX; lastY = event.clientY
    }
    function pointerUp(event: PointerEvent) {
      if (event.pointerId !== pointerId) return
      dragging = false
      if (dragDistance < 12 && Math.hypot(event.clientX - startX, event.clientY - startY) < 8) {
        for (const orb of orbs) orb.velocity.add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.1 + Math.random() * 0.7, (Math.random() - 0.5) * 1.2))
      }
    }
    canvasElement.addEventListener('pointerdown', pointerDown)
    canvasElement.addEventListener('pointermove', pointerMove)
    canvasElement.addEventListener('pointerup', pointerUp)
    canvasElement.addEventListener('pointercancel', pointerUp)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf); observer.disconnect()
      canvasElement.removeEventListener('pointerdown', pointerDown); canvasElement.removeEventListener('pointermove', pointerMove)
      canvasElement.removeEventListener('pointerup', pointerUp); canvasElement.removeEventListener('pointercancel', pointerUp)
      signal.texture.dispose(); gaugeSignal.texture.dispose(); disposeTree(scene); renderer.dispose()
    }
  }, [audio])

  return <div ref={hostRef} className="bb__stage"><canvas ref={canvasRef} aria-label="可拖动的透明声音软盒" /></div>
}
