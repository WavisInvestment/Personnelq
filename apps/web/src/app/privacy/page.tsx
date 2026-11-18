import type { Metadata } from 'next';
import { ContactLine, LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Personnelq collects, who can see it, and the choices you have.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      updated="7 October 2026"
      intro="Your personality results are personal. This page says what we keep, who can see it, which other services touch it, and what you control."
    >
      <h2>What we keep</h2>
      <ul>
        <li>Your account: name, email address and a scrambled (hashed) password. We never store your password itself.</li>
        <li>Your answers and results from the assessments you take, and any written insights generated for you.</li>
        <li>Payment records: what you paid for, the amount, the date and Paystack’s reference. We never see or store your card details.</li>
        <li>If you belong to a company, school or community: that membership, your department and job title if they were set, and a record of who invited you.</li>
        <li>A security record of sign-ins and of actions on company data, such as an administrator opening someone’s result.</li>
      </ul>

      <h2>Who can see your results</h2>
      <ul>
        <li><strong>Only you</strong>, by default. Results you take on your own are private to you.</li>
        <li><strong>Your company</strong>, but only for results you take through its invitation. The invitation tells you this before you join. Its administrators and HR can see those results; they cannot see anything you take privately.</li>
        <li><strong>Our support team</strong>, in a limited way, to help you when you ask. They can see your account details, which companies you belong to, which assessments you took and when, and your payments. They cannot see your scores, answers, written insights or badge link.</li>
        <li><strong>Anyone with your badge link</strong>, but only the parts you chose to show, and only while sharing is on. You can turn sharing off or retire the link at any time, and a retired link never works again.</li>
      </ul>
      <p>If you joined a company with an account you already had, you can leave it whenever you like from your dashboard. It stops seeing your results at once, and the results stay yours. An account that was created from a company’s invitation belongs to that company while you are part of it: it can’t leave, be deleted or change its email address, and the invitation says so before you sign up. If you want to keep control of your data, sign in with an account you already have instead of creating a new one. The company can remove you, which gives the account back to you.</p>

      <h2>Other services that handle data for us</h2>
      <ul>
        <li><strong>Paystack</strong> processes payments. They receive your email address and the amount.</li>
        <li><strong>Anthropic (Claude)</strong> writes the short analysis on the free snapshot and the written insights on the full assessment. Only your five dimension scores and your class are sent. Your name, email and everything else about you are not.</li>
        <li><strong>Resend</strong> delivers our emails (receipts, invitations, reminders, password resets and reports you ask for).</li>
      </ul>

      <h2>Cookies and tracking</h2>
      <p>We don’t use advertising or analytics trackers. To keep you signed in, your browser stores a sign-in token for this site. That is the only thing we store there, which is why there is no cookie banner.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Download your report as a PDF, or have it emailed to you, whenever you like.</li>
        <li>Switch your badge on and off, choose what it shows, and set when it expires.</li>
        <li>Leave a company at any time, if you joined it with an account you already had. An account created from a company’s invitation stays with that company until the company removes you.</li>
        <li>Download a copy of everything we hold about you, or (unless the account was created from a company’s invitation) delete your account, from the Account page. Deleting erases your results, answers, badges and company memberships. Payment records are kept as the law requires, without your name.</li>
        <li>Change your name, email address or password, or sign out of every device, from the same page.</li>
      </ul>
      <ContactLine />

      <h2>Keeping it safe</h2>
      <p>Passwords are hashed, connections are encrypted, and access to company data is checked on every request. Payment confirmations are verified directly with Paystack, not taken from the browser. If something about this page is unclear, please say so and we’ll fix the wording.</p>
    </LegalPage>
  );
}
