import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useScrambleText } from "../hooks/useScrambleText";

const HeroSection = ({ onPrimaryAction, onContactAction }) => {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-10% 0px" });
  const title = useScrambleText("Castopini - Platforma Impotriva Dezastrelor", isInView, 650);

  return (
    <section
      id="hero"
      ref={sectionRef}
      className="relative overflow-hidden px-6 pb-20 pt-36 sm:pt-40 lg:px-8 lg:pb-28"
    >
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_5%,rgba(78,212,255,0.2),transparent_38%),radial-gradient(circle_at_86%_18%,rgba(249,115,91,0.16),transparent_30%),linear-gradient(180deg,rgba(5,10,23,0.98)_0%,rgba(3,7,17,0.92)_100%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-cyan-100/30 to-transparent" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <motion.div
          initial={{ opacity: 0, x: -48 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.75, ease: "easeOut" }}
          className="space-y-8"
        >
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100/75">
            Incident Intelligence Platform
          </p>
          <h1 className="font-heading text-4xl font-bold uppercase leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="max-w-xl font-body text-base leading-relaxed text-slate-300 sm:text-lg">
            Monitorizare live, coordonare pe echipe si raspuns rapid intr-un singur tablou de control.
            Castopini conecteaza datele operationale cu decizii clare, atunci cand fiecare secunda
            conteaza.
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={onPrimaryAction}
              className="rounded-full bg-cyan-300 px-7 py-3 font-body text-sm font-bold uppercase tracking-[0.08em] text-slate-950 transition hover:bg-cyan-200 sm:text-base"
            >
              Descopera Platforma
            </button>
            <button
              type="button"
              onClick={onContactAction}
              className="rounded-full border border-cyan-100/35 bg-white/5 px-7 py-3 font-body text-sm font-semibold text-slate-100 transition hover:bg-white/10 sm:text-base"
            >
              Vorbeste Cu Echipa
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 48 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.85, ease: "easeOut", delay: 0.1 }}
          className="relative mx-auto h-[360px] w-[320px] sm:h-[420px] sm:w-[390px] lg:h-[500px] lg:w-[470px]"
        >
          <div className="absolute inset-0 rounded-[40%] bg-[radial-gradient(circle_at_30%_30%,#b5f4ff_0%,#3ab0d0_38%,#1e84aa_74%,#14556f_100%)] shadow-[0_0_120px_rgba(63,208,255,0.3)]" />
          <div className="absolute inset-[-8%] rounded-full border border-cyan-100/20" />
          <div className="absolute inset-[-16%] rotate-[17deg] rounded-full border border-cyan-100/10" />
          <div className="absolute left-[15%] top-[10%] h-[26%] w-[30%] rotate-[20deg] rounded-[55%_45%_60%_40%] bg-[#4da661]/90 blur-[0.1px]" />
          <div className="absolute right-[12%] top-[24%] h-[34%] w-[23%] rotate-[10deg] rounded-[45%_55%_40%_60%] bg-[#4da661]/90" />
          <div className="absolute bottom-[11%] left-[30%] h-[20%] w-[30%] rotate-[-18deg] rounded-[52%_48%_40%_60%] bg-[#4da661]/95" />
          <div className="absolute left-[20%] top-[22%] h-14 w-14 rounded-full bg-white/60 blur-md sm:h-20 sm:w-20" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
            className="absolute left-[0%] top-[17%] h-8 w-8"
          >
            <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-cyan-100" />
            <div className="absolute -left-4 top-1/2 h-2 w-4 -translate-y-1/2 rounded-sm bg-cyan-300/80" />
            <div className="absolute -right-4 top-1/2 h-2 w-4 -translate-y-1/2 rounded-sm bg-cyan-300/80" />
          </motion.div>
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[12%] right-[10%] h-7 w-7"
          >
            <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-cyan-100" />
            <div className="absolute -left-4 top-1/2 h-2 w-4 -translate-y-1/2 rounded-sm bg-cyan-300/80" />
            <div className="absolute -right-4 top-1/2 h-2 w-4 -translate-y-1/2 rounded-sm bg-cyan-300/80" />
          </motion.div>
          <motion.span
            initial={{ y: 0 }}
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -left-7 top-[22%] h-2 w-2 rounded-full bg-cyan-100/90 blur-[0.2px]"
          />
          <motion.span
            initial={{ y: 0 }}
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -right-6 top-[42%] h-2.5 w-2.5 rounded-full bg-white/85 blur-[0.2px]"
          />
          <motion.span
            initial={{ y: 0 }}
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 4.1, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-[8%] right-[6%] h-2 w-2 rounded-full bg-cyan-200/85 blur-[0.2px]"
          />
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
