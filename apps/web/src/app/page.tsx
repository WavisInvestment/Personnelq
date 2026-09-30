import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex-1">
      {/* Navigation */}
      <nav className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">Personality Badge</h1>
          <div className="space-x-4">
            <Link
              href="/auth/login"
              className="text-gray-600 hover:text-gray-900 transition"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-5xl font-bold mb-4">
          Discover Your True Self
        </h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Take a personality assessment, understand what it means, and share your unique personality badge with the world.
        </p>
        <Link
          href="/auth/signup"
          className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition"
        >
          Start Free Assessment (5 min)
        </Link>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4">
          <h3 className="text-3xl font-bold text-center mb-12">How It Works</h3>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '1', title: 'Discover', desc: 'Take a quick 5-minute personality snapshot' },
              { step: '2', title: 'Understand', desc: 'Get AI-generated insights about yourself' },
              { step: '3', title: 'Share', desc: 'Create a shareable personality badge' },
              { step: '4', title: 'Connect', desc: 'Understand how you relate to others' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="text-3xl font-bold text-primary-600 mb-2">{item.step}</div>
                <h4 className="font-semibold text-lg mb-2">{item.title}</h4>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-600">
          <p>&copy; 2026 Personality Badge. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
