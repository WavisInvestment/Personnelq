import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { BillingConfigService } from '../../common/billing/billing-config.service';

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PaystackError';
  }
}

export interface PaystackInitialized {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackTransaction {
  status: string; // success | failed | abandoned | ongoing | pending | reversed | queued
  reference: string;
  /** Smallest currency unit (kobo for NGN) */
  amount: number;
  currency: string;
  paid_at: string | null;
  channel: string | null;
  customer_email: string | null;
}

/**
 * Checks that a webhook really came from Paystack: HMAC-SHA512 of the *raw* request body with the secret key.
 * It must be the exact bytes received. Re-serialising parsed JSON can change them and break the check.
 */
export function verifyPaystackSignature(rawBody: Buffer | string, signature: string | undefined, secret: string | null): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const given = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

@Injectable()
export class PaystackClient {
  private http: AxiosInstance | null = null;

  constructor(private billing: BillingConfigService) {}

  isConfigured() {
    return this.billing.paystackConfigured();
  }

  private client(): AxiosInstance {
    if (!this.http) {
      this.http = axios.create({ baseURL: this.billing.paystackBaseUrl, timeout: 15_000 });
    }
    return this.http;
  }

  private async call<T>(run: (http: AxiosInstance, headers: Record<string, string>) => Promise<{ data: any }>): Promise<T> {
    const secret = this.billing.paystackSecretKey;
    if (!secret) throw new PaystackError('Paystack is not configured');

    try {
      const { data } = await run(this.client(), { Authorization: `Bearer ${secret}` });
      if (!data?.status) throw new PaystackError(data?.message || 'Paystack rejected the request');
      return data.data as T;
    } catch (err) {
      if (err instanceof PaystackError) throw err;
      if (axios.isAxiosError(err)) {
        throw new PaystackError(err.response?.data?.message || err.message, err.response?.status);
      }
      throw err;
    }
  }

  initialize(input: {
    email: string;
    amount: number;
    currency: string;
    reference: string;
    callback_url: string;
    metadata: Record<string, unknown>;
  }): Promise<PaystackInitialized> {
    return this.call((http, headers) => http.post('/transaction/initialize', input, { headers }));
  }

  /** Asks Paystack to return a whole payment to the customer. Refunds settle in days; "pending" is the normal first answer. */
  async refund(reference: string): Promise<{ id: string; status: string; amount: number }> {
    const d = await this.call<any>((http, headers) => http.post('/refund', { transaction: reference }, { headers }));
    return { id: String(d?.id ?? ''), status: String(d?.status ?? 'pending'), amount: Number(d?.amount ?? 0) };
  }

  async verify(reference: string): Promise<PaystackTransaction> {
    const data = await this.call<any>((http, headers) =>
      http.get(`/transaction/verify/${encodeURIComponent(reference)}`, { headers }),
    );
    return {
      status: String(data.status),
      reference: String(data.reference),
      amount: Number(data.amount),
      currency: String(data.currency),
      paid_at: data.paid_at ?? null,
      channel: data.channel ?? null,
      customer_email: data.customer?.email ?? null,
    };
  }
}
