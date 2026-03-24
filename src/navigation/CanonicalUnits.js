export const G_SI = 6.674e-11;
export const G0 = 9.80665;
export const SOFTENING_SI = 1e6;

/**
 * Utility for Canonical Unit scaling in interplanetary trajectories.
 * Normalizes large physical quantities to values near 1.0 to prevent numerical
 * ill-conditioning in solvers and integrators.
 */
export class CanonicalUnits {
    /**
     * @param {number} du   Distance Unit (meters, e.g. 1 AU = 1.496e11)
     * @param {number} mu   Primary body gravitational parameter (m^3/s^2, e.g. Sun = 1.327e20)
     */
    constructor(du, mu) {
        this.DU = du;
        this.MU = mu;
        
        // Derived units
        // TU such that mu_canonical = 1.0
        // mu_c = mu_real * (TU^2 / DU^3) = 1.0 => TU = sqrt(DU^3 / mu_real)
        this.TU = Math.sqrt(Math.pow(this.DU, 3) / this.MU);
        this.VU = this.DU / this.TU;
        this.AccU = this.DU / (this.TU * this.TU);
        
        // Mass unit isn't directly needed if we use mu_ratio, 
        // but can be defined as m_primary = 1.0
    }

    // Positions (meters -> DU)
    toPos(val) { return val / this.DU; }
    fromPos(val) { return val * this.DU; }

    // Velocities (m/s -> VU)
    toVel(val) { return val / this.VU; }
    fromVel(val) { return val * this.VU; }

    // Accelerations (m/s^2 -> AccU)
    toAcc(val) { return val / this.AccU; }
    fromAcc(val) { return val * this.AccU; }

    // Time (seconds -> TU)
    toTime(val) { return val / this.TU; }
    fromTime(val) { return val * this.TU; }

    // Gravitational Parameter (m^3/s^2 -> mu_c)
    toMu(val) { return val / this.MU; }

    /**
     * Scale a full state vector [x, y, vx, vy, m]
     */
    toState(state) {
        return [
            state[0] / this.DU, 
            state[1] / this.DU,
            state[2] / this.VU, 
            state[3] / this.VU,
            state[4] // Mass is typically not scaled unless we define a MassU
        ];
    }

    /**
     * Scale costates (lambda_r, lambda_v)
     * Hamiltonian: H = 1/2*a^2 + lr*v + lv*(g + a)
     * Since a is AccU, v is VU, we need to ensure units are consistent.
     * a_opt = -lv => lv has units of AccU.
     * lr has units of H / v => (AccU^2) / VU = (DU^2/TU^4) / (DU/TU) = DU/TU^3 = AccU/TU
     */
    toCostates(costates) {
        return [
            costates[0] / (this.AccU / this.TU), // lrx
            costates[1] / (this.AccU / this.TU), // lry
            costates[2] / this.AccU,             // lvx
            costates[3] / this.AccU              // lvy
        ];
    }

    fromCostates(costates) {
        return [
            costates[0] * (this.AccU / this.TU),
            costates[1] * (this.AccU / this.TU),
            costates[2] * this.AccU,
            costates[3] * this.AccU
        ];
    }
}
