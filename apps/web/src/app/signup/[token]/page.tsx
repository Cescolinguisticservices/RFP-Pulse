import { SignupForm } from './signup-form';

export const dynamic = 'force-dynamic';

export default function SignupPage({ params }: { params: { token: string } }): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign up for RFP Pulse</h1>
        <p className="text-sm text-neutral-500">
          Create your company&rsquo;s workspace. This invite link is single-use.
        </p>
      </header>
      <SignupForm token={params.token} />
    </main>
  );
}
