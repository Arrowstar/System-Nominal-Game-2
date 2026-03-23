/**
 * Wallet module to centralize credit management.
 */
class Wallet {
  constructor(initialCredits = 75000) {
    this._credits = initialCredits;
  }

  get credits() {
    return this._credits;
  }

  set credits(value) {
    this._credits = value;
  }

  add(amount) {
    this._credits += amount;
  }

  deduct(amount) {
    if (this._credits >= amount) {
      this._credits -= amount;
      return true;
    }
    return false;
  }
}

export const playerWallet = new Wallet();
if (typeof window !== 'undefined') {
  window.Wallet = playerWallet; // For ease of access
}
export default playerWallet;
