import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import GlobeComponent from "./GlobeComponent";
import ScrambleTitle from "./ScrambleTitle";

const HeroSection = ({ onPrimaryAction, onContactAction }) => {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-10% 0px" });

  return (
    <section
      id="hero"
      ref={sectionRef}
      className="relative px-6 pb-20 pt-36 sm:pt-40 lg:px-8 lg:pb-28"
      style={{ overflow: "clip" }}
    >
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_5%,rgba(78,212,255,0.2),transparent_38%),radial-gradient(circle_at_86%_18%,rgba(249,115,91,0.16),transparent_30%),linear-gradient(180deg,rgba(5,10,23,0.98)_0%,rgba(3,7,17,0.92)_100%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-cyan-100/30 to-transparent" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-2">
        {/* Text */}
        <motion.div
          initial={{ opacity: 0, x: -48 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.75, ease: "easeOut" }}
          className="space-y-8"
        >
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100/75">
            Incident Intelligence Platform
          </p>
          <ScrambleTitle
            as="h1"
            text="Castopini - Platforma Impotriva Dezastrelor"
            delay={650}
            once={true}
            className="font-heading text-4xl font-bold uppercase leading-[1.05] text-white sm:text-5xl lg:text-6xl"
          />
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

        {/* Globe */}
        <motion.div
          initial={{ opacity: 0, x: 48 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.85, ease: "easeOut", delay: 0.1 }}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
          }}
        >
          <GlobeComponent className="absolute inset-0" />
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;