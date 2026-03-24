/**
 * MathUtils.js — Generic numerical methods.
 */

/**
 * Runge-Kutta 4th Order Integrator.
 * 
 * @param {number} t        Current time
 * @param {number[]} state  Current state vector
 * @param {number} dt       Time step
 * @param {function} derivFn (t, state) => derivative vector
 * @returns {number[]}      Next state vector
 */
export function rk4(t, state, dt, derivFn) {
    const k1 = derivFn(t, state);
    
    const s2 = state.map((v, i) => v + 0.5 * dt * k1[i]);
    const k2 = derivFn(t + 0.5 * dt, s2);
    
    const s3 = state.map((v, i) => v + 0.5 * dt * k2[i]);
    const k3 = derivFn(t + 0.5 * dt, s3);
    
    const s4 = state.map((v, i) => v + dt * k3[i]);
    const k4 = derivFn(t + dt, s4);
    
    return state.map((v, i) => v + (dt / 6.0) * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]));
}

/**
 * Solves Ax = b using Gaussian elimination with partial pivoting.
 * 
 * @param {number[][]} A  Matrix A (n x n)
 * @param {number[]} b    Vector b (n)
 * @returns {number[]}    Solution vector x
 */
export function solveLinearSystem(A, b) {
    const n = b.length;
    // Augment A with b
    let M = A.map((row, i) => [...row, b[i]]); 

    for (let i = 0; i < n; i++) {
        // Pivot
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
                maxRow = k;
            }
        }
        
        // Swap rows
        [M[i], M[maxRow]] = [M[maxRow], M[i]];
        
        // Eliminate
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(M[i][i]) < 1e-12) continue; // Singular or near-singular
            const c = -M[k][i] / M[i][i];
            for (let j = i; j <= n; j++) {
                M[k][j] = (i === j) ? 0 : M[k][j] + c * M[i][j];
            }
        }
    }

    // Back-substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        if (Math.abs(M[i][i]) < 1e-12) {
            x[i] = 0; // Handle singularity gracefully-ish
        } else {
            x[i] = M[i][n] / M[i][i];
            for (let k = i - 1; k >= 0; k--) {
                M[k][n] -= M[k][i] * x[i];
            }
        }
    }
    return x;
}
