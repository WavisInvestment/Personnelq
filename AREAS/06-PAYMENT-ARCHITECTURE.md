# Area 6: Payment Architecture

**Status:** 🔴 In Progress  
**Priority:** HIGH — Revenue model, business critical  
**Depends On:** Area 1 ✅, Area 5 🔴

---

## Overview

Payment architecture defines how we monetize and process transactions.

**Scope:**
- Pricing models (one-time, subscription)
- Payment gateway integration (Paystack)
- Billing cycles and invoicing
- Refunds and dispute handling
- Revenue tracking and reconciliation

---

## 💰 Pricing Strategy (To Be Confirmed with Client)

### Option A: One-Time Per Assessment (MVP Focus)

Individual users pay per assessment taken.

**Pricing:**
```
OCEAN Assessment: $2-5 USD per attempt
Other Assessments: $3-10 USD per attempt (based on complexity)

Example:
- User takes OCEAN: Pay $3
- User retakes OCEAN (allowed 3x/year): Pay $3 per attempt
- Total potential revenue per user: $9/year

Platform split: 70% creator / 30% platform
```

**Pros:**
- Simple to implement
- Low barrier to entry
- Users see immediate value

**Cons:**
- Unpredictable revenue
- Lower lifetime value
- Requires constant user acquisition

---

### Option B: Organization Subscription (Tier-Based)

Companies, schools, churches pay monthly/yearly for team access.

**Pricing Tiers:**

```
STARTER PLAN
- Up to 10 employees/students/members
- 1 assessment type (OCEAN)
- Basic analytics
- Email support
- Price: $49/month or $490/year (2 months free)

PROFESSIONAL PLAN
- Up to 100 employees/students/members
- Unlimited assessment types
- Advanced analytics
- Team compatibility insights
- CSV/PDF exports
- Priority email support
- White-label reports
- Price: $199/month or $1,990/year

ENTERPRISE PLAN
- Unlimited seats
- Everything in Professional
- API access
- Dedicated account manager
- Custom integrations
- SLA: 99.9% uptime
- Price: Custom (minimum $999/month)

Seat Overage: $5 per additional seat/month (e.g., 105 seats on Starter plan)
```

**Pro Features:**
- Predictable recurring revenue
- Higher lifetime value
- Stronger customer retention
- Upsell opportunities

**Con:**
- Higher implementation complexity
- Requires more features in MVP

---

### Option C: Hybrid (RECOMMENDED)

Individuals pay per assessment + Organizations pay subscription.

```
Individual Pricing:
- OCEAN: $3 per attempt
- Leadership: $5 per attempt
- Team Building: $7 per attempt

Organization Pricing:
- Starter: $49/month
- Professional: $199/month
- Enterprise: Custom

User takes test individually: Pay $3 → Platform keeps $3
User invited by company to take test: Company pays subscription → No additional charge to user
```

**Advantage:** Best of both models, maximizes revenue

---

## 🔄 Payment Flow (Recommended: Hybrid)

### Individual Purchase Flow

```
User clicks "Take Assessment"
  ↓
User logged in?
  ├─→ NO: 
  │   ├─→ Offer "Sign up for free account"
  │   ├─→ Or "Pay as guest (no account needed)"
  │   └─→ If "Pay as guest": Proceed to checkout
  │
  └─→ YES: 
      └─→ Show price & confirm

User clicks "Continue to Payment"
  ↓
Redirect to Paystack checkout
  ├─→ User enters payment info (one-time, not saved)
  ├─→ Paystack processes payment
  └─→ Webhook confirms payment

Backend receives Paystack webhook (payment.success)
  ├─→ Create Payment record in database
  ├─→ Mark user as paid
  ├─→ Send confirmation email
  └─→ Redirect user to assessment

User completes assessment
  ├─→ Results generated
  ├─→ PDF created
  ├─→ Email sent with results
  └─→ User can download anytime
```

### Organization Subscription Flow

