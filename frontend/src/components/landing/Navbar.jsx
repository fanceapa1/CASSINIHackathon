import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

const Navbar = ({ onContactClick }) => {
  const { isAuthenticated } = useAuth();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-cyan-200/15 bg-[#030816]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6 lg:px-8">
        <a
          href="#hero"
          className="font-heading text-xl font-bold uppercase tracking-[0.08em] text-slate-100 sm:text-2xl"
        >
          Synoptis
        </a>

        <nav className="flex items-center gap-3 text-sm font-semibold sm:text-base">
          <Link
            to={isAuthenticated ? "/dashboard" : "/login"}
            className="rounded-full border border-cyan-100/25 bg-white/5 px-5 py-2 text-slate-100 transition hover:border-cyan-100/40 hover:bg-white/10"
          >
            {isAuthenticated ? "Dashboard" : "Log In"}
          </Link>
          <button
            type="button"
            onClick={onContactClick}
            className="rounded-full bg-cyan-300 px-5 py-2 text-slate-950 transition hover:bg-cyan-200"
          >
            Contact
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;