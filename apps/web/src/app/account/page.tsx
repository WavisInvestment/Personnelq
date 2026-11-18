"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import {
  Field,
  PasswordChecklist,
  PasswordField,
  isPasswordValid,
} from "@/components/ui/field";
import {
  changeEmail,
  changePassword,
  deleteAccount,
  downloadMyData,
  getAccount,
  resendVerification,
  signOutEverywhere,
  updateProfile,
  type Account,
} from "@/lib/account";
import { readApiProblem } from "@/lib/assessments";
import { clearSession, getStoredUser } from "@/lib/auth";

function Section({
  id,
  title,
  intro,
  children,
  danger,
}: {
  id: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`border-t py-6 sm:py-8 ${danger ? "border-accent-400" : "border-line-strong"}`}
    >
      <h2 id={id} className="font-display text-xl font-medium">
        {title}
      </h2>
      {intro && (
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          {intro}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Runs one request and reports its outcome next to the form that asked for it. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const run = async (task: () => Promise<string | void>) => {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const message = await task();
      if (message) setDone(message);
      return true;
    } catch (err) {
      setError(readApiProblem(err).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, done, run };
}

function Messages({ error, done }: { error: string; done: string }) {
  return (
    <>
      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
      {done && (
        <Alert tone="success" className="mt-4">
          {done}
        </Alert>
      )}
    </>
  );
}

function ProfileForm({
  account,
  onSaved,
}: {
  account: Account;
  onSaved: () => void;
}) {
  const [first, setFirst] = useState(account.first_name);
  const [last, setLast] = useState(account.last_name);
  const { busy, error, done, run } = useAction();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const saved = await updateProfile({
        first_name: first.trim(),
        last_name: last.trim(),
      });
      const stored = getStoredUser();
      if (stored)
        localStorage.setItem("user", JSON.stringify({ ...stored, ...saved }));
      onSaved();
      return "Saved.";
    });
  };

  return (
    <form onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          minLength={2}
          maxLength={50}
          required
          autoComplete="given-name"
        />
        <Field
          label="Last name"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          minLength={2}
          maxLength={50}
          required
          autoComplete="family-name"
        />
      </div>
      <Messages error={error} done={done} />
      <Button
        type="submit"
        className="mt-5"
        loading={busy}
        disabled={
          first.trim() === account.first_name &&
          last.trim() === account.last_name
        }
      >
        Save name
      </Button>
    </form>
  );
}

function EmailForm({
  account,
  onChanged,
}: {
  account: Account;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const change = useAction();
  const resend = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    change.run(async () => {
      const r = await changeEmail({ email: email.trim(), password });
      setEmail("");
      setPassword("");
      onChanged();
      return r.email_status === "sent"
        ? `We sent a link to ${r.pending_email}. Your address changes when you click it.`
        : `Your address changes once ${r.pending_email} is confirmed, but email isn’t available right now.`;
    });
  };

  return (
    <div>
      <p className="text-[15px]">
        <span className="font-medium">{account.email}</span>{" "}
        <span
          className={
            account.email_verified ? "text-brand-700" : "text-accent-600"
          }
        >
          {account.email_verified ? "Confirmed" : "Not confirmed yet"}
        </span>
      </p>
      {!account.email_verified && (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            loading={resend.busy}
            onClick={() =>
              resend.run(async () =>
                (await resendVerification()).email_status === "sent"
                  ? "We sent you a new link."
                  : "Email isn’t available right now. Please try again later.",
              )
            }
          >
            Send the confirmation link again
          </Button>
          <Messages error={resend.error} done={resend.done} />
        </div>
      )}
      {account.pending_email && (
        <Alert tone="info" className="mt-4">
          Waiting for you to confirm {account.pending_email}. Until then you
          sign in with {account.email}.
        </Alert>
      )}

      {account.managed ? (
        <Alert tone="info" className="mt-6">
          This account was created from {account.managed_by}’s invitation, so
          its email address can’t be changed here. Ask {account.managed_by} if
          it needs to change.
        </Alert>
      ) : (
        <form onSubmit={submit} className="mt-6 max-w-md space-y-4">
          <Field
            label="New email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <PasswordField
            label="Current password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Messages error={change.error} done={change.done} />
          <Button
            type="submit"
            loading={change.busy}
            disabled={!email || !password}
          >
            Change email
          </Button>
        </form>
      )}
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [mismatch, setMismatch] = useState("");
  const { busy, error, done, run } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMismatch("");
    if (next !== confirmNext) return setMismatch("Passwords don’t match");
    run(async () => {
      await changePassword({
        current_password: current,
        password: next,
        password_confirm: confirmNext,
      });
      setCurrent("");
      setNext("");
      setConfirmNext("");
      return "Your password was changed. Every other device has been signed out.";
    });
  };

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <PasswordField
        label="Current password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
        autoComplete="current-password"
      />
      <div>
        <PasswordField
          label="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          autoComplete="new-password"
        />
        <PasswordChecklist value={next} />
      </div>
      <PasswordField
        label="Confirm new password"
        value={confirmNext}
        onChange={(e) => setConfirmNext(e.target.value)}
        error={mismatch}
        required
        autoComplete="new-password"
      />
      <Messages error={error} done={done} />
      <Button
        type="submit"
        loading={busy}
        disabled={!current || !isPasswordValid(next) || !confirmNext}
      >
        Change password
      </Button>
    </form>
  );
}