```
HR Admin signs up company
  ↓
Selects plan (Starter/Professional/Enterprise)
  ├─→ Starter: $49/month
  ├─→ Professional: $199/month
  └─→ Enterprise: Contact sales

Shows billing details
  ├─→ Company name
  ├─→ Billing email
  ├─→ Billing address
  └─→ Number of seats

HR clicks "Subscribe"
  ↓
Redirect to Paystack checkout
  ├─→ Charge first month immediately
  ├─→ Setup recurring charge (monthly or yearly)
  └─→ Save payment method for recurring

Paystack processes payment
  ├─→ Charge succeeds → Activate subscription
  ├─→ Charge fails → Show error, request retry
  └─→ Send confirmation email

Subscription activated
  ├─→ HR can now invite employees
  ├─→ All employees use plan features (no per-person charge)
  ├─→ Recurring charge on same day each month
  └─→ 14-day trial available (optional)

Subscription renewal (monthly)
  ├─→ Auto-charge on due date
  ├─→ If fails: Retry 3 times over 7 days
  ├─→ If final failure: Suspend account + send notification
  └─→ Send invoice to billing email
```

---

## 🔗 Paystack Integration

### Setup

1. **Create Paystack Account**
   - Go to paystack.com
   - Sign up for business account
   - Verify business details
   - Get API keys (public & secret)

2. **Backend Integration**
   - Store API keys in environment variables
   - Use Paystack SDK (or REST API calls)
   - Implement webhook receiver

### Payment Creation

```typescript
// Backend: Initiate payment
async initiatePayment(req: InitiatePaymentDto) {
  const { email, amount, metadata } = req;
  
  const response = await paystack.transaction.initialize({
    email,
    amount: amount * 100, // Convert to kobo (cents)
    metadata: {
      user_id: userId,
      assessment_id: assessmentId,
      type: 'assessment' // or 'subscription'
    }
  });
  
  // Save pending payment in database
  await paymentsService.create({
    user_id: userId,
    amount,
    currency: 'NGN', // or USD
    payment_gateway_id: response.reference,
    status: 'pending'
  });
  
  // Return authorization URL to frontend
  return {
    authorization_url: response.authorization_url,
    access_code: response.access_code,
    reference: response.reference
  };
}
```

### Webhook Handler

```typescript
// Backend: Handle Paystack webhook
@Post('/webhooks/paystack')
async handlePaystackWebhook(@Body() data: any, @Headers() headers: any) {
  // 1. Verify webhook signature
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(data))
    .digest('hex');
    
  if (hash !== headers['x-paystack-signature']) {
    throw new UnauthorizedException('Invalid signature');
  }
  
  // 2. Check if payment succeeded
  if (data.event !== 'charge.success') {
    return { status: 'ok' }; // Ignore other events
  }
  
  const { reference, amount, metadata } = data.data;
  
  // 3. Update payment record
  const payment = await paymentsService.findByReference(reference);
  payment.status = 'completed';
  payment.processed_at = new Date();
  await paymentsService.update(payment);
  
  // 4. Create subscription (if subscription payment)
  if (metadata.type === 'subscription') {
    await subscriptionsService.create({
      organization_id: metadata.org_id,
      plan_type: metadata.plan_type,
      payment_id: payment.id,
      status: 'active',
      renews_at: addMonths(new Date(), 1)
    });
  }
  
  // 5. Send confirmation email
  await emailService.sendPaymentConfirmation(payment.user_id);
  
  // 6. Return success to Paystack
  return { status: 'ok' };
}
```

### Subscription Management

```typescript
// Handle recurring subscription charges
async chargeRecurringSubscriptions() {
  // Find subscriptions due for renewal
  const dueSubscriptions = await subscriptionsService.findDueForRenewal();
  
  for (const subscription of dueSubscriptions) {
    try {
      // Charge using saved payment method
      const payment = await paystack.charge.createRecurring({
        authorization_code: subscription.authorization_code,
        email: subscription.org.billing_email,
        amount: getPriceInKobo(subscription.plan_type)
      });
      
      // Update subscription
      subscription.status = 'active';
      subscription.renews_at = addMonths(new Date(), 1);
      subscription.last_charged_at = new Date();
      await subscriptionsService.update(subscription);
      
      // Create invoice record
      await invoicesService.create({
        subscription_id: subscription.id,
        amount: getPriceInKobo(subscription.plan_type),
        status: 'paid',
        due_date: subscription.renews_at
      });
      
      // Send invoice email
      await emailService.sendInvoice(subscription.org.billing_email);
      
    } catch (error) {
      // Log failure, will retry
      await subscriptionsService.logChargeFailure(subscription.id, error);
    }
  }
}
```

