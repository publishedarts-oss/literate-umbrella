import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

export const PaymentEngine = {
  // WEB3 SIGNATURE VERIFICATION (Zero-Latency)
  verifySolanaSignature(
    publicKeyBase58: string,
    signatureHex: string,
    messageString: string
  ): boolean {
    try {
      const publicKey = new PublicKey(publicKeyBase58).toBytes();
      const signature = Buffer.from(signatureHex, "hex");
      const message = new TextEncoder().encode(messageString);
      return nacl.sign.detached.verify(message, signature, publicKey);
    } catch {
      return false;
    }
  },

  // MULTI-TOKEN ECOSYSTEM PROMOTION REWARDS
  // Calculates system discounts or dynamic curation perks based on coin staking profiles
  calculateLoyaltyMultiplier(balances: {
    flipcoinBalance?: number | null;
    worldfortecoinBalance?: number | null;
    quancoinBalance?: number | null;
  } | null): number {
    if (!balances) return 1.0;
    const totalHeld =
      (balances.flipcoinBalance ?? 0) * 1.0 +
      (balances.worldfortecoinBalance ?? 0) * 1.5 + // Higher weighting for Arweave storage utility
      (balances.quancoinBalance ?? 0) * 1.2;

    if (totalHeld > 10000) return 0.85; // 15% discount for Alpha Whales
    if (totalHeld > 1000) return 0.92; // 8% discount for Active Holders
    return 1.0;
  },
};
