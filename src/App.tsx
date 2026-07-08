import { Camera, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, PointerEvent } from 'react'
import './App.css'

type Point = {
  x: number
  y: number
}

type Bounds = {
  x: number
  y: number
  width: number
  height: number
}

type PenColor = '#111111' | '#d42027' | '#1d54d8'

const PEN_COLORS: PenColor[] = ['#111111', '#d42027', '#1d54d8']
const FRAME_ASPECT = 360 / 231
const TEXTURE_WIDTH = 240
const TEXTURE_MIN_HEIGHT = 120
const TEXTURE_BLACK = [5, 5, 5] as const
const TEXTURE_WHITE = [247, 246, 239] as const

function seededRandom(seed: number) {
  let value = seed

  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value)
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function hashNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  value = Math.imul(value ^ (value >>> 13), 1274126177)

  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smoothstep(x - x0)
  const ty = smoothstep(y - y0)
  const a = hashNoise(x0, y0, seed)
  const b = hashNoise(x0 + 1, y0, seed)
  const c = hashNoise(x0, y0 + 1, seed)
  const d = hashNoise(x0 + 1, y0 + 1, seed)

  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
}

function textureField(x: number, y: number, phase: number) {
  const slowPhase = phase * 0.55
  const driftX =
    Math.sin(y * 0.08 + slowPhase * 1.1) * 5 +
    Math.sin((x + y) * 0.04 - slowPhase * 0.85) * 4
  const driftY =
    Math.cos(x * 0.075 - slowPhase * 0.95) * 5 +
    Math.sin((x - y) * 0.045 + slowPhase * 0.7) * 4

  const warpedX = x + driftX
  const warpedY = y + driftY
  const broad = valueNoise(warpedX * 0.095, warpedY * 0.095, 14)
  const medium = valueNoise(warpedX * 0.23 + slowPhase * 0.28, warpedY * 0.23, 31)
  const fleck = valueNoise(x * 0.62, y * 0.62, 58)
  const ripple =
    Math.sin(warpedX * 0.2 + warpedY * 0.08 + slowPhase * 1.15) * 0.055 +
    Math.cos(warpedY * 0.18 - slowPhase * 0.95) * 0.045

  return broad * 0.38 + medium * 0.38 + fleck * 0.24 + ripple
}

function drawMottledTexture(
  pattern: CanvasRenderingContext2D,
  textureWidth: number,
  textureHeight: number,
  phase: number,
) {
  const image = pattern.createImageData(textureWidth, textureHeight)
  const pixels = image.data

  for (let y = 0; y < textureHeight; y += 1) {
    for (let x = 0; x < textureWidth; x += 1) {
      const value = textureField(x, y, phase)
      const edge = valueNoise(x * 0.95, y * 0.95, 91) * 0.06
      const isPaper = value + edge > 0.55
      const shade = isPaper ? TEXTURE_WHITE : TEXTURE_BLACK
      const index = (y * textureWidth + x) * 4

      pixels[index] = shade[0]
      pixels[index + 1] = shade[1]
      pixels[index + 2] = shade[2]
      pixels[index + 3] = 255
    }
  }

  pattern.putImageData(image, 0, 0)
}

function labelPath(ctx: CanvasRenderingContext2D, bounds: Bounds) {
  const { x, y, width, height } = bounds
  const notch = Math.min(width * 0.09, height * 0.22)
  const radius = Math.min(width * 0.05, height * 0.12)

  ctx.beginPath()
  ctx.moveTo(x + notch + radius, y)
  ctx.lineTo(x + width - notch - radius, y)
  ctx.quadraticCurveTo(x + width - notch * 0.45, y, x + width - notch * 0.25, y + radius)
  ctx.lineTo(x + width, y + height * 0.5)
  ctx.lineTo(x + width - notch * 0.25, y + height - radius)
  ctx.quadraticCurveTo(
    x + width - notch * 0.45,
    y + height,
    x + width - notch - radius,
    y + height,
  )
  ctx.lineTo(x + notch + radius, y + height)
  ctx.quadraticCurveTo(x + notch * 0.45, y + height, x + notch * 0.25, y + height - radius)
  ctx.lineTo(x, y + height * 0.5)
  ctx.lineTo(x + notch * 0.25, y + radius)
  ctx.quadraticCurveTo(x + notch * 0.45, y, x + notch + radius, y)
  ctx.closePath()
}

