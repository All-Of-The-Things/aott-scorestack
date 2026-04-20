export default function AppFooter() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">ScoreStack</span>
        <span className="text-xs text-gray-400">
          © {new Date().getFullYear()} ScoreStack
        </span>
      </div>
    </footer>
  )
}
