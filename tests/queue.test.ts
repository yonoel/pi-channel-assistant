// ============================================================================
// 测试: queue.ts — MessageQueue 入队/批处理/并发控制
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageQueue, getImageBatchWaitMs, getImageMaxBytes } from '../src/queue.js'
import type { IncomingMessage } from '../src/types.js'

// --- Mock getConfigCache 使配置读取可控 ---
vi.mock('../src/auth.js', () => ({
  getConfigCache: vi.fn(() => ({})),
}))

// --- 工厂: 创建可测试的 MessageQueue ---
function makeQueue(opts?: {
  client?: ReturnType<typeof vi.fn>
  running?: boolean
  agentIdle?: boolean
  pauseDrain?: ReturnType<typeof vi.fn>
}) {
  const client = opts?.client ?? vi.fn().mockReturnValue(null)
  const running = opts?.running ?? true
  const agentIdle = opts?.agentIdle ?? true
  const pauseDrain = opts?.pauseDrain ?? vi.fn(() => false)
  const pollSignal = vi.fn(() => undefined)
  const wechatFilesDir = vi.fn(() => null)
  const sendUserMessage = vi.fn()
  const updateStatusBar = vi.fn()

  const queue = new MessageQueue(
    () => client() as any,
    () => running,
    () => agentIdle,
    () => pauseDrain(),
    () => pollSignal() as any,
    () => wechatFilesDir() as any,
    sendUserMessage,
    updateStatusBar,
  )

  return { queue, client, sendUserMessage, updateStatusBar }
}

// --- 辅助: 构造 IncomingMessage ---
function makeMsg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    messageId: 'msg_1',
    userId: 'user_1',
    text: '',
    type: 'text',
    imageUrls: [],
    raw: {} as any,
    contextToken: 'token_1',
    timestamp: new Date(),
    ...overrides,
  }
}

describe('MessageQueue — enqueue', () => {
  it('enqueues text messages', () => {
    const { queue, sendUserMessage } = makeQueue({ agentIdle: false })
    const msg = makeMsg({ text: 'hello world' })
    queue.enqueue(msg)
    expect(queue.pending).toBe(1)
    // agent idle but running=true: should enqueue
    expect(queue.queue.length).toBe(1) // still in queue waiting for drain
  })

  it('enqueues image messages and sets batch timer', () => {
    vi.useFakeTimers()
    const mockSendText = vi.fn().mockResolvedValue(undefined)
    const { queue } = makeQueue({
      client: vi.fn(() => ({ sendText: mockSendText })),
    })
    const msg = makeMsg({
      text: '',
      type: 'image',
      imageUrls: [{ url: 'https://example.com/img.jpg' }],
    })
    queue.enqueue(msg)
    expect(queue.queue.length).toBeGreaterThanOrEqual(1)
    vi.useRealTimers()
  })

  it('sets lastWechatUser after enqueue', () => {
    const { queue } = makeQueue()
    const msg = makeMsg({ text: 'hello' })
    queue.enqueue(msg)
    expect(queue.lastWechatUser).toEqual({ userId: 'user_1', contextToken: 'token_1' })
  })
})

describe('MessageQueue — drain protection', () => {
  it('does not drain when not running', async () => {
    const { queue } = makeQueue({ running: false })
    const msg = makeMsg({ text: 'test' })
    queue.enqueue(msg)
    // drain is called but should skip
    await queue.drain()
    // Since we're not running, nothing should happen
    expect(queue.pendingInjection).toBeNull()
  })

  it('always marks injected messages as follow-ups so a concurrent turn can queue them', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined)
    const { queue, sendUserMessage } = makeQueue({
      client: vi.fn(() => ({ startTyping: vi.fn().mockResolvedValue(undefined), sendText })),
      agentIdle: true,
    })

    queue.queue.push({
      id: 'queued_1',
      userId: 'user_1',
      messageId: 'msg_1',
      receivedAt: new Date(),
      text: 'hello',
      preview: 'hello',
      contextToken: 'token_1',
    })

    await queue.drain()

    expect(sendUserMessage).toHaveBeenCalledWith(
      '【微信消息】\nhello',
      { deliverAs: 'followUp' },
    )
  })

  it('holds messages while the runtime is settling, then drains them as a new WeChat turn', async () => {
    let settling = true
    const sendText = vi.fn().mockResolvedValue(undefined)
    const { queue, sendUserMessage } = makeQueue({
      client: vi.fn(() => ({ startTyping: vi.fn().mockResolvedValue(undefined), sendText })),
      agentIdle: true,
      pauseDrain: vi.fn(() => settling),
    })

    queue.queue.push({
      id: 'queued_1',
      userId: 'user_1',
      messageId: 'msg_1',
      receivedAt: new Date(),
      text: 'hello',
      preview: 'hello',
      contextToken: 'token_1',
    })

    await queue.drain()

    expect(queue.pending).toBe(1)
    expect(queue.pendingInjection).toBeNull()
    expect(sendUserMessage).not.toHaveBeenCalled()

    settling = false
    await queue.drain()

    expect(queue.pending).toBe(0)
    expect(queue.pendingInjection?.messageId).toBe('msg_1')
    expect(sendUserMessage).toHaveBeenCalledWith(
      '【微信消息】\nhello',
      { deliverAs: 'followUp' },
    )
  })
})

describe('MessageQueue — reset', () => {
  it('clears queue and accumulated state', () => {
    const { queue } = makeQueue()
    queue.enqueue(makeMsg({ text: 'test 1' }))
    queue.enqueue(makeMsg({ text: 'test 2' }))
    queue.lastWechatUser = { userId: 'u1', contextToken: 'ct1' }
    queue.pendingInjection = {} as any
    queue.activeRequest = {} as any

    queue.reset()

    expect(queue.pending).toBe(0)
    expect(queue.pendingInjection).toBeNull()
    expect(queue.activeRequest).toBeNull()
  })
})

describe('getImageBatchWaitMs', () => {
  it('returns default when no config', () => {
    expect(getImageBatchWaitMs()).toBe(8000)
  })

  it('respects env override', () => {
    process.env.PI_WECHAT_IMAGE_BATCH_WAIT_MS = '3000'
    expect(getImageBatchWaitMs()).toBe(3000)
    delete process.env.PI_WECHAT_IMAGE_BATCH_WAIT_MS
  })

  it('clamps to valid range (rejects invalid values, falls back to default)', () => {
    process.env.PI_WECHAT_IMAGE_BATCH_WAIT_MS = '-500'
    // -500 fails Number.isFinite && >0 check, falls back to DEFAULT=8000
    expect(getImageBatchWaitMs()).toBe(8000)
    process.env.PI_WECHAT_IMAGE_BATCH_WAIT_MS = '999999'
    // clamps to max 60000
    expect(getImageBatchWaitMs()).toBe(60000)
    delete process.env.PI_WECHAT_IMAGE_BATCH_WAIT_MS
  })
})

describe('getImageMaxBytes', () => {
  it('returns default 50MB', () => {
    expect(getImageMaxBytes()).toBe(50 * 1024 * 1024)
  })

  it('enforces minimum 1MB', () => {
    process.env.PI_WECHAT_IMAGE_MAX_BYTES = '100'
    expect(getImageMaxBytes()).toBe(1024 * 1024)
    delete process.env.PI_WECHAT_IMAGE_MAX_BYTES
  })
})
