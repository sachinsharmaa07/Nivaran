interface StoredOtp {
  otp: string;
  expiresAt: number;
}

const otpStore = new Map<string, StoredOtp>();

export class MockOtpAdapter {
  /**
   * Generates a 6-digit OTP, stores it with 5 min expiry, and logs it.
   * Phone number is masked for logging.
   */
  static async sendOtp(phone: string): Promise<{ success: boolean; otp: string }> {
    await Promise.resolve();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    otpStore.set(phone, { otp, expiresAt });

    const maskedPhone = phone.length > 5 ? phone.slice(0, 3) + "****" + phone.slice(-2) : "***";
    console.log(`[MockOtpAdapter] Demo OTP for ${maskedPhone}: ${otp}`);

    return { success: true, otp };
  }

  static verifyOtp(phone: string, otp: string): boolean {
    const entry = otpStore.get(phone);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(phone);
      return false;
    }
    if (entry.otp === otp) {
      otpStore.delete(phone);
      return true;
    }
    return false;
  }
}
