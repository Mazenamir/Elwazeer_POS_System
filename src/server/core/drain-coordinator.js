/**
 * src/server/core/drain-coordinator.js
 * Central Safe Operation Drain Coordinator
 *
 * Coordinates business operations, transactions, and background tasks before updates:
 * - Maintenance gate: blocks NEW mutating writes
 * - In-flight operation registry: tracks sales, payments, refunds, cash drawer,
 *   rentals, inventory mutations, sync jobs, and migrations
 * - Non-destructive timeout & graceful recovery
 * - Clean status reporting for Electron supervisor and UI
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class OperationDrainCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.isMaintenanceActive = false;
    this.maintenanceReason = null;
    this.maintenanceActivatedAt = null;
    this.activeOperations = new Map(); // opId -> { id, type, details, startTime }
    this.staleTimeoutMs = options.staleTimeoutMs || 120000; // 2 minutes stale threshold
    this.log = options.log || console.log;
  }

  /**
   * Register the start of a protected business operation
   */
  startOperation(type, details = {}) {
    if (this.isMaintenanceActive) {
      throw new Error('MAINTENANCE_IN_PROGRESS: New operations are paused for safe system update.');
    }

    const id = `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const op = {
      id,
      type,
      details,
      startTime: Date.now(),
    };

    this.activeOperations.set(id, op);
    this.emit('operation-started', op);

    let ended = false;
    const end = (result = {}) => {
      if (ended) return;
      ended = true;
      const duration = Date.now() - op.startTime;
      this.activeOperations.delete(id);
      this.emit('operation-ended', { ...op, duration, result });
    };

    return { id, end };
  }

  /**
   * Activate maintenance mode to block new mutating operations
   */
  activateMaintenance(reason = 'System maintenance for update') {
    this.isMaintenanceActive = true;
    this.maintenanceReason = reason;
    this.maintenanceActivatedAt = new Date().toISOString();
    this.log(`[DRAIN-COORDINATOR] Maintenance gate activated: ${reason}`);
    this.emit('maintenance-activated', { reason, activeCount: this.activeOperations.size });
    return this.getStatus();
  }

  /**
   * Deactivate maintenance mode (e.g. if update canceled or health check failed)
   */
  deactivateMaintenance() {
    this.isMaintenanceActive = false;
    this.maintenanceReason = null;
    this.maintenanceActivatedAt = null;
    this.log('[DRAIN-COORDINATOR] Maintenance gate deactivated. Normal operations resumed.');
    this.emit('maintenance-deactivated');
    return this.getStatus();
  }

  /**
   * Wait for all active operations to safely drain without killing them
   */
  async waitForDrain(timeoutMs = 60000) {
    if (!this.isMaintenanceActive) {
      this.activateMaintenance('Draining operations for system update');
    }

    const startTime = Date.now();
    this.log(`[DRAIN-COORDINATOR] Waiting for ${this.activeOperations.size} active operations to drain (Timeout: ${timeoutMs}ms)...`);

    while (Date.now() - startTime < timeoutMs) {
      this.cleanupStaleOperations();

      if (this.activeOperations.size === 0) {
        this.log('[DRAIN-COORDINATOR] All active operations drained safely. Ready for shutdown.');
        return {
          drained: true,
          remainingCount: 0,
          elapsedMs: Date.now() - startTime,
        };
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    // Timeout reached without force-killing
    const remaining = Array.from(this.activeOperations.values()).map((op) => ({
      id: op.id,
      type: op.type,
      elapsedMs: Date.now() - op.startTime,
      details: op.details,
    }));

    this.log(`[DRAIN-COORDINATOR] Drain timeout reached. ${remaining.length} operation(s) still active.`);
    return {
      drained: false,
      remainingCount: remaining.length,
      remainingOperations: remaining,
      elapsedMs: Date.now() - startTime,
      error: 'DRAIN_TIMEOUT: Active transactions did not finish within timeout period. Safe shutdown suspended.',
    };
  }

  /**
   * Clean up abandoned or expired operations
   */
  cleanupStaleOperations() {
    const now = Date.now();
    for (const [id, op] of this.activeOperations.entries()) {
      if (now - op.startTime > this.staleTimeoutMs) {
        this.log(`[DRAIN-COORDINATOR] Warning: Stale operation detected and marked abandoned: ${op.type} (${id})`);
        this.activeOperations.delete(id);
      }
    }
  }

  /**
   * Get current coordinator state
   */
  getStatus() {
    this.cleanupStaleOperations();
    return {
      isMaintenanceActive: this.isMaintenanceActive,
      maintenanceReason: this.maintenanceReason,
      maintenanceActivatedAt: this.maintenanceActivatedAt,
      activeCount: this.activeOperations.size,
      operations: Array.from(this.activeOperations.values()).map((op) => ({
        id: op.id,
        type: op.type,
        elapsedMs: Date.now() - op.startTime,
      })),
    };
  }

  /**
   * Express middleware to enforce maintenance gating and track mutating operations
   */
  getMiddleware() {
    return (req, res, next) => {
      // 1. Always allow health checks, status checks, and login authentication
      const isInternalOrSafe = (
        req.path === '/api/server-time' ||
        req.path === '/api/internal/system/drain-status' ||
        req.path === '/api/internal/system/maintenance' ||
        req.path === '/api/auth/login' ||
        req.path.startsWith('/uploads/') ||
        !req.path.startsWith('/api/')
      );

      const isReadMethod = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';

      if (this.isMaintenanceActive) {
        if (!isInternalOrSafe && !isReadMethod) {
          return res.status(503).json({
            error: 'maintenance_active',
            code: 'SYSTEM_MAINTENANCE',
            message: 'النظام في وضع الترقية الآمنة حالياً لتطبيق تحديث ضروري. العمليات الجديدة متوقفة مؤقتاً لحين اكتمال التحديث.',
            maintenanceReason: this.maintenanceReason,
          });
        }
      }

      // Track mutating operations
      if (!isReadMethod && req.path.startsWith('/api/')) {
        let opType = 'mutation';
        if (req.path.includes('/sales') || req.path.includes('/orders')) opType = 'sale_mutation';
        else if (req.path.includes('/expenses')) opType = 'expense_mutation';
        else if (req.path.includes('/inventory') || req.path.includes('/transfers')) opType = 'inventory_mutation';
        else if (req.path.includes('/rentals')) opType = 'rental_mutation';
        else if (req.path.includes('/sync')) opType = 'sync_mutation';
        else if (req.path.includes('/hr') || req.path.includes('/employees')) opType = 'payroll_mutation';

        try {
          const { end } = this.startOperation(opType, {
            path: req.path,
            method: req.method,
            user: req.user ? req.user.username : 'anonymous',
          });

          const completeOp = () => {
            end({ statusCode: res.statusCode });
          };

          res.once('finish', completeOp);
          res.once('close', completeOp);
        } catch (err) {
          return res.status(503).json({
            error: 'maintenance_active',
            message: err.message,
          });
        }
      }

      next();
    };
  }
}

// Global Singleton Instance
const drainCoordinator = new OperationDrainCoordinator();

module.exports = {
  OperationDrainCoordinator,
  drainCoordinator,
};
