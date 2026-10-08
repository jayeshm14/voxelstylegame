/**
 * The only sanctioned diagnostic sink in the codebase.
 *
 * No other module may call `console.*` directly: routing every diagnostic
 * through one object means the output can be filtered, captured in a test, or
 * silenced in a single place, and it makes "where does this log come from?"
 * answerable by inspection.
 *
 * Logging is a *diagnostic* concern only. Nothing in the simulation may read
 * from here or depend on whether a message was emitted — world state must not
 * change based on logging (Constitution Principle I).
 */

/** Ordered from most to least verbose. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

export interface LogRecord {
  readonly level: LogLevel
  readonly message: string
  readonly args: readonly unknown[]
}

/** Where a record goes. Defaults to `console`. */
export type LogSink = (record: LogRecord) => void

const SEVERITY: Readonly<Record<LogLevel, number>> = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
})

function toConsole(record: LogRecord): void {
  const prefix = `[voxel-realms:${record.level}]`
  const write =
    record.level === 'error'
      ? console.error
      : record.level === 'warn'
        ? console.warn
        : record.level === 'debug'
          ? console.debug
          : console.info
  write(prefix, record.message, ...record.args)
}

let sink: LogSink = toConsole
let threshold: LogLevel = 'info'

/** Replace the destination — used by tests to capture records without stdout. */
export function setLogSink(next: LogSink): LogSink {
  const previous = sink
  sink = next
  return previous
}

/** Raise or lower verbosity. Records below the threshold are dropped. */
export function setLogLevel(level: LogLevel): void {
  threshold = level
}

export function getLogLevel(): LogLevel {
  return threshold
}

function emit(level: LogLevel, message: string, args: readonly unknown[]): void {
  if (SEVERITY[level] < SEVERITY[threshold]) return
  sink({ level, message, args })
}

export const Logger = Object.freeze({
  /** Captured detail for diagnosing a specific subsystem while developing. */
  debug: (message: string, ...args: readonly unknown[]): void => emit('debug', message, args),
  /** Normal lifecycle information: world opened, save written, phase started. */
  info: (message: string, ...args: readonly unknown[]): void => emit('info', message, args),
  /** Recoverable trouble: a save failed, a setting was clamped, a lock was held. */
  warn: (message: string, ...args: readonly unknown[]): void => emit('warn', message, args),
  /** A failure the player or developer must know about. */
  error: (message: string, ...args: readonly unknown[]): void => emit('error', message, args),
  setLevel: setLogLevel,
  getLevel: getLogLevel,
  setSink: setLogSink,
})