function AccountFlow() {
  const router = useRouter();
  const confirm = useConfirm();
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const signOut = useAction();
  const data = useAction();
  const remove = useAction();

  const load = useCallback(() => {
    getAccount()
      .then(setAccount)
      .catch((err) => setLoadError(readApiProblem(err).message));
  }, []);
  useEffect(load, [load]);

  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!account)
    return (
      <div
        className="h-96 animate-pulse border-t border-line"
        aria-hidden="true"
      />
    );

  const leaveEverywhere = async () => {
    const ok = await confirm({
      title: "Sign out of every device?",
      message:
        "You’ll be signed out here too and will need to sign in again. Use this if you think someone else has your password.",
      confirmLabel: "Sign out everywhere",
    });
    if (!ok) return;
    const done = await signOut.run(async () => {
      await signOutEverywhere();
    });
    if (done) {
      clearSession();
      router.replace("/auth/login");
    }
  };

  const removeAccount = async () => {
    const ok = await confirm({
      title: "Delete your account for good?",
      message:
        "Your results, answers, badges and company memberships are erased and can’t be brought back. Payment records are kept as the law requires, without your name.",
      confirmLabel: "Delete my account",
      tone: "danger",
    });
    if (!ok) return;
    const done = await remove.run(async () => {
      await deleteAccount(deletePassword);
    });
    if (done) {
      clearSession();
      router.replace("/");
    }
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <h1 className="font-display text-4xl font-medium leading-tight">
        Account
      </h1>
      <p className="mt-2 text-ink-muted">
        Your details, how you sign in, and what we keep.
      </p>

      <div className="mt-10 space-y-6">
        <Section id="profile" title="Your name">
          <ProfileForm account={account} onSaved={load} />
        </Section>

        <Section
          id="email"
          title="Email address"
          intro="We use it to sign you in and to send results, receipts and invitations. A change only takes effect once you confirm the new address."
        >
          <EmailForm account={account} onChanged={load} />
        </Section>

        <Section
          id="password"
          title="Password"
          intro="Changing it signs out every other device."
        >
          <PasswordForm />
        </Section>

        <Section
          id="devices"
          title="Where you’re signed in"
          intro={`You’re signed in on ${account.signed_in_devices} ${account.signed_in_devices === 1 ? "device" : "devices"}.`}
        >
          <Button
            variant="secondary"
            onClick={leaveEverywhere}
            loading={signOut.busy}
          >
            Sign out everywhere
          </Button>
          <Messages error={signOut.error} done={signOut.done} />
        </Section>

        <Section
          id="data"
          title="Your data"
          intro="Download a copy of everything we hold about you: your profile, answers, results, badges and payments, as one file."
        >
          <Button
            variant="secondary"
            onClick={() =>
              data.run(async () => {
                await downloadMyData(
                  `${account.first_name} ${account.last_name}`,
                );
                return "Your file has been saved.";
              })
            }
            loading={data.busy}
          >
            Download my data
          </Button>
          <Messages error={data.error} done={data.done} />
        </Section>

        <Section
          id="delete"
          danger
          title="Delete account"
          intro="This erases your account and everything in it. If you are the only administrator of a company with other people in it, make someone else an administrator first."
        >
          {account.managed ? (
            <Alert tone="info">
              This account was created from {account.managed_by}’s invitation,
              so it can’t be deleted here while you are part of{" "}
              {account.managed_by}. Ask {account.managed_by} if you need to be
              removed.
            </Alert>
          ) : (
            <div className="max-w-md space-y-4">
              <PasswordField
                label="Your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
                hint="We ask again so nobody else can do this from an open screen."
              />
              <Messages error={remove.error} done={remove.done} />
              <Button
                variant="secondary"
                className="border-accent-400 text-accent-600 hover:bg-accent-100"
                onClick={removeAccount}
                loading={remove.busy}
                disabled={!deletePassword}
              >
                Delete my account
              </Button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <AppShell>
      <AccountFlow />
    </AppShell>
  );
}
