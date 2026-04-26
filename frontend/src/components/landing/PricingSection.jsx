import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import ScrambleTitle from "./ScrambleTitle";

const PricingSection = ({ onContactClick }) => {
  const sectionRef = useRef(null);
  
  // Am scos 'once: true'
  const isInView = useInView(sectionRef, { 
      amount: 0.2, 
      margin: "-10% 0px" 
  });

  return (
    <section
      id="pricing"
      ref={sectionRef}
      className="scroll-mt-28 border-y border-cyan-100/10 bg-[linear-gradient(180deg,rgba(4,10,24,0)_0%,rgba(5,14,32,0.78)_22%,rgba(5,14,32,0.78)_78%,rgba(4,10,24,0)_100%)] px-6 py-16 lg:px-8 lg:py-24"
    >
      <div className="mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-10 text-center will-change-transform"
        >
          <ScrambleTitle
            as="h2"
            text="Pricing"
            className="font-heading text-3xl font-bold uppercase tracking-[0.04em] text-slate-100 sm:text-4xl"
          />
          <p className="mx-auto mt-4 max-w-2xl font-body text-base text-slate-300 sm:text-lg">
            Choose the right plan for your team and expand functionalities as your operations grow.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2">
          <motion.article
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0 }}
            transition={{ duration: 0.62, delay: 0.1, ease: "easeOut" }}
            className="rounded-[26px] border border-cyan-100/20 bg-[#071326]/80 p-8 shadow-[0_26px_60px_-38px_rgba(0,0,0,0.9)] backdrop-blur will-change-transform"
          >
            <h3 className="font-heading text-2xl font-bold uppercase text-slate-100">Free Plan</h3>
            <p className="mt-3 font-body text-slate-300">
              For small teams wanting quick control over essential alerts.
            </p>
            <ul className="mt-6 space-y-3 font-body text-sm text-slate-300 sm:text-base">
              <li>- Real-time monitoring dashboard</li>
              <li>- Basic notifications for critical alerts</li>
              <li>- Limited incident history</li>
              <li>- 3 active users</li>
            </ul>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0 }}
            transition={{ duration: 0.62, delay: 0.18, ease: "easeOut" }}
            className="rounded-[26px] border border-cyan-200/25 bg-[linear-gradient(155deg,rgba(6,22,42,0.95)_0%,rgba(8,31,56,0.9)_72%,rgba(30,79,112,0.52)_100%)] p-8 shadow-[0_26px_60px_-38px_rgba(0,0,0,0.92)] will-change-transform"
          >
            <h3 className="font-heading text-2xl font-bold uppercase text-slate-100">Paid Plan</h3>
            <p className="mt-3 font-body text-slate-200">
              For organizations that need to scale, with automation and advanced AI capabilities.
            </p>
            <ul className="mt-6 space-y-3 font-body text-sm text-slate-200 sm:text-base">
              <li>- Multiple specialized AI agent profiles</li>
              <li>- Automated escalation and priority rules</li>
              <li>- Custom AI agent integration</li>
              <li>- Enterprise security and complete audit logging</li>
            </ul>
            <button
              type="button"
              onClick={onContactClick}
              className="mt-8 rounded-full bg-cyan-300 px-6 py-3 font-body text-sm font-bold uppercase tracking-[0.08em] text-slate-950 transition hover:bg-cyan-200 sm:text-base"
            >
              Contact us for a quote
            </button>
          </motion.article>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;