---

## 💳 Subscription Management

### Subscription States

```
FREE (Trial)
  ├─→ 14-day trial period
  ├─→ Full feature access
  └─→ Auto-converts to paid or cancels

ACTIVE
  ├─→ Payment method active
  ├─→ Recurring charges working
  └─→ All features enabled

PAYMENT_FAILED
  ├─→ Automatic charge failed
  ├─→ Retry every 24 hours for 7 days
  ├─→ Send notification to admin
  └─→ If resolved: Back to ACTIVE

SUSPENDED
  ├─→ After 7 days of failed payments
  ├─→ Users can still view results (read-only)
  ├─→ Cannot invite new employees
  ├─→ Cannot create new assessments
  └─→ Must update payment method to reactivate

CANCELLED
  ├─→ User or admin cancelled
  ├─→ Cancels on next renewal date (or immediately if requested)
  ├─→ Retains access through end of billing period
  └─→ Can resubscribe anytime
```

### Upgrade/Downgrade

```
Upgrade (Starter → Professional):
1. Calculate pro-rata amount
   - Remaining days in current billing cycle
   - Difference in plan price
   - Charge immediately or credit
2. Update subscription
3. Send confirmation email
4. Effective immediately

Downgrade (Professional → Starter):
1. Calculate pro-rata credit
2. Apply credit to next billing cycle
3. Send confirmation email
4. Effective on next billing date (not immediate)
   - Prevents churn gaming
```

### Cancellation

```
HR Admin clicks "Cancel Subscription"
  ↓
Show confirmation dialog:
  "Why are you canceling?" (feedback)
  ↓
Ask "Cancel immediately or at end of billing period?"
  ├─→ Immediately:
  │   ├─→ Calculate refund for unused period (if applicable)
  │   ├─→ Process refund (if eligible)
  │   └─→ Disable account immediately
  │
  └─→ End of billing period:
      ├─→ Keep features active until renewal date
      ├─→ Do not charge on renewal date
      └─→ Access disabled on renewal date
```

---

## 💰 Invoicing & Receipts

### Invoice Record

```
Invoice
├── Invoice Number: INV-2026-00001 (unique, sequential)
├── Organization: Acme Corp
├── Subscription Plan: Professional
├── Billing Period: Sept 1 - Sept 30, 2026
├── Amount: $199.00 USD
├── Tax (if applicable): $20 USD (10% example)
├── Total: $219.00 USD
├── Due Date: Sept 30, 2026
├── Status: Paid
├── Payment Reference: paystack-ref-12345
├── PDF URL: (downloadable invoice)
└── Issued: Sept 1, 2026
```

### PDF Invoices

Generate PDF using same system as assessment reports.

```
Invoice sent to: billing_email@company.com

Can be:
- Downloaded from dashboard
- Re-sent via email
- Used for accounting/tax purposes
```

---

## 🔄 Refund Handling

### Refund Policy

```
Refund Eligible:
- Within 30 days of purchase
- Assessment not started
- Technical error

Refund Not Eligible:
- After 30 days
- Assessment started
- No technical error
- User changed mind (after 30 days)

Refund Process:
1. Admin reviews request
2. If approved: Process refund via Paystack
3. Paystack returns funds to original card (2-5 business days)
4. Create Refund record in database
5. Send confirmation email
```

### Dispute Handling

```
If customer disputes charge with their bank:
1. Paystack notifies via webhook
2. Log dispute in database
3. Email admin for manual review
4. Paystack resolves through chargeback process
5. We provide evidence (order confirmation, terms, etc.)
6. Bank or Paystack rules on dispute
```

---

## 📊 Revenue Reporting

### Admin Dashboard

```
Revenue Metrics:
├── Total Revenue (YTD)
├── Recurring Revenue (MRR/ARR)
├── Average Order Value
├── Subscription Count
├── Churn Rate
├── Customer Lifetime Value
├── Top Assessments by Revenue
└── Revenue by Geography (if multi-region)

Trends:
├── Revenue trend (30/60/90 day)
├── New subscriptions vs cancellations
├── Payment failure rate
└── Refund rate
```

### Reconciliation

