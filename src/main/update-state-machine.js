/**
 * src/main/update-state-machine.js
 * Explicit, Validated Update State Machine
 *
 * Implements strict state transitions, transition validation, structured logging,
 * and immutable transition rules for the auto-update lifecycle.
 */

const VALID_STATES = Object.freeze([
  'idle',
  'checking',
  'up-to-date',
  'update-available',
  'downloading',
  'downloaded',
  'waiting-for-safe-point',
  'preparing-maintenance',
  'draining-operations',
  'stopping-services',
  'installing',
  'restarting',
  'verifying-health',
  'completed',
  'failed',
  'rollback-required',
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  'idle': ['checking', 'update-available', 'downloading', 'failed'],
  'checking': ['up-to-date', 'update-available', 'failed', 'idle'],
  'up-to-date': ['idle', 'checking'],
  'update-available': ['downloading', 'idle', 'failed'],
  'downloading': ['downloaded', 'failed', 'idle'],
  'downloaded': ['waiting-for-safe-point', 'preparing-maintenance', 'installing', 'failed', 'idle'],
  'waiting-for-safe-point': ['preparing-maintenance', 'draining-operations', 'failed', 'idle'],
  'preparing-maintenance': ['draining-operations', 'waiting-for-safe-point', 'failed'],
  'draining-operations': ['stopping-services', 'waiting-for-safe-point', 'failed'],
  'stopping-services': ['installing', 'failed', 'rollback-required'],
  'installing': ['restarting', 'failed', 'rollback-required'],
  'restarting': ['verifying-health', 'failed', 'rollback-required'],
  'verifying-health': ['completed', 'rollback-required', 'failed'],
  'completed': ['idle'],
  'failed': ['idle', 'checking'],
  'rollback-required': ['failed', 'idle'],
});

class UpdateStateMachine {
  constructor(options = {}) {
    this.state = options.initialState || 'idle';
    this.log = options.log || console.log;
    this.history = [];
    this.maxHistory = options.maxHistory || 50;
    this.context = {
      version: null,
      edition: null,
      channel: null,
      classification: 'normal',
      error: null,
      progress: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  canTransitionTo(nextState) {
    if (!VALID_STATES.includes(nextState)) {
      return false;
    }
    const allowed = ALLOWED_TRANSITIONS[this.state] || [];
    return allowed.includes(nextState);
  }

  transition(nextState, payload = {}) {
    const previousState = this.state;

    if (!VALID_STATES.includes(nextState)) {
      const err = new Error(`[STATE-MACHINE] Invalid state name: '${nextState}'`);
      this.log(err.message);
      throw err;
    }

    const allowed = ALLOWED_TRANSITIONS[previousState] || [];
    if (!allowed.includes(nextState)) {
      const err = new Error(`[STATE-MACHINE] Invalid transition from '${previousState}' to '${nextState}'`);
      this.log(err.message);
      throw err;
    }

    const timestamp = new Date().toISOString();
    this.state = nextState;
    this.context = {
      ...this.context,
      ...payload,
      updatedAt: timestamp,
    };

    const record = {
      from: previousState,
      to: nextState,
      timestamp,
      payload: { ...payload },
    };

    this.history.push(record);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.log(`[STATE-MACHINE] Transition: ${previousState} -> ${nextState} ${payload.reason ? `(${payload.reason})` : ''}`);
    return record;
  }

  reset(reason = 'manual_reset') {
    this.log(`[STATE-MACHINE] Resetting state to 'idle' (${reason})`);
    this.state = 'idle';
    this.context.error = null;
    this.context.progress = 0;
    this.context.updatedAt = new Date().toISOString();
  }

  getState() {
    return this.state;
  }

  getContext() {
    return { ...this.context, state: this.state };
  }

  getHistory() {
    return [...this.history];
  }
}

module.exports = {
  VALID_STATES,
  ALLOWED_TRANSITIONS,
  UpdateStateMachine,
};