function getLabelBounds(width: number, height: number): Bounds {
  const coverAspect = width / height
  const labelWidth = coverAspect > FRAME_ASPECT ? height * 0.9 : width * 0.58
  const labelHeight = Math.min(height * 0.42, labelWidth * 0.46)

  return {
    x: (width - labelWidth) / 2,
    y: height * 0.27,
    width: labelWidth,
    height: labelHeight,
  }
}

function pointInLabel(point: Point, bounds: Bounds) {
  const insetX = bounds.width * 0.08
  const insetY = bounds.height * 0.18

  return (
    point.x >= bounds.x + insetX &&
    point.x <= bounds.x + bounds.width - insetX &&
    point.y >= bounds.y + insetY &&
    point.y <= bounds.y + bounds.height - insetY
  )
}

function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = window.devicePixelRatio || 1
  const displayWidth = Math.max(1, Math.floor(width))
  const displayHeight = Math.max(1, Math.floor(height))

  canvas.width = Math.floor(displayWidth * dpr)
  canvas.height = Math.floor(displayHeight * dpr)
  canvas.style.width = `${displayWidth}px`
  canvas.style.height = `${displayHeight}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false

  return ctx
}

function drawCover(ctx: CanvasRenderingContext2D, width: number, height: number, phase: number) {
  const textureWidth = TEXTURE_WIDTH
  const textureHeight = Math.max(TEXTURE_MIN_HEIGHT, Math.round(textureWidth / (width / height)))
  const texture = document.createElement('canvas')
  texture.width = textureWidth
  texture.height = textureHeight
  const pattern = texture.getContext('2d')

  if (!pattern) {
    return
  }

  drawMottledTexture(pattern, textureWidth, textureHeight, phase)

  pattern.strokeStyle = '#f7f6ef'
  pattern.lineWidth = 1.4
  pattern.lineCap = 'round'
  const random = seededRandom(42)

  for (let i = 0; i < 220; i += 1) {
    const x = random() * textureWidth
    const y = random() * textureHeight
    const length = 2 + random() * 9
    const angle = random() * Math.PI * 2
    pattern.beginPath()
    pattern.moveTo(x, y)
    pattern.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
    pattern.stroke()
  }

  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(texture, 0, 0, width, height)

  const label = getLabelBounds(width, height)
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = Math.max(1, width * 0.005)
  ctx.shadowOffsetY = Math.max(1, height * 0.008)
  labelPath(ctx, label)
  ctx.fillStyle = '#fbfaf3'
  ctx.fill()
  ctx.restore()

  labelPath(ctx, label)
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = Math.max(2, width * 0.004)
  ctx.stroke()

  ctx.save()
  ctx.fillStyle = '#060606'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = `900 ${Math.max(18, label.width * 0.095)}px Arial, Helvetica, sans-serif`
  ctx.fillText('COMPOSITION', label.x + label.width / 2, label.y + label.height * 0.13)
  ctx.fillText('BOOK', label.x + label.width / 2, label.y + label.height * 0.31)

  ctx.strokeStyle = '#1b1b1b'
  ctx.lineWidth = Math.max(1.4, width * 0.0023)
  const lineStart = label.x + label.width * 0.18
  const lineEnd = label.x + label.width * 0.82
  const firstLine = label.y + label.height * 0.61
  const lineGap = label.height * 0.14

  for (let i = 0; i < 3; i += 1) {
    const y = firstLine + i * lineGap
    ctx.beginPath()
    ctx.moveTo(lineStart, y)
    ctx.lineTo(lineEnd, y)
    ctx.stroke()
  }

  ctx.textAlign = 'left'
  ctx.font = `900 ${Math.max(7, label.width * 0.035)}px Arial, Helvetica, sans-serif`
  ctx.fillText('COLLEGE RULED', lineStart, label.y + label.height * 0.76)
  ctx.font = `700 ${Math.max(6, label.width * 0.027)}px Arial, Helvetica, sans-serif`
  ctx.fillText('100 sheets - 200 pages', lineStart, label.y + label.height * 0.84)
  ctx.fillText('9 3/4 x 7 1/2 in / 24.7 x 19 cm', lineStart, label.y + label.height * 0.91)
  ctx.restore()
}

function App() {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const coverCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointsRef = useRef<Point[]>([])
  const boundsRef = useRef<Bounds>({ x: 0, y: 0, width: 0, height: 0 })
  const isDrawingRef = useRef(false)
  const [penColor, setPenColor] = useState<PenColor>('#111111')
  const penColorRef = useRef<PenColor>('#111111')
  const [penSize, setPenSize] = useState(5)
  const penSizeRef = useRef(5)
  const [isClearing, setIsClearing] = useState(false)
  const [rippleKey, setRippleKey] = useState('')

  useEffect(() => {
    penColorRef.current = penColor
  }, [penColor])

  useEffect(() => {
    penSizeRef.current = penSize
  }, [penSize])

  const resizeCanvases = useCallback(() => {
    const frame = frameRef.current
    const cover = coverCanvasRef.current
    const drawing = drawingCanvasRef.current

    if (!frame || !cover || !drawing) {
      return
    }

    const rect = frame.getBoundingClientRect()
    const coverCtx = prepareCanvas(cover, rect.width, rect.height)
    const drawingCtx = prepareCanvas(drawing, rect.width, rect.height)

    if (!coverCtx || !drawingCtx) {
      return
    }

    boundsRef.current = getLabelBounds(rect.width, rect.height)
    drawCover(coverCtx, rect.width, rect.height, 0)
  }, [])

  useEffect(() => {
    resizeCanvases()

    const frame = frameRef.current
    if (!frame) {
      return undefined
    }

    const observer = new ResizeObserver(resizeCanvases)
    observer.observe(frame)

    return () => observer.disconnect()
  }, [resizeCanvases])

  useEffect(() => {
    let animationFrame = 0
    let lastDraw = 0
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frameInterval = reduceMotion ? 2400 : 72

    const animate = (time: number) => {
      const cover = coverCanvasRef.current
      const frame = frameRef.current

      if (cover && frame && time - lastDraw >= frameInterval) {
        const rect = frame.getBoundingClientRect()
        const ctx = cover.getContext('2d')

        if (ctx) {
          ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0)
          drawCover(ctx, rect.width, rect.height, reduceMotion ? 0 : time / 950)
          lastDraw = time
        }
      }

      animationFrame = requestAnimationFrame(animate)
    }

    animationFrame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationFrame)
  }, [])

  const getPointerPoint = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const getMousePoint = (event: MouseEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const beginStroke = useCallback((point: Point) => {
    if (!pointInLabel(point, boundsRef.current)) {
      return false
    }

    isDrawingRef.current = true
    pointsRef.current = [point]

    const ctx = drawingCanvasRef.current?.getContext('2d')
    if (ctx) {
      ctx.save()
      labelPath(ctx, boundsRef.current)
      ctx.clip()
      ctx.fillStyle = penColorRef.current
      ctx.beginPath()
      ctx.arc(point.x, point.y, penSizeRef.current / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    return true
  }, [])

  const drawSmoothStroke = useCallback(() => {
    const canvas = drawingCanvasRef.current
    const ctx = canvas?.getContext('2d')
    const points = pointsRef.current

    if (!canvas || !ctx || points.length < 2) {
      return
    }

    const latest = points[points.length - 1]
    const previous = points[points.length - 2]
    const midpoint: Point = {
      x: (previous.x + latest.x) / 2,
      y: (previous.y + latest.y) / 2,
    }

    ctx.save()
    labelPath(ctx, boundsRef.current)
    ctx.clip()
    ctx.strokeStyle = penColorRef.current
    ctx.lineWidth = penSizeRef.current
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()

    if (points.length === 2) {
      ctx.moveTo(previous.x, previous.y)
    } else {
      const beforePrevious = points[points.length - 3]
      ctx.moveTo((beforePrevious.x + previous.x) / 2, (beforePrevious.y + previous.y) / 2)
    }

    ctx.quadraticCurveTo(previous.x, previous.y, midpoint.x, midpoint.y)
    ctx.stroke()
    ctx.restore()
  }, [])

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (beginStroke(getPointerPoint(event))) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) {
      return
    }

    const nativeEvent = event.nativeEvent
    const coalescedEvents =
      'getCoalescedEvents' in nativeEvent ? nativeEvent.getCoalescedEvents() : [nativeEvent]

    for (const pointerEvent of coalescedEvents) {
      const rect = event.currentTarget.getBoundingClientRect()
      pointsRef.current.push({
        x: pointerEvent.clientX - rect.left,
        y: pointerEvent.clientY - rect.top,
      })
      drawSmoothStroke()
    }
  }

  const stopDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (isDrawingRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    isDrawingRef.current = false
    pointsRef.current = []
  }

  const handleMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    beginStroke(getMousePoint(event))
  }

  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (event.buttons !== 1) {
      return
    }

    if (!isDrawingRef.current) {
      beginStroke(getMousePoint(event))
      return
    }

    pointsRef.current.push(getMousePoint(event))
    drawSmoothStroke()
  }

  const stopMouseDrawing = () => {
    isDrawingRef.current = false
    pointsRef.current = []
  }

  const clearDrawing = () => {
    const drawing = drawingCanvasRef.current
    const frame = frameRef.current

    if (drawing && frame) {
      const rect = frame.getBoundingClientRect()
      const ctx = drawing.getContext('2d')
      ctx?.clearRect(0, 0, rect.width, rect.height)
    }

    setIsClearing(true)
    setRippleKey('refresh')
    window.setTimeout(() => setIsClearing(false), 520)
    window.setTimeout(() => setRippleKey(''), 360)
  }

  const downloadNotebook = () => {
    const cover = coverCanvasRef.current
    const drawing = drawingCanvasRef.current

    if (!cover || !drawing) {
      return
    }

    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = cover.width
    exportCanvas.height = cover.height
    const ctx = exportCanvas.getContext('2d')

    if (!ctx) {
      return
    }

    ctx.drawImage(cover, 0, 0)
    ctx.drawImage(drawing, 0, 0)

    const link = document.createElement('a')
    link.download = 'composition-notebook.png'
    link.href = exportCanvas.toDataURL('image/png')
    link.click()

    setRippleKey('camera')
    window.setTimeout(() => setRippleKey(''), 360)
  }

  return (
    <main className="notebook-frame" ref={frameRef}>
      <canvas className="cover-canvas" ref={coverCanvasRef} aria-hidden="true" />
      <canvas
        className="drawing-canvas"
        ref={drawingCanvasRef}
        aria-label="Draw your name on the composition notebook label"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopMouseDrawing}
        onMouseLeave={stopMouseDrawing}
      />

      <div className="pen-controls" aria-label="Pen controls">
        <div className="color-row" role="group" aria-label="Pen color">
          {PEN_COLORS.map((color) => (
            <button
              aria-label={`Use ${color === '#111111' ? 'black' : color === '#d42027' ? 'red' : 'blue'} pen`}
              className={`color-button ${penColor === color ? 'is-selected' : ''}`}
              key={color}
              onClick={() => setPenColor(color)}
              style={{ '--swatch': color } as CSSProperties}
              type="button"
            />
          ))}
        </div>
        <input
          aria-label="Pen size"
          className="pen-slider"
          max="14"
          min="2"
          onChange={(event) => setPenSize(Number(event.target.value))}
          type="range"
          value={penSize}
        />
      </div>

      <div className="action-controls">
        <button
          aria-label="Clear notebook"
          className={`tool-button ${isClearing ? 'is-spinning' : ''} ${
            rippleKey === 'refresh' ? 'is-rippling' : ''
          }`}
          onClick={clearDrawing}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={22} strokeWidth={2.5} />
        </button>
        <button
          aria-label="Download notebook image"
          className={`tool-button ${rippleKey === 'camera' ? 'is-rippling' : ''}`}
          onClick={downloadNotebook}
          type="button"
        >
          <Camera aria-hidden="true" size={22} strokeWidth={2.5} />
        </button>
      </div>
    </main>
  )
}

export default App
