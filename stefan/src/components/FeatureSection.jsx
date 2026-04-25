import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useScrambleText } from "../hooks/useScrambleText";

const FeatureSection = ({ section, reverse }) => {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, {
    amount: 0.45,
    margin: "-12% 0px -10% 0px"
  });
  const title = useScrambleText(section.title, isInView);

  return (
    <motion.section
      id={section.id}
      ref={sectionRef}
      layout
      transition={{ layout: { duration: 0.65, ease: "easeInOut" } }}
      className="relative mx-auto grid w-full max-w-6xl scroll-mt-28 items-center gap-8 px-6 py-12 sm:gap-12 lg:grid-cols-2 lg:px-8 lg:py-20"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-20 top-8 -z-10 h-40 blur-3xl ${
          reverse
            ? "bg-[radial-gradient(circle,rgba(249,115,91,0.2)_0%,transparent_70%)]"
            : "bg-[radial-gradient(circle,rgba(74,214,255,0.2)_0%,transparent_70%)]"
        }`}
      />

      <motion.div
        layout
        initial={{ opacity: 0, x: reverse ? 50 : -50 }}
        animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0.3 }}
        transition={{ duration: 0.65, ease: "easeOut" }}
        className={`${
          reverse ? "lg:order-2" : "lg:order-1"
        } overflow-hidden rounded-[28px] border border-cyan-100/20 bg-[#071329]/70 p-3 shadow-[0_30px_60px_-35px_rgba(0,0,0,0.8)]`}
      >
        <img
          src={section.image}
          alt={section.imageAlt}
          className="h-[260px] w-full rounded-[20px] object-cover brightness-95 sm:h-[340px] lg:h-[380px]"
          loading="lazy"
        />
      </motion.div>

      <motion.div
        layout
        initial={{ opacity: 0, x: reverse ? -50 : 50 }}
        animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0.3 }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.08 }}
        className={`${reverse ? "lg:order-1" : "lg:order-2"} space-y-6`}
      >
        <h2 className="font-heading text-3xl font-bold uppercase tracking-[0.04em] text-slate-100 sm:text-4xl">
          {title}
        </h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0 }}
          transition={{ duration: 0.55, delay: 0.2, ease: "easeOut" }}
          className="max-w-xl font-body text-base leading-relaxed text-slate-300 sm:text-lg"
        >
          {section.description}
        </motion.p>
      </motion.div>
    </motion.section>
  );
};

export default FeatureSection;
