// Outbound port: supply time.
// Injected rather than read from a global so determinism is testable and no use
// case can reach a hidden ambient clock.

export interface ClockPort {
  nowMs(): number;
}