```
Daily reconciliation:
1. Get transactions from Paystack
2. Compare with database payments
3. Flag any mismatches
4. Investigate discrepancies
5. Update records if needed

Monthly reconciliation:
1. Sum all payments
2. Sum all refunds
3. Sum all chargebacks
4. Calculate net revenue
5. Match against bank statement
6. Generate accounting report
```

---

## 🏭 Fraud Prevention

### Transaction Validation

```
Check amount:
- Does amount match expected price?
- Is amount within reasonable range?

Check metadata:
- Does email match user?
- Does user_id exist in database?
- Is organization valid?

Check location:
- Is payment location consistent with user location?
- Flag unusual locations

Check velocity:
- Is this user's 100th payment in 1 day? (suspicious)
- Is this IP making 1000 payments per minute? (bot)
```

### Suspicious Activity

```
Monitor:
- Multiple failed attempts from same IP
- Payments with mismatched email/user
- Unusually large transactions
- Geographic anomalies

Actions:
- Log suspicious activity
- Manual review for high-risk transactions
- Require additional verification
- Block if clearly fraudulent
```

---

## 🌍 Multi-Currency Support

### Currency Support (MVP)

```
Phase 1 (MVP):
- USD (primary)
- NGN (Naira, for Nigerian organizations)
- GHS (Ghana Cedis, optional)

Phase 2+:
- EUR, GBP, ZAR, KES, etc.
```

### Currency Handling

```
Pricing displayed in user's currency
- Detect user location
- Convert prices real-time via Paystack rates
- Show equivalent in multiple currencies

Charging in local currency:
- Reduces international fees
- Better for customers
- Paystack handles conversion
```

---

## 📋 Database Tables Required

(Added to Area 4 schema)

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  plan_type ENUM('starter', 'professional', 'enterprise'),
  status ENUM('free', 'active', 'payment_failed', 'suspended', 'cancelled'),
  authorization_code VARCHAR(255), -- For recurring charges
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  subscription_id UUID REFERENCES subscriptions(id),
  invoice_number VARCHAR(20) UNIQUE,
  amount_cents INT,
  currency VARCHAR(3),
  status ENUM('draft', 'sent', 'paid', 'failed', 'refunded'),
  due_date TIMESTAMP,
  paid_at TIMESTAMP,
  created_at TIMESTAMP
);

CREATE TABLE refunds (
  id UUID PRIMARY KEY,
  payment_id UUID REFERENCES payments(id),
  amount_cents INT,
  reason VARCHAR(255),
  status ENUM('pending', 'completed', 'failed'),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  processed_at TIMESTAMP
);
```

---

## ❓ Open Questions for Client

1. **Primary Business Model:**
   - Option A (one-time)? Option B (subscription)? Or Option C (hybrid)?
   - This is critical for pricing structure.

2. **Pricing**
   - Individual: $2-5 per assessment?
   - Starter: $49/month? Professional: $199/month?
   - Annual discount: 2 months free (as shown) or different?
   - Enterprise: Custom pricing or fixed tier?

3. **Free Trial:**
   - Offer 14-day trial for subscriptions?
   - Auto-charge after trial or require manual activation?

4. **Currencies:**
   - Primary currency: USD? NGN? Both?
   - Support multi-currency in MVP or Phase 2?

5. **Payment Methods:**
   - Paystack (mobile + card) only?
   - Add Stripe for international later?
   - Support bank transfers?

6. **Billing Frequency:**
   - Monthly subscriptions only, or monthly + annual?
   - Annual discount: How much?

7. **Refund Policy:**
   - 30-day money-back guarantee?
   - Or case-by-case review?
   - Pro-rata refunds for cancellations?

---

## ✅ Key Decisions Made (Conditional)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Payment Gateway** | Paystack | Supports Africa + global, easy integration |
| **Billing Model** | Hybrid (waiting for client approval) | Best revenue + flexibility |
| **Webhook vs Polling** | Webhooks | Real-time, more reliable |
| **Subscription Retry** | 3 retries over 7 days | Reduces churn, gives customers time |
| **Refund Window** | 30 days | Industry standard |
| **Currency** | USD + NGN (MVP) | Covers core markets |

---

## 📝 Next Steps

1. **Review payment strategy**
2. **Answer the 7 open questions**
3. **Lock pricing and business model**
4. Move to **Area 7: Result & Report System** (PDF generation)

**Time estimate:** 20 minutes to review, 20 minutes to answer questions (pricing decisions)

