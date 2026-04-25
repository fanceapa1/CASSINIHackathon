import { LayoutGroup, motion } from "framer-motion";
import { useRef } from "react";
import ContactSection from "./components/ContactSection";
import FeatureSection from "./components/FeatureSection";
import HeroSection from "./components/HeroSection";
import Navbar from "./components/Navbar";
import PricingSection from "./components/PricingSection";
import { featureSections } from "./data/featureSections";

const App = () => {
  const featuresRef = useRef(null);
  const contactRef = useRef(null);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToContact = () => {
    contactRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#04070f] text-slate-100">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-30 space-sky" />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 stars-layer" />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 stars-layer stars-layer--far" />

      <Navbar onContactClick={scrollToContact} />

      <main className="relative z-10">
        <HeroSection onPrimaryAction={scrollToFeatures} onContactAction={scrollToContact} />

        <section id="features" ref={featuresRef} aria-label="Functionalitati" className="scroll-mt-28">
          <LayoutGroup id="feature-flow">
            <motion.div layout className="space-y-2">
              {featureSections.map((section, index) => (
                <FeatureSection key={section.id} section={section} reverse={index % 2 === 1} />
              ))}
            </motion.div>
          </LayoutGroup>
        </section>

        <PricingSection onContactClick={scrollToContact} />
      </main>

      <ContactSection sectionRef={contactRef} />
    </div>
  );
};

export default App;
